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
        spl_id = root.find('ns:id', NS).get('root') if root.find('ns:id', NS) is not None else None
        set_id = root.find('ns:setId', NS).get('root') if root.find('ns:setId', NS) is not None else None
        
        if not spl_id or not set_id:
            return None

        eff_val = root.find('ns:effectiveTime', NS).get('value') if root.find('ns:effectiveTime', NS) is not None else ""
        revised_date = f"{eff_val[:4]}-{eff_val[4:6]}-{eff_val[6:8]}" if len(eff_val) >= 8 else eff_val

        doc_type_el = root.find('ns:code', NS)
        doc_type = doc_type_el.get('displayName') if doc_type_el is not None else ""

        # Initial Approval Year
        title_text = get_el_text(root.find('ns:title', NS))
        appr_match = re.search(r'Initial U.S. Approval:\s*(\d{4})', title_text)
        initial_approval_year = int(appr_match.group(1)) if appr_match else None

        # Manufacturer
        manufacturer = ""
        author_org = root.find('.//ns:author/ns:assignedEntity/ns:representedOrganization/ns:name', NS)
        if author_org is not None:
            manufacturer = author_org.find('ns:name', NS).text if author_org.find('ns:name', NS) is not None else ""

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
                if (subst := ingr.find('ns:ingredientSubstance/ns:name', NS)) is not None:
                    is_active = 1 if class_code in ['ACTIM', 'ACTIB'] else 0
                    sub_name = get_el_text(subst)
                    if is_active:
                        active_ingredients.append(sub_name)
                    ingr_map.append((spl_id, sub_name, is_active))

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
            loinc = (sec.find('ns:code', NS).get('code')) if sec.find('ns:code', NS) is not None else ""
            title = get_el_text(sec.find('ns:title', NS))
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
    ob_path = root_dir / 'data' / 'downloads' / 'EOB_2026_01' / 'products.txt'
    
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

def sync_from_storage(storage_dir):
    root_dir = Path(__file__).resolve().parent.parent.parent
    storage_path = root_dir / storage_dir
    zip_files = glob.glob(str(storage_path / "*.zip"))
    
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
    try:
        results = PGUtils.execute_query("SELECT set_id, revised_date FROM labeling.sum_spl", fetch=True)
        existing = { (r['set_id'], r['revised_date']) for r in results }
    except Exception:
        pass

    batch_size = 500
    meta_batch, ingr_batch, sect_batch, spl_id_batch = [], [], [], []
    processed, skipped = 0, 0
    
    print("Starting multi-threaded parsing...")
    with ProcessPoolExecutor(max_workers=multiprocessing.cpu_count()) as executor:
        futures = [executor.submit(parse_spl_zip, z, rld_nos, rs_nos) for z in zip_files]
        
        for i, future in enumerate(as_completed(futures)):
            data = future.result()
            if not data: continue
            
            if (data['set_id'], data['revised_date']) in existing:
                skipped += 1
                continue
            
            meta_batch.append(data['metadata'])
            ingr_batch.extend(data['ingr_map'])
            sect_batch.extend(data['sections'])
            spl_id_batch.append(data['spl_id'])
            processed += 1
            
            if len(meta_batch) >= batch_size or (i + 1) == len(zip_files):
                if spl_id_batch:
                    PGUtils.execute_query(sql.SQL("DELETE FROM labeling.sum_spl WHERE spl_id = ANY(%s)"), (spl_id_batch,))
                
                if meta_batch:
                    cols = [
                        'spl_id', 'set_id', 'product_names', 'generic_names', 'manufacturer', 
                        'appr_num', 'active_ingredients', 'market_categories', 'doc_type', 
                        'routes', 'dosage_forms', 'epc', 'ndc_codes', 'revised_date', 
                        'initial_approval_year', 'is_rld', 'is_rs', 'local_path'
                    ]
                    PGUtils.bulk_insert('sum_spl', cols, meta_batch, schema='labeling')
                
                if ingr_batch:
                    PGUtils.bulk_insert('active_ingredients_map', ['spl_id', 'substance_name', 'is_active'], ingr_batch, schema='labeling')
                
                if sect_batch:
                    PGUtils.bulk_insert('spl_sections', ['spl_id', 'loinc_code', 'title', 'content_xml'], sect_batch, schema='labeling')
                
                meta_batch, ingr_batch, sect_batch, spl_id_batch = [], [], [], []
                
            if (i + 1) % 100 == 0 or (i+1) == len(zip_files):
                sys.stdout.write(f"\rProgress: {i+1}/{len(zip_files)} | Processed: {processed} | Skipped: {skipped}")
                sys.stdout.flush()

    print(f"\nFinished Sync. Processed: {processed}, Skipped: {skipped}")

def main():
    parser = argparse.ArgumentParser(description="DailyMed to PostgreSQL Sync Pipeline.")
    parser.add_argument("--downloads-dir", default="data/downloads/dailymed", help="Source for bulk ZIPs")
    parser.add_argument("--storage-dir", default="data/spl_storage", help="Target for extracted labeling ZIPs")
    parser.add_argument("--filter", choices=['prescription', 'human', 'all'], default='human', help="Unpacking filter")
    parser.add_argument("--skip-unpack", action="store_true", help="Skip the unpacking phase")
    
    args = parser.parse_args()

    print("=== Phase 1: Unpacking Bulk ZIPs ===")
    if not args.skip_unpack:
        unpack_bulk_zips(args.downloads_dir, args.storage_dir, args.filter)
    else:
        print("Unpacking phase skipped.")

    print("\n=== Phase 2: Syncing to PostgreSQL ===")
    sync_from_storage(args.storage_dir)

if __name__ == "__main__":
    main()
