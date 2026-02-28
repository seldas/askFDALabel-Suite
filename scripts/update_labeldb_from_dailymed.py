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
        # We'll use sum_spl directly for duplicate checks (set_id + revised_date)
        conn.commit()
        conn.close()

    def strip_tags(self, text):
        if not text: return ""
        return re.sub(r'<[^>]*>', ' ', text).strip()

    def get_text(self, element):
        if element is None: return ""
        return ET.tostring(element, encoding='unicode', method='text').strip()

    def get_xml(self, element):
        if element is None: return ""
        return ET.tostring(element, encoding='unicode').strip()

    def print_progress(self, current, total, processed, skipped, prefix='Progress', length=40):
        """Visual text-based progress bar."""
        percent = ("{0:.1f}").format(100 * (current / float(total)))
        filled_length = int(length * current // total)
        bar = '█' * filled_length + '-' * (length - filled_length)
        # Add counters to the status line
        status = f"| Processed: {processed} | Skipped: {skipped}"
        sys.stdout.write(f'\r{prefix} |{bar}| {percent}% {status}')
        sys.stdout.flush()
        if current == total: 
            print()

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
            if cursor.fetchone():
                continue

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
        """Static worker function for multiprocessing."""
        try:
            # We need to re-import these inside the worker for multiprocessing on Windows
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
            spl_id_el = root.find('ns:id', NS)
            set_id_el = root.find('ns:setId', NS)
            spl_id = spl_id_el.get('root') if spl_id_el is not None else None
            set_id = set_id_el.get('root') if set_id_el is not None else None
            
            if not spl_id or not set_id: return None

            eff_time_el = root.find('ns:effectiveTime', NS)
            eff_val = eff_time_el.get('value') if eff_time_el is not None else ""
            revised_date = f"{eff_val[:4]}-{eff_val[4:6]}-{eff_val[6:8]}" if len(eff_val) >= 8 else eff_val

            # Detailed parse
            doc_type_el = root.find('ns:code', NS)
            doc_type = doc_type_el.get('displayName') if doc_type_el is not None else ""

            # Minimal helper inside worker
            def get_el_text(el):
                if el is None: return ""
                return "".join(el.itertext()).strip()

            title_text = get_el_text(root.find('ns:title', NS))
            appr_year_match = re.search(r'Initial U.S. Approval:\s*(\d{4})', title_text)
            initial_approval_year = int(appr_year_match.group(1)) if appr_year_match else None

            manufacturer = ""
            author_org = root.find('.//ns:author/ns:assignedEntity/ns:representedOrganization/ns:name', NS)
            if author_org is not None: manufacturer = author_org.text

            product_names, generic_names, active_ingredients, dosage_forms, ndc_codes, routes, appr_nums = [], [], [], [], [], [], []
            ingr_map = []
            
            products = root.findall('.//ns:manufacturedProduct/ns:manufacturedProduct', NS)
            for prod in products:
                name_el = prod.find('ns:name', NS)
                if name_el is not None: product_names.append(get_el_text(name_el))
                gen_name_el = prod.find('.//ns:genericMedicine/ns:name', NS)
                if gen_name_el is not None: generic_names.append(gen_name_el.text)
                form_el = prod.find('ns:formCode', NS)
                if form_el is not None: dosage_forms.append(form_el.get('displayName'))
                ndc_el = prod.find('ns:code', NS)
                if ndc_el is not None: ndc_codes.append(ndc_el.get('code'))
                ingrs = prod.findall('ns:ingredient', NS)
                for ingr in ingrs:
                    class_code = ingr.get('classCode')
                    subst = ingr.find('ns:ingredientSubstance/ns:name', NS)
                    if subst is not None:
                        is_active = 1 if class_code in ['ACTIM', 'ACTIB'] else 0
                        sub_name = subst.text
                        if is_active: active_ingredients.append(sub_name)
                        ingr_map.append((spl_id, sub_name, is_active))
                route_els = prod.findall('.//ns:routeCode', NS)
                for rel in route_els: routes.append(rel.get('displayName'))

            appr_el = root.find('.//ns:approval/ns:id', NS)
            if appr_el is not None: appr_nums.append(appr_el.get('extension'))

            sections_to_db, sections_to_fts = [], []
            sections = root.findall('.//ns:section', NS)
            for sec in sections:
                code_el = sec.find('ns:code', NS)
                loinc = code_el.get('code') if code_el is not None else ""
                title = get_el_text(sec.find('ns:title', NS))
                text_el = sec.find('ns:text', NS)
                if text_el is not None:
                    raw_xml = ET.tostring(text_el, encoding='unicode').strip()
                    plain_text = re.sub(r'<[^>]*>', ' ', raw_xml).strip()
                    sections_to_db.append((spl_id, loinc, title, raw_xml))
                    sections_to_fts.append((spl_id, loinc, title, plain_text))

            return {
                'spl_id': spl_id, 'set_id': set_id, 'revised_date': revised_date,
                'product_names': "; ".join(set(product_names)), 'generic_names': "; ".join(set(generic_names)),
                'manufacturer': manufacturer, 'appr_nums': "; ".join(set(appr_nums)),
                'active_ingredients': "; ".join(set(active_ingredients)), 'doc_type': doc_type,
                'routes': "; ".join(set(routes)), 'dosage_forms': "; ".join(set(dosage_forms)),
                'initial_approval_year': initial_approval_year, 'local_rel_path': os.path.basename(file_path),
                'ingr_map': ingr_map, 'sections_to_db': sections_to_db, 'sections_to_fts': sections_to_fts
            }
        except Exception:
            return None

    def update_db_from_storage(self):
        """Phase 2: Process individual ZIPs in storage folder and sync to DB."""
        all_zips = [os.path.join(self.storage_dir, f) for f in os.listdir(self.storage_dir) if f.endswith('.zip')]
        if not all_zips:
            print("No individual SPL ZIPs found in storage.")
            return

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Get existing (set_id, revised_date) pairs for skipping
        cursor.execute("SELECT set_id, revised_date FROM sum_spl")
        existing_records = { (row[0], row[1]) for row in cursor.fetchall() }
        conn.close()

        total_files = len(all_zips)
        print(f"Scanning {total_files} ZIPs in storage...")
        
        processed_count = 0
        skipped_count = 0
        batch_size = 100
        
        # Re-open connection for writing
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        num_workers = multiprocessing.cpu_count()
        with ProcessPoolExecutor(max_workers=num_workers) as executor:
            futures = {executor.submit(self.parse_spl_worker, f): f for f in all_zips}
            
            for i, future in enumerate(as_completed(futures)):
                data = future.result()
                if not data: 
                    # Consider failed parse as skipped or error
                    continue
                
                # Uniqueness Check: same set_id AND same revised_date
                if (data['set_id'], data['revised_date']) in existing_records:
                    skipped_count += 1
                else:
                    spl_id = data['spl_id']
                    # Sync to DB
                    cursor.execute("DELETE FROM spl_sections WHERE spl_id = ?", (spl_id,))
                    cursor.execute("DELETE FROM spl_sections_search WHERE spl_id = ?", (spl_id,))
                    cursor.execute("DELETE FROM active_ingredients_map WHERE spl_id = ?", (spl_id,))

                    cursor.execute("""
                        INSERT OR REPLACE INTO sum_spl (
                            spl_id, set_id, product_names, generic_names, manufacturer, 
                            appr_num, active_ingredients, market_categories, doc_type, 
                            routes, dosage_forms, revised_date, initial_approval_year,
                            local_path
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        spl_id, data['set_id'], data['product_names'], data['generic_names'], data['manufacturer'],
                        data['appr_nums'], data['active_ingredients'], "", data['doc_type'],
                        data['routes'], data['dosage_forms'], data['revised_date'], data['initial_approval_year'],
                        data['local_rel_path']
                    ))

                    if data['ingr_map']:
                        cursor.executemany("INSERT INTO active_ingredients_map (spl_id, substance_name, is_active) VALUES (?, ?, ?)", data['ingr_map'])
                    if data['sections_to_db']:
                        cursor.executemany("INSERT INTO spl_sections (spl_id, loinc_code, title, content_xml) VALUES (?, ?, ?, ?)", data['sections_to_db'])
                    if data['sections_to_fts']:
                        cursor.executemany("INSERT INTO spl_sections_search (spl_id, loinc_code, title, content_text) VALUES (?, ?, ?, ?)", data['sections_to_fts'])
                    
                    existing_records.add((data['set_id'], data['revised_date']))
                    processed_count += 1

                # Update visual progress bar every 10 files or on complete
                if (i + 1) % 10 == 0 or (i + 1) == total_files:
                    self.print_progress(i + 1, total_files, processed_count, skipped_count)
                
                # Batch commit
                if processed_count > 0 and processed_count % batch_size == 0:
                    conn.commit()

        conn.commit()
        conn.close()
        print(f"\nFinished. Added {processed_count} new records, skipped {skipped_count} existing.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Industrial update of label.db with progress monitoring.")
    parser.add_argument("--filter", choices=['prescription', 'human', 'all'], default='human', help="Filter records to import")
    args = parser.parse_args()

    updater = LabelDBUpdater()
    
    print("--- Phase 1: Unpacking Bulk ZIPs ---")
    updater.unpack_all_bulk_zips(filter_type=args.filter)
    
    print("\n--- Phase 2: Syncing Metadata to Database ---")
    updater.update_db_from_storage()
