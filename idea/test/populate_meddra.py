import os
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from srcs.extensions import db
from srcs import create_app
from srcs.models import (
    MeddraSOC, MeddraHLGT, MeddraHLT, MeddraPT, MeddraLLT, 
    MeddraMDHIER, MeddraSMQList, MeddraSMQContent
)
from sqlalchemy import func

def parse_int(value):
    if not value or value.strip() == '':
        return None
    try:
        return int(value)
    except ValueError:
        return None

def process_file(file_name, model_class, field_mapping, data_dir, batch_size=5000):
    file_path = os.path.join(data_dir, file_name)
    if not os.path.exists(file_path):
        print(f"  [!] Skipping {file_name}: File not found in {data_dir}")
        return

    # Check if data already exists
    existing_count = db.session.query(model_class).count()
    if existing_count > 0:
        print(f"  [i] Table {model_class.__tablename__} already has {existing_count} records. Skipping.")
        return

    print(f"  [+] Importing {file_name} into {model_class.__tablename__}...")
    
    objects = []
    count = 0
    total_count = 0
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            for line in f:
                parts = line.strip().split('$')
                
                data = {}
                for field, index in field_mapping.items():
                    if index < len(parts):
                        val = parts[index]
                        col = getattr(model_class, field)
                        if str(col.type).startswith('INTEGER'):
                            data[field] = parse_int(val)
                        else:
                            data[field] = val if val != '' else None
                
                objects.append(data)
                count += 1
                
                if count >= batch_size:
                    db.session.bulk_insert_mappings(model_class, objects)
                    db.session.commit()
                    total_count += count
                    print(f"    - Inserted {total_count} records...")
                    objects = []
                    count = 0
            
            if objects:
                db.session.bulk_insert_mappings(model_class, objects)
                db.session.commit()
                total_count += count
                print(f"    - Finished! Total {total_count} records.")
                
    except Exception as e:
        print(f"  [!] Error processing {file_name}: {e}")
        db.session.rollback()

def run_import():
    app = create_app()
    with app.app_context():
        print("=== MedDRA Data Importer ===")
        
        # Determine data directory
        data_dir = os.path.join('data', 'downloads', 'MedDRA_28_0_ENglish', 'MedAscii')
        if not os.path.exists(data_dir):
            print(f"Critical Error: MedDRA data directory not found at {data_dir}")
            print("Please ensure you have downloaded and extracted MedDRA into that folder.")
            return

        # 1. SOC
        process_file('soc.asc', MeddraSOC, {
            'soc_code': 0, 'soc_name': 1, 'soc_abbrev': 2, 'soc_whoart_code': 3,
            'soc_harts_code': 4, 'soc_costart_code': 5, 'soc_icd9_code': 6,
            'soc_icd9cm_code': 7, 'soc_icd10_code': 8, 'soc_currency': 9
        }, data_dir)

        # 2. HLGT
        process_file('hlgt.asc', MeddraHLGT, {
            'hlgt_code': 0, 'hlgt_name': 1, 'hlgt_whoart_code': 2, 'hlgt_harts_code': 3,
            'hlgt_costart_code': 4, 'hlgt_icd9_code': 5, 'hlgt_icd9cm_code': 6,
            'hlgt_icd10_code': 7, 'hlgt_currency': 8
        }, data_dir)

        # 3. HLT
        process_file('hlt.asc', MeddraHLT, {
            'hlt_code': 0, 'hlt_name': 1, 'hlt_whoart_code': 2, 'hlt_harts_code': 3,
            'hlt_costart_code': 4, 'hlt_icd9_code': 5, 'hlt_icd9cm_code': 6,
            'hlt_icd10_code': 7, 'hlt_currency': 8
        }, data_dir)

        # 4. PT
        process_file('pt.asc', MeddraPT, {
            'pt_code': 0, 'pt_name': 1, 'null_field': 2, 'pt_soc_code': 3,
            'pt_whoart_code': 4, 'pt_harts_code': 5, 'pt_costart_code': 6,
            'pt_icd9_code': 7, 'pt_icd9cm_code': 8, 'pt_icd10_code': 9, 'pt_currency': 10
        }, data_dir)

        # 5. LLT
        process_file('llt.asc', MeddraLLT, {
            'llt_code': 0, 'llt_name': 1, 'pt_code': 2, 'llt_whoart_code': 3,
            'llt_harts_code': 4, 'llt_costart_code': 5, 'llt_icd9_code': 6,
            'llt_icd9cm_code': 7, 'llt_icd10_code': 8, 'llt_currency': 9
        }, data_dir)

        # 6. MDHIER
        process_file('mdhier.asc', MeddraMDHIER, {
            'pt_code': 0, 'hlt_code': 1, 'hlgt_code': 2, 'soc_code': 3,
            'pt_name': 4, 'hlt_name': 5, 'hlgt_name': 6, 'soc_name': 7,
            'soc_abbrev': 8, 'null_field': 9, 'pt_soc_code': 10, 'primary_soc_fg': 11
        }, data_dir)

        # 7. SMQ List
        process_file('smq_list.asc', MeddraSMQList, {
            'smq_code': 0, 'smq_name': 1, 'smq_level': 2, 'smq_description': 3,
            'smq_source': 4, 'smq_note': 5, 'meddra_version': 6, 'status': 7, 'smq_algorithm': 8
        }, data_dir)

        # 8. SMQ Content
        process_file('smq_content.asc', MeddraSMQContent, {
            'smq_code': 0, 'term_code': 1, 'term_level': 2, 'term_scope': 3,
            'term_category': 4, 'term_weight': 5, 'term_status': 6,
            'term_addition_version': 7, 'term_last_modified_version': 8
        }, data_dir)

        print("\n[!] MedDRA Population complete.")

if __name__ == '__main__':
    run_import()
