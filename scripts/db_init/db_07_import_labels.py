import os
import glob
import re
import zipfile
import argparse
import sys
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor, as_completed
import xml.etree.ElementTree as ET

from pg_utils import PGUtils
from psycopg2 import sql
from psycopg2.extras import execute_values

NS = {'ns': 'urn:hl7-org:v3'}

_rld_appl_nos = set()
_rs_appl_nos = set()


def get_el_text(el):
    return "".join(el.itertext()).strip() if el is not None else ""


def _init_worker(rld_nos, rs_nos):
    global _rld_appl_nos, _rs_appl_nos
    _rld_appl_nos = rld_nos
    _rs_appl_nos = rs_nos


def normalize_effective_date(eff_val):
    """
    Returns:
        revised_date_str: 'YYYY-MM-DD' or None
        effective_time_raw: original value or ''
    """
    eff_val = (eff_val or "").strip()
    if len(eff_val) >= 8 and eff_val[:8].isdigit():
        return f"{eff_val[:4]}-{eff_val[4:6]}-{eff_val[6:8]}", eff_val
    return None, eff_val


def parse_spl_zip(zip_path):
    """
    Worker function to parse a single SPL ZIP file.
    Uses global _rld_appl_nos / _rs_appl_nos for speed.
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
        revised_date, effective_time_raw = normalize_effective_date(eff_val)

        doc_type_el = root.find('ns:code', NS)
        doc_type = doc_type_el.get('displayName') if doc_type_el is not None else ""

        title_el = root.find('ns:title', NS)
        title_text = get_el_text(title_el)
        appr_match = re.search(r'Initial U\.S\. Approval:\s*(\d{4})', title_text)
        initial_approval_year = int(appr_match.group(1)) if appr_match else None

        author_path = 'ns:author/ns:assignedEntity/ns:representedOrganization/ns:name'
        author_org = root.find(author_path, NS)
        manufacturer = author_org.text.strip() if (author_org is not None and author_org.text) else ""

        # 2. Product Information
        product_names = []
        generic_names = []
        active_ingredients = []
        dosage_forms = []
        ndc_codes = []
        routes = []
        appr_nums = []
        ingr_map = []

        products = root.findall('.//ns:manufacturedProduct/ns:manufacturedProduct', NS)
        for prod in products:
            name_el = prod.find('ns:name', NS)
            if name_el is not None:
                product_names.append(get_el_text(name_el))

            gen_name_el = prod.find('.//ns:genericMedicine/ns:name', NS)
            if gen_name_el is not None:
                generic_names.append(get_el_text(gen_name_el))

            form_el = prod.find('ns:formCode', NS)
            if form_el is not None:
                dosage_forms.append(form_el.get('displayName') or "")

            ndc_el = prod.find('ns:code', NS)
            if ndc_el is not None:
                ndc_codes.append(ndc_el.get('code') or "")

            for ingr in prod.findall('ns:ingredient', NS):
                class_code = ingr.get('classCode')
                subst_el = ingr.find('ns:ingredientSubstance', NS)
                if subst_el is None:
                    continue

                name_el = subst_el.find('ns:name', NS)
                code_el = subst_el.find('ns:code', NS)

                if name_el is None:
                    continue

                sub_name = get_el_text(name_el)
                unii = ""
                if code_el is not None and code_el.get('codeSystem') == '2.16.840.1.113883.4.9':
                    unii = code_el.get('code') or ""

                is_active = 1 if class_code in ['ACTIM', 'ACTIB'] else 0
                if is_active:
                    active_ingredients.append(sub_name)

                ingr_map.append((spl_id, sub_name, unii, is_active))

            for rel in prod.findall('.//ns:routeCode', NS):
                routes.append(rel.get('displayName') or "")

        appr_el = root.find('.//ns:approval/ns:id', NS)
        if appr_el is not None:
            appr_nums.append(appr_el.get('extension') or "")

        # 3. RLD / RS
        is_rld, is_rs = 0, 0
        all_appr = "; ".join(sorted(set(filter(None, appr_nums))))
        if all_appr:
            digits = re.findall(r'\d+', all_appr)
            for d in digits:
                norm_d = d.lstrip('0')
                if norm_d in _rld_appl_nos:
                    is_rld = 1
                if norm_d in _rs_appl_nos:
                    is_rs = 1

        # 4. Sections
        sections_db = []
        for sec in root.findall('.//ns:section', NS):
            sec_code_el = sec.find('ns:code', NS)
            loinc = sec_code_el.get('code') if sec_code_el is not None else ""

            sec_title_el = sec.find('ns:title', NS)
            title = get_el_text(sec_title_el)

            text_el = sec.find('ns:text', NS)
            if text_el is not None:
                raw_xml = ET.tostring(text_el, encoding='unicode').strip()
                sections_db.append((spl_id, loinc, title, raw_xml))

        metadata = (
            spl_id,
            set_id,
            "; ".join(sorted(set(filter(None, product_names)))),
            "; ".join(sorted(set(filter(None, generic_names)))),
            manufacturer,
            all_appr,
            "; ".join(sorted(set(filter(None, active_ingredients)))),
            "",  # market_categories
            doc_type,
            "; ".join(sorted(set(filter(None, routes)))),
            "; ".join(sorted(set(filter(None, dosage_forms)))),
            "",  # epc
            "; ".join(sorted(set(filter(None, ndc_codes)))),
            revised_date,
            effective_time_raw,
            initial_approval_year,
            is_rld,
            is_rs,
            os.path.basename(zip_path)
        )

        return {
            'spl_id': spl_id,
            'set_id': set_id,
            'revised_date': revised_date,
            'metadata': metadata,
            'ingr_map': ingr_map,
            'sections': sections_db
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

    processed = set()
    try:
        rows = PGUtils.execute_query("SELECT zip_name FROM labeling.processed_zips", fetch=True)
        processed = {r['zip_name'] for r in rows}
    except Exception:
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
                nested_zips = [
                    f for f in all_members
                    if f.endswith('.zip') and any(f.startswith(p) for p in prefixes)
                ]

                for nz_name in nested_zips:
                    inner_name = os.path.basename(nz_name)
                    out_path = storage_path / inner_name
                    if not out_path.exists():
                        with main_z.open(nz_name) as source, open(out_path, 'wb') as target:
                            target.write(source.read())

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
                        if parts[10].strip().upper() == 'YES':
                            rld_nos.add(appl_no)
                        if parts[11].strip().upper() == 'YES':
                            rs_nos.add(appl_no)
            print(f"Loaded {len(rld_nos)} RLD and {len(rs_nos)} RS records from Orange Book.")
        except Exception as e:
            print(f"Warning: Failed to parse Orange Book: {e}")
    else:
        print(f"Warning: Orange Book not found at {ob_path}")

    return rld_nos, rs_nos


def ensure_schema():
    try:
        PGUtils.execute_query("SELECT 1 FROM labeling.sum_spl LIMIT 1")
    except Exception:
        import db_02_init_labeling_schema as labeling_init
        labeling_init.init_labeling_schema()


def refresh_version_lineage():
    """
    Recompute version_number, is_latest, and parent_spl_id within each set_id lineage.
    """
    print("Refreshing version lineage metadata...")
    conn = PGUtils.get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
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
            """)
        conn.commit()
        print("Version lineage metadata updated.")
    except Exception as e:
        conn.rollback()
        print(f"Warning: Could not refresh version lineage: {e}")
    finally:
        conn.close()


def refresh_epc_mappings():
    print("Updating EPC mappings from indexing table...")
    try:
        PGUtils.execute_query("""
            INSERT INTO labeling.epc_map (spl_id, epc_term)
            SELECT DISTINCT m.spl_id, i.indexing_name
            FROM labeling.active_ingredients_map m
            JOIN labeling.substance_indexing i
              ON (
                    (m.unii IS NOT NULL AND m.unii != '' AND m.unii = i.substance_unii)
                 OR ((m.unii IS NULL OR m.unii = '') AND UPPER(m.substance_name) = UPPER(i.substance_name))
              )
            WHERE i.indexing_type = 'EPC'
              AND m.is_active = 1
            ON CONFLICT DO NOTHING
        """)

        PGUtils.execute_query("""
            WITH agg_epc AS (
                SELECT spl_id, string_agg(DISTINCT epc_term, '; ' ORDER BY epc_term) AS epcs
                FROM labeling.epc_map
                GROUP BY spl_id
            )
            UPDATE labeling.sum_spl s
            SET epc = a.epcs
            FROM agg_epc a
            WHERE s.spl_id = a.spl_id
              AND (s.epc IS NULL OR s.epc = '')
        """)
        print("EPC mappings updated.")
    except Exception as e:
        print(f"Warning: Could not update EPC mappings: {e}")


def _flush_batches(meta_batch, ingr_batch, sect_batch, reload_spl_ids):
    """
    Writes one batch to DB.
    - Upserts sum_spl
    - Deletes/reloads child rows for reloaded spl_id values
    """
    if not meta_batch:
        return

    conn = PGUtils.get_connection()
    try:
        with conn.cursor() as cur:
            # 1. Upsert metadata
            cols = [
                'spl_id', 'set_id', 'product_names', 'generic_names', 'manufacturer',
                'appr_num', 'active_ingredients', 'market_categories', 'doc_type',
                'routes', 'dosage_forms', 'epc', 'ndc_codes', 'revised_date',
                'effective_time_raw', 'initial_approval_year', 'is_rld', 'is_rs', 'local_path'
            ]

            insert_sql = sql.SQL("""
                INSERT INTO labeling.sum_spl ({cols})
                VALUES %s
                ON CONFLICT (spl_id) DO UPDATE SET
                    set_id = EXCLUDED.set_id,
                    product_names = EXCLUDED.product_names,
                    generic_names = EXCLUDED.generic_names,
                    manufacturer = EXCLUDED.manufacturer,
                    appr_num = EXCLUDED.appr_num,
                    active_ingredients = EXCLUDED.active_ingredients,
                    market_categories = EXCLUDED.market_categories,
                    doc_type = EXCLUDED.doc_type,
                    routes = EXCLUDED.routes,
                    dosage_forms = EXCLUDED.dosage_forms,
                    ndc_codes = EXCLUDED.ndc_codes,
                    revised_date = EXCLUDED.revised_date,
                    effective_time_raw = EXCLUDED.effective_time_raw,
                    initial_approval_year = EXCLUDED.initial_approval_year,
                    is_rld = EXCLUDED.is_rld,
                    is_rs = EXCLUDED.is_rs,
                    local_path = EXCLUDED.local_path,
                    imported_at = CURRENT_TIMESTAMP
            """).format(cols=sql.SQL(', ').join(map(sql.Identifier, cols)))

            execute_values(cur, insert_sql, meta_batch, page_size=500)

            # 2. Refresh child tables only for reloaded rows
            if reload_spl_ids:
                cur.execute("DELETE FROM labeling.active_ingredients_map WHERE spl_id = ANY(%s)", (reload_spl_ids,))
                cur.execute("DELETE FROM labeling.spl_sections WHERE spl_id = ANY(%s)", (reload_spl_ids,))
                cur.execute("DELETE FROM labeling.epc_map WHERE spl_id = ANY(%s)", (reload_spl_ids,))

            # 3. Reinsert child rows
            if ingr_batch:
                ingr_sql = sql.SQL("""
                    INSERT INTO labeling.active_ingredients_map (spl_id, substance_name, unii, is_active)
                    VALUES %s
                """)
                execute_values(cur, ingr_sql, ingr_batch, page_size=1000)

            if sect_batch:
                sect_sql = sql.SQL("""
                    INSERT INTO labeling.spl_sections (spl_id, loinc_code, title, content_xml)
                    VALUES %s
                """)
                execute_values(cur, sect_sql, sect_batch, page_size=500)

        conn.commit()

    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def sync_from_storage(storage_dir, num_workers=4, force=False, refresh_existing=False):
    """
    Main sync behavior:
    - default: import only SPLs whose spl_id is not already in DB
    - --refresh-existing: reparse and upsert even if spl_id already exists
    - --force: synonym for reparsing everything
    """
    root_dir = Path(__file__).resolve().parent.parent.parent
    storage_path = root_dir / storage_dir
    zip_files = sorted(glob.glob(str(storage_path / "*.zip")))

    if not zip_files:
        print(f"No ZIP files found in {storage_path}")
        return

    print(f"Found {len(zip_files)} ZIP files in {storage_dir}")
    rld_nos, rs_nos = load_orange_book()
    ensure_schema()

    existing_spl_ids = set()
    if not force and not refresh_existing:
        try:
            results = PGUtils.execute_query("SELECT spl_id FROM labeling.sum_spl", fetch=True)
            existing_spl_ids = {r['spl_id'] for r in results}
            print(f"Skipping {len(existing_spl_ids)} SPLs already in database.")
        except Exception:
            pass
    else:
        print("Refresh mode enabled: existing SPLs will be reparsed and upserted.")

    batch_size = 300
    meta_batch = []
    ingr_batch = []
    sect_batch = []
    reload_spl_ids = []

    processed = 0
    skipped = 0
    failed = 0

    print(f"Starting multi-process parsing (workers={num_workers})...")

    with ProcessPoolExecutor(
        max_workers=num_workers,
        initializer=_init_worker,
        initargs=(rld_nos, rs_nos)
    ) as executor:
        future_to_zip = {executor.submit(parse_spl_zip, zp): zp for zp in zip_files}

        for i, future in enumerate(as_completed(future_to_zip), start=1):
            try:
                data = future.result()
            except Exception:
                failed += 1
                continue

            if not data:
                failed += 1
                continue

            spl_id = data['spl_id']

            if not force and not refresh_existing and spl_id in existing_spl_ids:
                skipped += 1
            else:
                meta_batch.append(data['metadata'])
                ingr_batch.extend(data['ingr_map'])
                sect_batch.extend(data['sections'])
                reload_spl_ids.append(spl_id)
                processed += 1

            if len(meta_batch) >= batch_size or i == len(zip_files):
                if meta_batch:
                    try:
                        _flush_batches(meta_batch, ingr_batch, sect_batch, reload_spl_ids)
                    except Exception as e:
                        print(f"\n[ERROR] Batch insertion failed: {e}")

                meta_batch = []
                ingr_batch = []
                sect_batch = []
                reload_spl_ids = []

            if i % 100 == 0 or i == len(zip_files):
                sys.stdout.write(
                    f"\rProgress: {i}/{len(zip_files)} | Imported: {processed} | Skipped: {skipped} | Failed: {failed}"
                )
                sys.stdout.flush()

    print(f"\nFinished Sync. Imported: {processed}, Skipped: {skipped}, Failed: {failed}")

    refresh_version_lineage()
    refresh_epc_mappings()


def main():
    parser = argparse.ArgumentParser(description="DailyMed to PostgreSQL Sync Pipeline (version-aware).")
    parser.add_argument("--downloads-dir", default="data/downloads/dailymed", help="Source for bulk ZIPs")
    parser.add_argument("--storage-dir", default="data/spl_storage", help="Target for extracted labeling ZIPs")
    parser.add_argument("--filter", choices=['prescription', 'human', 'all'], default='human', help="Unpacking filter")
    parser.add_argument("--skip-unpack", action="store_true", help="Skip the unpacking phase")
    parser.add_argument("--workers", type=int, default=4, help="Number of worker processes")
    parser.add_argument("--force", action="store_true", help="Reparse and upsert all labels")
    parser.add_argument("--refresh-existing", action="store_true", help="Reparse and upsert existing spl_id values too")

    args = parser.parse_args()

    print("=== Phase 1: Unpacking Bulk ZIPs ===")
    if not args.skip_unpack:
        unpack_bulk_zips(args.downloads_dir, args.storage_dir, args.filter)
    else:
        print("Unpacking phase skipped.")

    print("\n=== Phase 2: Syncing to PostgreSQL ===")
    sync_from_storage(
        args.storage_dir,
        num_workers=args.workers,
        force=args.force,
        refresh_existing=args.refresh_existing
    )


if __name__ == "__main__":
    main()