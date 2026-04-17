import os
import sys
import argparse
import glob
import re
import zipfile
import multiprocessing
from datetime import datetime
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path
import xml.etree.ElementTree as ET
from sqlalchemy import text

# Add backend to path
backend_dir = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(backend_dir))

from database import db, SystemTask, DrugLabel, LabelSection, ActiveIngredientMap
from dashboard import create_app

NS = {'ns': 'urn:hl7-org:v3'}

def update_progress(task_id, progress, message=None, status='processing'):
    if not task_id: return
    try:
        task = SystemTask.query.get(task_id)
        if task:
            task.progress = progress
            if message: task.message = message
            task.status = status
            task.updated_at = datetime.utcnow()
            if status == 'completed': task.completed_at = datetime.utcnow()
            db.session.commit()
    except Exception as e:
        print(f"Error updating progress: {e}")

def get_el_text(el):
    return "".join(el.itertext()).strip() if el is not None else ""

def parse_spl_zip(zip_path, rld_nos, rs_nos):
    """Worker function to parse a single SPL ZIP file."""
    try:
        with zipfile.ZipFile(zip_path, 'r') as z:
            xml_files = [f for f in z.namelist() if f.endswith('.xml')]
            if not xml_files: return None
            with z.open(xml_files[0]) as f:
                xml_content = f.read()
        
        root = ET.fromstring(xml_content)
        spl_id = root.find('ns:id', NS).get('root') if root.find('ns:id', NS) is not None else None
        set_id = root.find('ns:setId', NS).get('root') if root.find('ns:setId', NS) is not None else None
        if not spl_id or not set_id: return None

        eff_val = root.find('ns:effectiveTime', NS).get('value') if root.find('ns:effectiveTime', NS) is not None else ""
        revised_date = f"{eff_val[:4]}-{eff_val[4:6]}-{eff_val[6:8]}" if len(eff_val) >= 8 else eff_val
        doc_type_el = root.find('ns:code', NS)
        doc_type = doc_type_el.get('displayName') if doc_type_el is not None else ""

        # Manufacturer
        manufacturer = ""
        author_org = root.find('.//ns:author/ns:assignedEntity/ns:representedOrganization/ns:name', NS)
        if author_org is not None: manufacturer = get_el_text(author_org)

        product_names, generic_names, active_ingredients, dosage_forms, ndc_codes, routes, appr_nums = [], [], [], [], [], [], []
        ingr_map = []
        
        products = root.findall('.//ns:manufacturedProduct/ns:manufacturedProduct', NS)
        for prod in products:
            if (name_el := prod.find('ns:name', NS)) is not None: product_names.append(get_el_text(name_el))
            if (gen_name_el := prod.find('.//ns:genericMedicine/ns:name', NS)) is not None: generic_names.append(get_el_text(gen_name_el))
            if (form_el := prod.find('ns:formCode', NS)) is not None: dosage_forms.append(form_el.get('displayName'))
            if (ndc_el := prod.find('ns:code', NS)) is not None: ndc_codes.append(ndc_el.get('code'))
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
                        if is_active: active_ingredients.append(sub_name)
                        ingr_map.append({'spl_id': spl_id, 'substance_name': sub_name, 'unii': unii, 'is_active': is_active})
            for rel in prod.findall('.//ns:routeCode', NS): routes.append(rel.get('displayName'))

        if (appr_el := root.find('.//ns:approval/ns:id', NS)) is not None: appr_nums.append(appr_el.get('extension'))

        # RLD/RS logic
        is_rld, is_rs = 0, 0
        all_appr = "; ".join(set(appr_nums))
        if all_appr:
            digits = re.findall(r'\d+', all_appr)
            for d in digits:
                norm_d = d.lstrip('0')
                if norm_d in rld_nos: is_rld = 1
                if norm_d in rs_nos: is_rs = 1

        sections = []
        for sec in root.findall('.//ns:section', NS):
            loinc = (sec.find('ns:code', NS).get('code')) if sec.find('ns:code', NS) is not None else ""
            title = get_el_text(sec.find('ns:title', NS))
            if (text_el := sec.find('ns:text', NS)) is not None:
                content_xml = ET.tostring(text_el, encoding='unicode').strip()
                sections.append({'spl_id': spl_id, 'loinc_code': loinc, 'title': title, 'content_xml': content_xml})

        return {
            'metadata': {
                'spl_id': spl_id, 'set_id': set_id, 'product_names': "; ".join(set(product_names)), 
                'generic_names': "; ".join(set(generic_names)), 'manufacturer': manufacturer,
                'appr_num': all_appr, 'active_ingredients': "; ".join(set(active_ingredients)),
                'doc_type': doc_type, 'routes': "; ".join(set(routes)), 
                'dosage_forms': "; ".join(set(dosage_forms)), 'ndc_codes': "; ".join(set(ndc_codes)),
                'revised_date': revised_date, 'is_rld': is_rld, 'is_rs': is_rs,
                'local_path': os.path.basename(zip_path)
            },
            'ingr_map': ingr_map,
            'sections': sections,
            'spl_id': spl_id,
            'set_id': set_id,
            'revised_date': revised_date
        }
    except Exception:
        return None

def load_orange_book(app):
    rld_nos, rs_nos = set(), set()
    ob_path = Path(app.config['DATA_DIR']) / 'downloads' / 'OrangeBook' / 'EOB_Latest' / 'products.txt'
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
        except Exception: pass
    return rld_nos, rs_nos

def import_labels():
    parser = argparse.ArgumentParser(description='Import SPL Label Data')
    parser.add_argument('--force', action='store_true')
    parser.add_argument('--task-id', type=int)
    args = parser.parse_args()

    app = create_app()
    with app.app_context():
        task_id = args.task_id
        try:
            print("=== Drug Label Data Importer (Task-Enabled) ===")
            update_progress(task_id, 5, "Initializing label import...")
            
            # 1. Initialize schema if needed
            db.session.execute(text("CREATE SCHEMA IF NOT EXISTS labeling"))
            db.session.commit()
            db.create_all()

            if args.force:
                print("  [-] Force update: Clearing labeling tables...")
                update_progress(task_id, 10, "Clearing existing data...")
                db.session.execute(text("TRUNCATE TABLE labeling.sum_spl CASCADE"))
                db.session.commit()

            storage_dir = Path(app.config['DATA_DIR']) / 'spl_storage'
            zip_files = glob.glob(str(storage_dir / "*.zip"))
            if not zip_files:
                raise FileNotFoundError(f"No ZIP files found in {storage_dir}")

            print(f"  [+] Found {len(zip_files)} ZIP files.")
            rld_nos, rs_nos = load_orange_book(app)
            
            # Get existing to avoid duplicates if not forcing
            existing = set()
            if not args.force:
                res = db.session.execute(text("SELECT set_id, revised_date FROM labeling.sum_spl")).fetchall()
                existing = {(r[0], r[1]) for r in res}

            batch_size = 200
            meta_batch, ingr_batch, sect_batch, spl_id_batch = [], [], [], []
            processed, skipped = 0, 0
            total_files = len(zip_files)

            update_progress(task_id, 15, f"Parsing {total_files} files...")

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
                    
                    if len(meta_batch) >= batch_size or (i + 1) == total_files:
                        # Clean up existing SPL IDs in this batch to handle updates
                        if spl_id_batch:
                            db.session.execute(
                                text("DELETE FROM labeling.sum_spl WHERE spl_id = ANY(:ids)"),
                                {"ids": spl_id_batch}
                            )
                        
                        if meta_batch:
                            db.session.bulk_insert_mappings(DrugLabel, meta_batch)
                        if ingr_batch:
                            db.session.bulk_insert_mappings(ActiveIngredientMap, ingr_batch)
                        if sect_batch:
                            db.session.bulk_insert_mappings(LabelSection, sect_batch)
                        
                        db.session.commit()
                        prog = 15 + int(80 * (i / total_files))
                        update_progress(task_id, prog, f"Processed {i+1}/{total_files} files...")
                        meta_batch, ingr_batch, sect_batch, spl_id_batch = [], [], [], []

            update_progress(task_id, 95, "Refreshing version lineage...")
            try:
                db.session.execute(text("""
                    WITH ranked AS (
                        SELECT
                            spl_id,
                            set_id,
                            revised_date,
                            imported_at,
                            ROW_NUMBER() OVER (
                                PARTITION BY set_id
                                ORDER BY revised_date ASC NULLS LAST,
                                         imported_at ASC,
                                         spl_id ASC
                            ) AS version_number,
                            LAG(spl_id) OVER (
                                PARTITION BY set_id
                                ORDER BY revised_date ASC NULLS LAST,
                                         imported_at ASC,
                                         spl_id ASC
                            ) AS parent_spl_id,
                            CASE
                                WHEN ROW_NUMBER() OVER (
                                    PARTITION BY set_id
                                    ORDER BY revised_date DESC NULLS LAST,
                                             imported_at DESC,
                                             spl_id DESC
                                ) = 1
                                THEN TRUE ELSE FALSE
                            END AS is_latest
                        FROM labeling.sum_spl
                    )
                    UPDATE labeling.sum_spl s
                    SET version_number = r.version_number,
                        parent_spl_id = r.parent_spl_id,
                        is_latest = r.is_latest
                    FROM ranked r
                    WHERE s.spl_id = r.spl_id
                """))
                db.session.commit()
                print("  [+] Version lineage metadata updated.")
            except Exception as e:
                print(f"  [!] Warning: Could not refresh version lineage: {e}")
                db.session.rollback()

            update_progress(task_id, 100, f"Import complete. Processed: {processed}, Skipped: {skipped}", status='completed')
            print(f"\n[!] Success! Processed: {processed}, Skipped: {skipped}")

            # Final step: Populate EPC column from substance_indexing if available
            print("  [+] Updating EPC mappings from indexing table...")
            try:
                db.session.execute(text("""
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
                """))
                db.session.commit()
                print("  [+] EPC mappings updated.")
            except Exception as e:
                print(f"  [!] Warning: Could not update EPC mappings: {e}")
                db.session.rollback()

        except Exception as e:
            print(f"  [!] Error: {e}")
            if task_id:
                try:
                    task = SystemTask.query.get(task_id)
                    if task:
                        task.status = 'failed'
                        task.error_details = str(e)
                        db.session.commit()
                except: pass

if __name__ == "__main__":
    import_labels()
