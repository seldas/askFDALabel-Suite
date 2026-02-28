import sqlite3
import xml.etree.ElementTree as ET
import os
import glob
import re
import zipfile
import io
import argparse
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
        # Track bulk zips unpacked
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS processed_zips (
                zip_name TEXT PRIMARY KEY,
                processed_at TEXT
            )
        """)
        # Track individual SPLs parsed into DB
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS processed_files (
                file_id TEXT PRIMARY KEY,
                processed_at TEXT
            )
        """)
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
                print(f"Skipping already unpacked bulk ZIP: {zip_name}")
                continue

            print(f"Unpacking bulk ZIP: {zip_name}...")
            try:
                with zipfile.ZipFile(zip_path, 'r') as main_z:
                    all_members = main_z.namelist()
                    nested_zips = [f for f in all_members if f.endswith('.zip') and any(f.startswith(p) for p in prefixes)]
                    
                    for nz_name in nested_zips:
                        # Extract the inner zip directly to storage_dir
                        # We use the filename part only to keep storage flat
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

    def parse_spl_file(self, file_path):
        """Worker function to parse a single SPL ZIP file and return data dict."""
        try:
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

            # Basic Metadata
            effective_time = root.find('ns:effectiveTime', NS).get('value') if root.find('ns:effectiveTime', NS) is not None else ""
            revised_date = f"{effective_time[:4]}-{effective_time[4:6]}-{effective_time[6:8]}" if len(effective_time) >= 8 else effective_time
            
            doc_type_el = root.find('ns:code', NS)
            doc_type = doc_type_el.get('displayName') if doc_type_el is not None else ""

            title_text = self.get_text(root.find('ns:title', NS))
            appr_year_match = re.search(r'Initial U.S. Approval:\s*(\d{4})', title_text)
            initial_approval_year = int(appr_year_match.group(1)) if appr_year_match else None

            manufacturer = ""
            author_org = root.find('.//ns:author/ns:assignedEntity/ns:representedOrganization/ns:name', NS)
            if author_org is not None:
                manufacturer = author_org.text

            product_names, generic_names, active_ingredients, dosage_forms, ndc_codes, routes, appr_nums = [], [], [], [], [], [], []
            ingr_map = []
            
            products = root.findall('.//ns:manufacturedProduct/ns:manufacturedProduct', NS)
            for prod in products:
                name_el = prod.find('ns:name', NS)
                if name_el is not None: product_names.append(self.get_text(name_el))
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
                title = self.get_text(sec.find('ns:title', NS))
                text_el = sec.find('ns:text', NS)
                if text_el is not None:
                    raw_xml = self.get_xml(text_el)
                    plain_text = self.strip_tags(raw_xml)
                    sections_to_db.append((spl_id, loinc, title, raw_xml))
                    sections_to_fts.append((spl_id, loinc, title, plain_text))

            return {
                'spl_id': spl_id,
                'set_id': set_id,
                'product_names': "; ".join(set(product_names)),
                'generic_names': "; ".join(set(generic_names)),
                'manufacturer': manufacturer,
                'appr_nums': "; ".join(set(appr_nums)),
                'active_ingredients': "; ".join(set(active_ingredients)),
                'doc_type': doc_type,
                'routes': "; ".join(set(routes)),
                'dosage_forms': "; ".join(set(dosage_forms)),
                'revised_date': revised_date,
                'initial_approval_year': initial_approval_year,
                'local_rel_path': os.path.basename(file_path),
                'ingr_map': ingr_map,
                'sections_to_db': sections_to_db,
                'sections_to_fts': sections_to_fts
            }
        except Exception as e:
            # print(f"Error parsing {file_path}: {e}")
            return None

    def update_db_from_storage(self):
        """Phase 2: Process individual ZIPs in storage folder and sync to DB."""
        all_zips = [os.path.join(self.storage_dir, f) for f in os.listdir(self.storage_dir) if f.endswith('.zip')]
        if not all_zips:
            print("No individual SPL ZIPs found in storage.")
            return

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Get already processed IDs
        cursor.execute("SELECT file_id FROM processed_files")
        processed_ids = {row[0] for row in cursor.fetchall()}
        
        # Filter files to process
        to_process = []
        for f in all_zips:
            # Quick check by set_id (filename) if possible, or just spl_id later
            fid = os.path.basename(f).replace('.zip', '')
            # DailyMed filenames are often the set_id
            # However, spl_id is the primary key in processed_files. 
            # We'll rely on the worker to return data, then check spl_id.
            to_process.append(f)

        print(f"Found {len(to_process)} ZIPs in storage. Starting parallel processing...")
        
        count = 0
        batch_size = 100
        
        # Use multiprocessing for XML parsing
        num_workers = multiprocessing.cpu_count()
        with ProcessPoolExecutor(max_workers=num_workers) as executor:
            futures = {executor.submit(self.parse_spl_file, f): f for f in to_process}
            
            for i, future in enumerate(as_completed(futures)):
                data = future.result()
                if not data: continue
                
                spl_id = data['spl_id']
                if spl_id in processed_ids: continue

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
                
                cursor.execute("INSERT INTO processed_files (file_id, processed_at) VALUES (?, ?)", (spl_id, datetime.now().isoformat()))
                processed_ids.add(spl_id)
                count += 1

                if count % batch_size == 0:
                    conn.commit()
                    print(f"Sync Progress: {i+1}/{len(to_process)} files checked, {count} new records added.")

        conn.commit()
        conn.close()
        print(f"Finished. Added {count} new records to {self.db_path}.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Industrial update of label.db from all DailyMed ZIPs.")
    parser.add_argument("--filter", choices=['prescription', 'human', 'all'], default='human', help="Filter records to import")
    args = parser.parse_args()

    updater = LabelDBUpdater()
    
    print("--- Phase 1: Unpacking Bulk ZIPs ---")
    updater.unpack_all_bulk_zips(filter_type=args.filter)
    
    print("\n--- Phase 2: Syncing Metadata to Database ---")
    updater.update_db_from_storage()
