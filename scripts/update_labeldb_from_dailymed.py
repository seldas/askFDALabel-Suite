import sqlite3
import xml.etree.ElementTree as ET
import os
import glob
import re
import zipfile
import io
import argparse
from datetime import datetime

# Namespace for SPL XML
NS = {'ns': 'urn:hl7-org:v3'}

class LabelDBUpdater:
    def __init__(self, db_path="data/label.db"):
        self.db_path = db_path
        self._init_tracking_table()

    def _init_tracking_table(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
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

    def parse_and_sync_xml(self, xml_content, source_name, conn):
        try:
            root = ET.fromstring(xml_content)
        except Exception as e:
            print(f"Error parsing XML from {source_name}: {e}")
            return

        spl_id_el = root.find('ns:id', NS)
        set_id_el = root.find('ns:setId', NS)
        spl_id = spl_id_el.get('root') if spl_id_el is not None else None
        set_id = set_id_el.get('root') if set_id_el is not None else None
        
        if not spl_id: return

        # Check if already processed (efficiency)
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM processed_files WHERE file_id = ?", (spl_id,))
        if cursor.fetchone():
            return # Skip if already exists

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

        # Clear old and insert new
        cursor.execute("DELETE FROM spl_sections WHERE spl_id = ?", (spl_id,))
        cursor.execute("DELETE FROM spl_sections_search WHERE spl_id = ?", (spl_id,))
        cursor.execute("DELETE FROM active_ingredients_map WHERE spl_id = ?", (spl_id,))

        cursor.execute("""
            INSERT OR REPLACE INTO sum_spl (
                spl_id, set_id, product_names, generic_names, manufacturer, 
                appr_num, active_ingredients, market_categories, doc_type, 
                routes, dosage_forms, revised_date, initial_approval_year
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            spl_id, set_id, "; ".join(set(product_names)), "; ".join(set(generic_names)), manufacturer,
            "; ".join(set(appr_nums)), "; ".join(set(active_ingredients)), "", doc_type,
            "; ".join(set(routes)), "; ".join(set(dosage_forms)), revised_date, initial_approval_year
        ))

        cursor.executemany("INSERT INTO active_ingredients_map (spl_id, substance_name, is_active) VALUES (?, ?, ?)", ingr_map)
        cursor.executemany("INSERT INTO spl_sections (spl_id, loinc_code, title, content_xml) VALUES (?, ?, ?, ?)", sections_to_db)
        cursor.executemany("INSERT INTO spl_sections_search (spl_id, loinc_code, title, content_text) VALUES (?, ?, ?, ?)", sections_to_fts)
        
        cursor.execute("INSERT INTO processed_files (file_id, processed_at) VALUES (?, ?)", (spl_id, datetime.now().isoformat()))

    def process_nested_zip(self, main_zip_path, filter_type='all'):
        conn = sqlite3.connect(self.db_path)
        
        print(f"Opening main ZIP: {main_zip_path}...")
        with zipfile.ZipFile(main_zip_path, 'r') as main_z:
            all_files = main_z.namelist()
            
            # Category filters
            filter_map = {
                'prescription': ['prescription/'],
                'human': ['prescription/', 'otc/', 'homeopathic/', 'other/'],
                'all': [''] # Everything
            }
            prefixes = filter_map.get(filter_type, [''])
            
            nested_zips = [f for f in all_files if f.endswith('.zip') and any(f.startswith(p) for p in prefixes)]
            
            total = len(nested_zips)
            print(f"Found {total} ZIP files to process for filter: {filter_type}")
            
            for i, nz_name in enumerate(nested_zips):
                if i % 50 == 0: print(f"Processing {i}/{total}...")
                
                try:
                    with main_z.open(nz_name) as nz_data:
                        # Use io.BytesIO to treat the nested data as a file for zipfile
                        with zipfile.ZipFile(io.BytesIO(nz_data.read())) as nz:
                            xml_files = [f for f in nz.namelist() if f.endswith('.xml')]
                            for xml_file in xml_files:
                                with nz.open(xml_file) as xf:
                                    self.parse_and_sync_xml(xf.read(), f"{nz_name}/{xml_file}", conn)
                    
                    if i % 10 == 0: conn.commit() # Periodic commit
                except Exception as e:
                    print(f"Failed to process nested ZIP {nz_name}: {e}")
        
        conn.commit()
        conn.close()
        print("Done.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Update label.db from DailyMed weekly update ZIP.")
    parser.add_argument("--zip", default="data/downloads/dailymed/dm_spl_weekly_update_021626_022026.zip", help="Path to main ZIP")
    parser.add_argument("--filter", choices=['prescription', 'human', 'all'], default='human', help="Filter records to import")
    args = parser.parse_args()

    updater = LabelDBUpdater()
    updater.process_nested_zip(args.zip, args.filter)
