import os
import glob
import re
import zipfile
import io
import argparse
import sys
import multiprocessing
from datetime import datetime
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path
import xml.etree.ElementTree as ET

# Internal imports
from pg_utils import PGUtils
from psycopg2 import sql
from psycopg2.extras import execute_values

# Namespace for SPL XML
NS = {'ns': 'urn:hl7-org:v3'}

def get_el_text(el):
    return "".join(el.itertext()).strip() if el is not None else ""

def parse_spl_zip(zip_path, rld_appl_nos, rs_appl_nos):
    """
    Worker function to parse a single SPL ZIP file.
    Returns a dictionary of data for insertion.
    """
    try:
        with zipfile.ZipFile(zip_path, 'r') as z:
            xml_files = [f for f in z.namelist() if f.endswith('.xml')]
            if not xml_files:
                return None
            with z.open(xml_files[0]) as f:
                xml_content = f.read()
        
        root = ET.fromstring(xml_content)
        
        # 1. Basic Metadata
        spl_id_el = root.find('ns:id', NS)
        spl_id = spl_id_el.get('root') if spl_id_el is not None else None
        
        set_id_el = root.find('ns:setId', NS)
        set_id = set_id_el.get('root') if set_id_el is not None else None
        
        if not spl_id or not set_id:
            return None

        eff_val_el = root.find('ns:effectiveTime', NS)
        eff_val = eff_val_el.get('value') if eff_val_el is not None else ""
        revised_date = f"{eff_val[:4]}-{eff_val[4:6]}-{eff_val[6:8]}" if len(eff_val) >= 8 else eff_val

        doc_type_el = root.find('ns:code', NS)
        doc_type = doc_type_el.get('displayName') if doc_type_el is not None else ""

        # Initial Approval Year
        title_el = root.find('ns:title', NS)
        title_text = get_el_text(title_el)
        appr_match = re.search(r'Initial U.S. Approval:\s*(\d{4})', title_text)
        initial_approval_year = int(appr_match.group(1)) if appr_match else None

        # Manufacturer
        manufacturer = ""
        author_org = root.find('.//ns:author/ns:assignedEntity/ns:representedOrganization/ns:name', NS)
        if author_org is not None:
            manufacturer = author_org.text if author_org.text else ""

        # 2. Product Information
        product_names, generic_names, active_ingredients, dosage_forms, ndc_codes, routes, appr_nums = [], [], [], [], [], [], []
        ingr_map = [] # (spl_id, substance_name, is_active)
        
        products = root.findall('.//ns:manufacturedProduct/ns:manufacturedProduct', NS)
        for prod in products:
            if (name_el := prod.find('ns:name', NS)) is not None:
                product_names.append(get_el_text(name_el))
            
            if (gen_name_el := prod.find('.//ns:genericMedicine/ns:name', NS)) is not None:
                generic_names.append(get_el_text(gen_name_el))
                
            if (form_el := prod.find('ns:formCode', NS)) is not None:
                dosage_forms.append(form_el.get('displayName'))
                
            if (ndc_el := prod.find('ns:code', NS)) is not None:
                ndc_codes.append(ndc_el.get('code'))
                
            for ingr in prod.findall('ns:ingredient', NS):
                class_code = ingr.get('classCode')
                subst_el = ingr.find('ns:ingredientSubstance', NS)
                if subst_el is not None:
                    name_el = subst_el.find('ns:name', NS)
                    code_el = subst_el.find('ns:code', NS)
                    
                    if name_el is not None:
                        sub_name = get_el_text(name_el)
                        # Extract UNII if codeSystem is correct
                        unii = code_el.get('code') if (code_el is not None and code_el.get('codeSystem') == '2.16.840.1.113883.4.9') else ""
                        is_active = 1 if class_code in ['ACTIM', 'ACTIB'] else 0
                        
                        if is_active:
                            active_ingredients.append(sub_name)
                        ingr_map.append((spl_id, sub_name, unii, is_active))

            for rel in prod.findall('.//ns:routeCode', NS):
                routes.append(rel.get('displayName'))

        if (appr_el := root.find('.//ns:approval/ns:id', NS)) is not None:
            appr_nums.append(appr_el.get('extension'))

        # RLD / RS Logic
        is_rld, is_rs = 0, 0
        all_appr = "; ".join(set(appr_nums))
        if all_appr:
            digits = re.findall(r'\d+', all_appr)
            for d in digits:
                norm_d = d.lstrip('0')
                if norm_d in rld_appl_nos: is_rld = 1
                if norm_d in rs_appl_nos: is_rs = 1

        # 3. Sections
        sections_db = []
        for sec in root.findall('.//ns:section', NS):
            sec_code_el = sec.find('ns:code', NS)
            loinc = sec_code_el.get('code') if sec_code_el is not None else ""
            sec_title_el = sec.find('ns:title', NS)
            title = get_el_text(sec_title_el)
            if (text_el := sec.find('ns:text', NS)) is not None:
                raw_xml = ET.tostring(text_el, encoding='unicode').strip()
                sections_db.append((spl_id, loinc, title, raw_xml))

        return {
            'metadata': (
                spl_id, set_id, "; ".join(set(product_names)), "; ".join(set(generic_names)),
                manufacturer, all_appr, "; ".join(set(active_ingredients)), "",
                doc_type, "; ".join(set(routes)), "; ".join(set(dosage_forms)), "",
                "; ".join(set(ndc_codes)), revised_date, initial_approval_year,
                is_rld, is_rs, os.path.basename(zip_path)
            ),
            'ingr_map': ingr_map,
            'sections': sections_db,
            'spl_id': spl_id,
            'set_id': set_id,
            'revised_date': revised_date
        }
    except Exception:
        return None

def unpack_bulk_zips(downloads_dir, storage_dir, filter_type='human'):
    """
    Phase 1: Unpack giant ZIP files from downloads_dir into storage_dir.
    """
    root_dir = Path(__file__).resolve().parent.parent.parent
    downloads_path = root_dir / downloads_dir
    storage_path = root_dir / storage_dir
    storage_path.mkdir(parents=True, exist_ok=True)
    
    bulk_zips = glob.glob(str(downloads_path / "*.zip"))
    if not bulk_zips:
        print(f"No bulk ZIP files found in {downloads_path}")
        return

    # Check processed zips in labeling.processed_zips
    processed = set()
    try:
        rows = PGUtils.execute_query("SELECT zip_name FROM labeling.processed_zips", fetch=True)
        processed = {r['zip_name'] for r in rows}
    except Exception:
        # Schema or table might not exist yet, will be handled in init
        pass

    filter_map = {
        'prescription': ['prescription/'],
        'human': ['prescription/', 'otc/', 'homeopathic/', 'other/'],
        'all': ['']
    }
    prefixes = filter_map.get(filter_type, [''])

    for zip_path in bulk_zips:
        zip_name = os.path.basename(zip_path)
        if zip_name in processed:
            print(f"Skipping already processed bulk ZIP: {zip_name}")
            continue

        print(f"Unpacking bulk ZIP: {zip_name}...")
        try:
            with zipfile.ZipFile(zip_path, 'r') as main_z:
                all_members = main_z.namelist()
                nested_zips = [f for f in all_members if f.endswith('.zip') and any(f.startswith(p) for p in prefixes)]
                
                for nz_name in nested_zips:
                    inner_name = os.path.basename(nz_name)
                    out_path = storage_path / inner_name
                    if not out_path.exists():
                        with main_z.open(nz_name) as source, open(out_path, 'wb') as target:
                            target.write(source.read())
            
            # Record as processed
            PGUtils.execute_query(
                "INSERT INTO labeling.processed_zips (zip_name) VALUES (%s) ON CONFLICT DO NOTHING",
                (zip_name,)
            )
        except Exception as e:
            print(f"Error unpacking {zip_name}: {e}")

def load_orange_book():
    rld_nos, rs_nos = set(), set()
    root_dir = Path(__file__).resolve().parent.parent.parent
    ob_path = root_dir / 'data' / 'downloads' / 'OrangeBook' / 'EOB_Latest' / 'products.txt'
    
    if ob_path.exists():
        try:
            with open(ob_path, 'r', encoding='latin-1') as f:
                f.readline()
                for line in f:
                    parts = line.split('~')
                    if len(parts) > 11:
                        appl_no = parts[6].strip().lstrip('0')
                        if parts[10].strip().upper() == 'YES': rld_nos.add(appl_no)
                        if parts[11].strip().upper() == 'YES': rs_nos.add(appl_no)
            print(f"Loaded {len(rld_nos)} RLD and {len(rs_nos)} RS records from Orange Book.")
        except Exception as e:
            print(f"Warning: Failed to parse Orange Book: {e}")
    else:
        print(f"Warning: Orange Book not found at {ob_path}")
    return rld_nos, rs_nos

# Global sets for workers
_rld_appl_nos = set()
_rs_appl_nos = set()

def _init_worker(rld_nos, rs_nos):
    global _rld_appl_nos, _rs_appl_nos
    _rld_appl_nos = rld_nos
    _rs_appl_nos = rs_nos

def parse_spl_zip(zip_path):
    """
    Worker function to parse a single SPL ZIP file.
    Uses global rld/rs sets for performance.
    """
    try:
        with zipfile.ZipFile(zip_path, 'r') as z:
            xml_files = [f for f in z.namelist() if f.endswith('.xml')]
            if not xml_files:
                return None
            with z.open(xml_files[0]) as f:
                xml_content = f.read()
        
        root = ET.fromstring(xml_content)
        
        # 1. Basic Metadata
        spl_id_el = root.find('ns:id', NS)
        spl_id = spl_id_el.get('root') if spl_id_el is not None else None
        
        set_id_el = root.find('ns:setId', NS)
        set_id = set_id_el.get('root') if set_id_el is not None else None
        
        if not spl_id or not set_id:
            return None

        eff_val_el = root.find('ns:effectiveTime', NS)
        eff_val = eff_val_el.get('value') if eff_val_el is not None else ""
        revised_date = f"{eff_val[:4]}-{eff_val[4:6]}-{eff_val[6:8]}" if len(eff_val) >= 8 else eff_val

        doc_type_el = root.find('ns:code', NS)
        doc_type = doc_type_el.get('displayName') if doc_type_el is not None else ""

        # Initial Approval Year
        title_el = root.find('ns:title', NS)
        title_text = get_el_text(title_el)
        appr_match = re.search(r'Initial U.S. Approval:\s*(\d{4})', title_text)
        initial_approval_year = int(appr_match.group(1)) if appr_match else None

        # Manufacturer
        manufacturer = ""
        author_path = 'ns:author/ns:assignedEntity/ns:representedOrganization/ns:name'
        author_org = root.find(author_path, NS)
        if author_org is not None:
            manufacturer = author_org.text if author_org.text else ""

        # 2. Product Information
        product_names, generic_names, active_ingredients, dosage_forms, ndc_codes, routes, appr_nums, market_cats = [], [], [], [], [], [], [], []
        ingr_map = [] # (spl_id, substance_name, is_active)
        
        products = root.findall('.//ns:manufacturedProduct/ns:manufacturedProduct', NS)
        for prod in products:
            if (name_el := prod.find('ns:name', NS)) is not None:
                product_names.append(get_el_text(name_el))
            
            if (gen_name_el := prod.find('.//ns:genericMedicine/ns:name', NS)) is not None:
                generic_names.append(get_el_text(gen_name_el))
                
            if (form_el := prod.find('ns:formCode', NS)) is not None:
                dosage_forms.append(form_el.get('displayName'))
                
            if (ndc_el := prod.find('ns:code', NS)) is not None:
                ndc_codes.append(ndc_el.get('code'))
                
            for ingr in prod.findall('ns:ingredient', NS):
                class_code = ingr.get('classCode')
                subst_el = ingr.find('ns:ingredientSubstance', NS)
                if subst_el is not None:
                    name_el = subst_el.find('ns:name', NS)
                    code_el = subst_el.find('ns:code', NS)
                    
                    if name_el is not None:
                        sub_name = get_el_text(name_el)
                        unii = code_el.get('code') if (code_el is not None and code_el.get('codeSystem') == '2.16.840.1.113883.4.9') else ""
                        is_active = 1 if class_code in ['ACTIM', 'ACTIB'] else 0
                        
                        if is_active:
                            active_ingredients.append(sub_name)
                        ingr_map.append((spl_id, sub_name, unii, is_active))

            # Routes of Administration
            for rel in prod.findall('.//ns:routeCode', NS):
                routes.append(rel.get('displayName'))

            # Approval / Application Number
            for appr in prod.findall('.//ns:approval', NS):
                if (appr_id := appr.find('ns:id', NS)) is not None:
                    appr_nums.append(appr_id.get('extension'))
                if (appr_code := appr.find('ns:code', NS)) is not None:
                    market_cats.append(appr_code.get('displayName'))

        # RLD / RS Logic
        is_rld, is_rs = 0, 0
        all_appr = "; ".join(set(filter(None, appr_nums)))
        if all_appr:
            digits = re.findall(r'\d+', all_appr)
            for d in digits:
                norm_d = d.lstrip('0')
                if norm_d in _rld_appl_nos: is_rld = 1
                if norm_d in _rs_appl_nos: is_rs = 1

        # 3. Sections
        sections_db = []
        for sec in root.findall('.//ns:section', NS):
            sec_code_el = sec.find('ns:code', NS)
            loinc = sec_code_el.get('code') if sec_code_el is not None else ""
            sec_title_el = sec.find('ns:title', NS)
            title = get_el_text(sec_title_el)
            if (text_el := sec.find('ns:text', NS)) is not None:
                raw_xml = ET.tostring(text_el, encoding='unicode').strip()
                sections_db.append((spl_id, loinc, title, raw_xml))

        return {
            'metadata': (
                spl_id, set_id, "; ".join(set(filter(None, product_names))), "; ".join(set(filter(None, generic_names))),
                manufacturer, all_appr, "; ".join(set(filter(None, active_ingredients))), "; ".join(set(filter(None, market_cats))),
                doc_type, "; ".join(set(filter(None, routes))), "; ".join(set(filter(None, dosage_forms))), "",
                "; ".join(set(filter(None, ndc_codes))), revised_date, initial_approval_year,
                is_rld, is_rs, os.path.basename(zip_path)
            ),
            'ingr_map': ingr_map,
            'sections': sections_db,
            'spl_id': spl_id,
            'set_id': set_id,
            'revised_date': revised_date
        }
    except Exception:
        return None

def sync_from_storage(storage_dir, num_workers=4, force=False):
    root_dir = Path(__file__).resolve().parent.parent.parent
    storage_path = root_dir / storage_dir
    zip_files = sorted(glob.glob(str(storage_path / "*.zip")))
    
    if not zip_files:
        print(f"No ZIP files found in {storage_path}")
        return

    print(f"Found {len(zip_files)} ZIP files in {storage_dir}")
    rld_nos, rs_nos = load_orange_book()

    # Ensure schema and tables exist
    try:
        PGUtils.execute_query("SELECT 1 FROM labeling.sum_spl LIMIT 1")
    except Exception:
        import pg_init_labeldb
        pg_init_labeldb.init_labeling_schema()

    # Get existing records
    existing = set()
    if not force:
        try:
            results = PGUtils.execute_query("SELECT set_id, revised_date FROM labeling.sum_spl", fetch=True)
            existing = { (r['set_id'], r['revised_date']) for r in results }
            print(f"Skipping {len(existing)} records already in database.")
        except Exception:
            pass
    else:
        print("Force mode enabled: Re-processing all labels.")

    batch_size = 500
    meta_batch, ingr_batch, sect_batch, spl_id_batch = [], [], [], []
    processed, skipped = 0, 0
    
    print(f"Starting multi-threaded parsing (Workers: {num_workers})...")
    
    from concurrent.futures import ProcessPoolExecutor, as_completed
    
    with ProcessPoolExecutor(max_workers=num_workers, initializer=_init_worker, initargs=(rld_nos, rs_nos)) as executor:
        # Submit all tasks
        future_to_zip = {executor.submit(parse_spl_zip, zp): zp for zp in zip_files}
        
        for i, future in enumerate(as_completed(future_to_zip)):
            data = future.result()
            if not data:
                continue
            
            if (data['set_id'], data['revised_date']) in existing:
                skipped += 1
            else:
                meta_batch.append(data['metadata'])
                ingr_batch.extend(data['ingr_map'])
                sect_batch.extend(data['sections'])
                spl_id_batch.append(data['spl_id'])
                processed += 1
            
            # Insert in batches
            if len(meta_batch) >= batch_size or (i + 1) == len(zip_files):
                if spl_id_batch:
                    try:
                        conn = PGUtils.get_connection()
                        with conn.cursor() as cur:
                            # 1. Clean up old records
                            cur.execute(sql.SQL("DELETE FROM labeling.sum_spl WHERE spl_id = ANY(%s)"), (spl_id_batch,))
                            
                            # 2. Insert metadata
                            cols = [
                                'spl_id', 'set_id', 'product_names', 'generic_names', 'manufacturer', 
                                'appr_num', 'active_ingredients', 'market_categories', 'doc_type', 
                                'routes', 'dosage_forms', 'epc', 'ndc_codes', 'revised_date', 
                                'initial_approval_year', 'is_rld', 'is_rs', 'local_path'
                            ]
                            full_table_name = sql.Identifier('labeling', 'sum_spl')
                            col_names = [sql.Identifier(c) for c in cols]
                            query = sql.SQL("INSERT INTO {table} ({cols}) VALUES %s").format(
                                table=full_table_name,
                                cols=sql.SQL(', ').join(col_names)
                            )
                            execute_values(cur, query, meta_batch)
                            
                            # 3. Insert Ingredients
                            if ingr_batch:
                                ingr_table = sql.Identifier('labeling', 'active_ingredients_map')
                                ingr_cols = [sql.Identifier(c) for c in ['spl_id', 'substance_name', 'unii', 'is_active']]
                                ingr_query = sql.SQL("INSERT INTO {table} ({cols}) VALUES %s").format(

                                    table=ingr_table,
                                    cols=sql.SQL(', ').join(ingr_cols)
                                )
                                execute_values(cur, ingr_query, ingr_batch)
                                
                            # 4. Insert Sections
                            if sect_batch:
                                sect_table = sql.Identifier('labeling', 'spl_sections')
                                sect_cols = [sql.Identifier(c) for c in ['spl_id', 'loinc_code', 'title', 'content_xml']]
                                sect_query = sql.SQL("INSERT INTO {table} ({cols}) VALUES %s").format(
                                    table=sect_table,
                                    cols=sql.SQL(', ').join(sect_cols)
                                )
                                execute_values(cur, sect_query, sect_batch)
                                
                        conn.commit()
                    except Exception as e:
                        print(f"\n[ERROR] Batch insertion failed: {e}")
                        if 'conn' in locals(): conn.rollback()
                    finally:
                        if 'conn' in locals(): conn.close()
                
                # Clear batches
                meta_batch, ingr_batch, sect_batch, spl_id_batch = [], [], [], []
                
            if (i + 1) % 100 == 0 or (i + 1) == len(zip_files):
                sys.stdout.write(f"\rProgress: {i+1}/{len(zip_files)} | Processed: {processed} | Skipped: {skipped}")
                sys.stdout.flush()

    print(f"\nFinished Sync. Processed: {processed}, Skipped: {skipped}")

    # Final step: Populate EPC column from substance_indexing if available
    print("Updating EPC mappings from indexing table...")
    try:
        PGUtils.execute_query("""
            INSERT INTO labeling.epc_map (spl_id, epc_term)
            SELECT DISTINCT m.spl_id, i.indexing_name
            FROM labeling.active_ingredients_map m
            JOIN labeling.substance_indexing i ON (
                (m.unii != '' AND m.unii = i.substance_unii) OR 
                (m.unii = '' AND UPPER(m.substance_name) = UPPER(i.substance_name))
            )
            WHERE i.indexing_type = 'EPC' AND m.is_active = 1
            ON CONFLICT DO NOTHING;

            WITH agg_epc AS (
                SELECT spl_id, string_agg(DISTINCT epc_term, '; ') as epcs
                FROM labeling.epc_map
                GROUP BY spl_id
            )
            UPDATE labeling.sum_spl s
            SET epc = a.epcs
            FROM agg_epc a
            WHERE s.spl_id = a.spl_id AND (s.epc IS NULL OR s.epc = '');
        """)
        print("EPC mappings updated.")
    except Exception as e:
        print(f"Warning: Could not update EPC mappings: {e}")


def main():
    parser = argparse.ArgumentParser(description="DailyMed to PostgreSQL Sync Pipeline.")
    parser.add_argument("--downloads-dir", default="data/downloads/dailymed", help="Source for bulk ZIPs")
    parser.add_argument("--storage-dir", default="data/spl_storage", help="Target for extracted labeling ZIPs")
    parser.add_argument("--filter", choices=['prescription', 'human', 'all'], default='human', help="Unpacking filter")
    parser.add_argument("--skip-unpack", action="store_true", help="Skip the unpacking phase")
    parser.add_argument("--workers", type=int, default=4, help="Number of worker processes (default: 4)")
    parser.add_argument("--force", action="store_true", help="Force re-processing of already imported labels")
    
    args = parser.parse_args()

    print("=== Phase 1: Unpacking Bulk ZIPs ===")
    if not args.skip_unpack:
        unpack_bulk_zips(args.downloads_dir, args.storage_dir, args.filter)
    else:
        print("Unpacking phase skipped.")

    print("\n=== Phase 2: Syncing to PostgreSQL ===")
    sync_from_storage(args.storage_dir, num_workers=args.workers, force=args.force)

if __name__ == "__main__":
    main()
