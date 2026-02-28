import sqlite3
import xml.etree.ElementTree as ET
import os
import glob
import re
import zipfile
import io
import argparse
import sys
from datetime import datetime
from concurrent.futures import ProcessPoolExecutor, as_completed
import multiprocessing

# Namespace for SPL XML
NS = {'ns': 'urn:hl7-org:v3'}

class LabelDBUpdater:
    def __init__(self, db_path="data/label.db", storage_dir="data/spl_storage", downloads_dir="data/downloads/dailymed"):
        self.db_path = db_path
        self.storage_dir = storage_dir
        self.downloads_dir = downloads_dir
        os.makedirs(self.storage_dir, exist_ok=True)
        self._init_tracking_tables()

    def _init_tracking_tables(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS processed_zips (
                zip_name TEXT PRIMARY KEY,
                processed_at TEXT
            )
        """)
        conn.commit()
        conn.close()

    def print_progress(self, current, total, processed, skipped, prefix='Progress', length=40):
        """Visual text-based progress bar."""
        percent = ("{0:.1f}").format(100 * (current / float(total)))
        filled_length = int(length * current // total)
        bar = '█' * filled_length + '-' * (length - filled_length)
        status = f"| Processed: {processed} | Skipped: {skipped}"
        sys.stdout.write(f'\r{prefix} |{bar}| {percent}% {status}')
        sys.stdout.flush()
        if current == total: print()

    def unpack_all_bulk_zips(self, filter_type='human'):
        """Phase 1: Extract nested ZIPs from all bulk files in downloads folder."""
        bulk_zips = glob.glob(os.path.join(self.downloads_dir, "*.zip"))
        if not bulk_zips:
            print(f"No bulk ZIP files found in {self.downloads_dir}")
            return

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        filter_map = {
            'prescription': ['prescription/'],
            'human': ['prescription/', 'otc/', 'homeopathic/', 'other/'],
            'all': ['']
        }
        prefixes = filter_map.get(filter_type, [''])

        for zip_path in bulk_zips:
            zip_name = os.path.basename(zip_path)
            cursor.execute("SELECT 1 FROM processed_zips WHERE zip_name = ?", (zip_name,))
            if cursor.fetchone(): continue

            print(f"Unpacking bulk ZIP: {zip_name}...")
            try:
                with zipfile.ZipFile(zip_path, 'r') as main_z:
                    all_members = main_z.namelist()
                    nested_zips = [f for f in all_members if f.endswith('.zip') and any(f.startswith(p) for p in prefixes)]
                    
                    for nz_name in nested_zips:
                        inner_name = os.path.basename(nz_name)
                        out_path = os.path.join(self.storage_dir, inner_name)
                        if not os.path.exists(out_path):
                            with main_z.open(nz_name) as source, open(out_path, 'wb') as target:
                                target.write(source.read())
                
                cursor.execute("INSERT INTO processed_zips (zip_name, processed_at) VALUES (?, ?)", 
                             (zip_name, datetime.now().isoformat()))
                conn.commit()
            except Exception as e:
                print(f"Error unpacking {zip_name}: {e}")
        conn.close()

    @staticmethod
    def parse_spl_worker(file_path):
        """Worker function for multiprocessing."""
        try:
            import xml.etree.ElementTree as ET
            import zipfile
            import re
            NS = {'ns': 'urn:hl7-org:v3'}
            
            with zipfile.ZipFile(file_path, 'r') as z:
                xml_files = [f for f in z.namelist() if f.endswith('.xml')]
                if not xml_files: return None
                with z.open(xml_files[0]) as f:
                    xml_content = f.read()
                    
            root = ET.fromstring(xml_content)
            spl_id = (root.find('ns:id', NS).get('root')) if root.find('ns:id', NS) is not None else None
            set_id = (root.find('ns:setId', NS).get('root')) if root.find('ns:setId', NS) is not None else None
            if not spl_id or not set_id: return None

            eff_val = root.find('ns:effectiveTime', NS).get('value') if root.find('ns:effectiveTime', NS) is not None else ""
            revised_date = f"{eff_val[:4]}-{eff_val[4:6]}-{eff_val[6:8]}" if len(eff_val) >= 8 else eff_val

            doc_type = root.find('ns:code', NS).get('displayName') if root.find('ns:code', NS) is not None else ""
            
            def get_el_text(el):
                return "".join(el.itertext()).strip() if el is not None else ""

            title_text = get_el_text(root.find('ns:title', NS))
            appr_match = re.search(r'Initial U.S. Approval:\s*(\d{4})', title_text)
            initial_approval_year = int(appr_match.group(1)) if appr_match else None

            manufacturer = ""
            author_org = root.find('.//ns:author/ns:assignedEntity/ns:representedOrganization/ns:name', NS)
            if author_org is not None: manufacturer = author_org.text

            product_names, generic_names, active_ingredients, dosage_forms, ndc_codes, routes, appr_nums = [], [], [], [], [], [], []
            ingr_map = []
            
            products = root.findall('.//ns:manufacturedProduct/ns:manufacturedProduct', NS)
            for prod in products:
                if (name_el := prod.find('ns:name', NS)) is not None: product_names.append(get_el_text(name_el))
                if (gen_name_el := prod.find('.//ns:genericMedicine/ns:name', NS)) is not None: generic_names.append(gen_name_el.text)
                if (form_el := prod.find('ns:formCode', NS)) is not None: dosage_forms.append(form_el.get('displayName'))
                if (ndc_el := prod.find('ns:code', NS)) is not None: ndc_codes.append(ndc_el.get('code'))
                for ingr in prod.findall('ns:ingredient', NS):
                    class_code = ingr.get('classCode')
                    if (subst := ingr.find('ns:ingredientSubstance/ns:name', NS)) is not None:
                        is_active = 1 if class_code in ['ACTIM', 'ACTIB'] else 0
                        if is_active: active_ingredients.append(subst.text)
                        ingr_map.append((spl_id, subst.text, is_active))
                for rel in prod.findall('.//ns:routeCode', NS): routes.append(rel.get('displayName'))

            if (appr_el := root.find('.//ns:approval/ns:id', NS)) is not None: appr_nums.append(appr_el.get('extension'))

            sections_db, sections_fts = [], []
            for sec in root.findall('.//ns:section', NS):
                loinc = (sec.find('ns:code', NS).get('code')) if sec.find('ns:code', NS) is not None else ""
                title = get_el_text(sec.find('ns:title', NS))
                if (text_el := sec.find('ns:text', NS)) is not None:
                    raw_xml = ET.tostring(text_el, encoding='unicode').strip()
                    plain_text = re.sub(r'<[^>]*>', ' ', raw_xml).strip()
                    sections_db.append((spl_id, loinc, title, raw_xml))
                    sections_fts.append((spl_id, loinc, title, plain_text))

            return {
                'spl_id': spl_id, 'set_id': set_id, 'revised_date': revised_date,
                'product_names': "; ".join(set(product_names)), 'generic_names': "; ".join(set(generic_names)),
                'manufacturer': manufacturer, 'appr_nums': "; ".join(set(appr_nums)),
                'active_ingredients': "; ".join(set(active_ingredients)), 'doc_type': doc_type,
                'routes': "; ".join(set(routes)), 'dosage_forms': "; ".join(set(dosage_forms)),
                'initial_approval_year': initial_approval_year, 'local_rel_path': os.path.basename(file_path),
                'ingr_map': ingr_map, 'sections_db': sections_db, 'sections_fts': sections_fts
            }
        except Exception: return None

    def update_db_from_storage(self, turbo=False):
        """Phase 2: Process individual ZIPs in storage folder and sync to DB."""
        all_zips = [os.path.join(self.storage_dir, f) for f in os.listdir(self.storage_dir) if f.endswith('.zip')]
        if not all_zips:
            print("No individual SPL ZIPs found in storage.")
            return

        # Initial fast check for existing records
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT set_id, revised_date FROM sum_spl")
        existing_records = { (row['set_id'], row['revised_date']) for row in cursor.fetchall() }
        
        if turbo:
            print("Turbo Mode Enabled: Disabling safety features for speed.")
            conn.execute("PRAGMA synchronous = OFF")
            conn.execute("PRAGMA journal_mode = MEMORY")
            conn.execute("PRAGMA temp_store = MEMORY")
            conn.execute("PRAGMA cache_size = 50000")
            batch_size = 1000
        else:
            batch_size = 100

        total_files = len(all_zips)
        print(f"Processing {total_files} ZIPs with batch size {batch_size}...")
        
        processed_count = 0
        skipped_count = 0
        
        # Buffer for bulk operations
        buffer_sum_spl = []
        buffer_ingr = []
        buffer_sec_db = []
        buffer_sec_fts = []
        buffer_spl_ids = []

        num_workers = multiprocessing.cpu_count()
        with ProcessPoolExecutor(max_workers=num_workers) as executor:
            futures = {executor.submit(self.parse_spl_worker, f): f for f in all_zips}
            
            for i, future in enumerate(as_completed(futures)):
                data = future.result()
                if not data: continue
                
                if (data['set_id'], data['revised_date']) in existing_records:
                    skipped_count += 1
                else:
                    spl_id = data['spl_id']
                    buffer_spl_ids.append(spl_id)
                    buffer_sum_spl.append((
                        spl_id, data['set_id'], data['product_names'], data['generic_names'], data['manufacturer'],
                        data['appr_nums'], data['active_ingredients'], "", data['doc_type'],
                        data['routes'], data['dosage_forms'], data['revised_date'], data['initial_approval_year'],
                        data['local_rel_path']
                    ))
                    if data['ingr_map']: buffer_ingr.extend(data['ingr_map'])
                    if data['sections_db']: buffer_sec_db.extend(data['sections_db'])
                    if data['sections_fts']: buffer_sec_fts.extend(data['sections_fts'])
                    
                    existing_records.add((data['set_id'], data['revised_date']))
                    processed_count += 1

                # Flush Buffers
                if len(buffer_sum_spl) >= batch_size or (i + 1) == total_files:
                    if buffer_spl_ids:
                        # Batch Delete
                        placeholders = ','.join(['?'] * len(buffer_spl_ids))
                        cursor.execute(f"DELETE FROM spl_sections WHERE spl_id IN ({placeholders})", buffer_spl_ids)
                        cursor.execute(f"DELETE FROM spl_sections_search WHERE spl_id IN ({placeholders})", buffer_spl_ids)
                        cursor.execute(f"DELETE FROM active_ingredients_map WHERE spl_id IN ({placeholders})", buffer_spl_ids)
                        
                        # Batch Insert
                        cursor.executemany("INSERT OR REPLACE INTO sum_spl VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", buffer_sum_spl)
                        if buffer_ingr: cursor.executemany("INSERT INTO active_ingredients_map VALUES (?,?,?)", buffer_ingr)
                        if buffer_sec_db: cursor.executemany("INSERT INTO spl_sections VALUES (?,?,?,?)", buffer_sec_db)
                        if buffer_sec_fts: cursor.executemany("INSERT INTO spl_sections_search VALUES (?,?,?,?)", buffer_sec_fts)
                        
                        conn.commit()
                        
                        # Clear buffers
                        buffer_sum_spl, buffer_ingr, buffer_sec_db, buffer_sec_fts, buffer_spl_ids = [], [], [], [], []

                if (i + 1) % 20 == 0 or (i + 1) == total_files:
                    self.print_progress(i + 1, total_files, processed_count, skipped_count)

        conn.close()
        print(f"\nFinished. Processed: {processed_count}, Skipped: {skipped_count}.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Turbo-charged DailyMed Ingestion.")
    parser.add_argument("--filter", choices=['prescription', 'human', 'all'], default='human')
    parser.add_argument("--turbo", action="store_true", help="Enable high-speed mode (synchronous=OFF, batching)")
    args = parser.parse_args()

    updater = LabelDBUpdater()
    print("--- Phase 1: Unpacking ---")
    updater.unpack_all_bulk_zips(filter_type=args.filter)
    print("\n--- Phase 2: Database Update ---")
    updater.update_db_from_storage(turbo=args.turbo)
