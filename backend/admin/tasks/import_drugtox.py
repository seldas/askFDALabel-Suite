import os
import sys
import argparse
import pandas as pd
from datetime import datetime
from pathlib import Path
from sqlalchemy import text

# Add backend to path
backend_dir = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(backend_dir))

from database import db, DrugToxicity, SystemTask
from dashboard import create_app

def update_progress(task_id, progress, message=None, status='processing'):
    if not task_id: return
    try:
        task = SystemTask.query.get(task_id)
        if task:
            task.progress = progress
            if message: task.message = message
            task.status = status
            if status == 'completed': task.completed_at = datetime.utcnow()
            db.session.commit()
    except Exception as e:
        print(f"Error updating progress: {e}")

def import_drugtox():
    parser = argparse.ArgumentParser(description='Import DrugToxicity data')
    parser.add_argument('--force', action='store_true')
    parser.add_argument('--task-id', type=int)
    args = parser.parse_args()

    app = create_app()
    with app.app_context():
        task_id = args.task_id
        try:
            print("=== DrugTox Data Importer (Task-Enabled) ===")
            update_progress(task_id, 5, "Initializing DrugTox import...")
            
            table_name = DrugToxicity.__tablename__
            
            if args.force:
                print(f"  [-] Force update: Dropping {table_name} table...")
                db.session.execute(text(f"DROP TABLE IF EXISTS {table_name} CASCADE"))
                db.session.commit()
                db.create_all()

            root_dir = backend_dir.parent
            excel_path = root_dir / 'data' / 'downloads' / 'ALT_update_latest.xlsx'
            
            if not excel_path.exists():
                raise FileNotFoundError(f"Excel file not found at {excel_path}")

            print(f"  [+] Reading {excel_path}...")
            update_progress(task_id, 15, "Reading Excel data...")
            df = pd.read_excel(excel_path)

            # Basic Cleaning
            df.columns = [c.replace(' ', '_').replace('/', '_').replace('(', '').replace(')', '').replace('-', '_') for c in df.columns]
            
            if 'SETID' not in df.columns:
                raise ValueError("SETID column missing from Excel file.")

            print("  [+] Calculating historical flags...")
            update_progress(task_id, 40, "Processing historical flags...")
            df = df.sort_values(
                ['Trade_Name', 'Author_Organization', 'Tox_Type', 'SPL_Effective_Time'], 
                ascending=[True, True, True, False]
            )
            
            df['is_historical'] = df.duplicated(
                subset=['Trade_Name', 'Author_Organization', 'Tox_Type'], 
                keep='first'
            ).astype(int)

            print(f"  [+] Importing {len(df)} records...")
            update_progress(task_id, 60, f"Importing {len(df)} records...")
            
            objects = []
            batch_size = 500
            total_count = 0
            total_rows = len(df)
            
            for i, (_, row) in enumerate(df.iterrows()):
                data = {
                    'SETID': str(row['SETID']),
                    'Trade_Name': str(row.get('Trade_Name', '')),
                    'Generic_Proper_Names': str(row.get('Generic_Proper_Names', '')),
                    'Toxicity_Class': str(row.get('Toxicity_Class', '')),
                    'Author_Organization': str(row.get('Author_Organization', '')),
                    'Tox_Type': str(row.get('Tox_Type', '')),
                    'SPL_Effective_Time': str(row.get('SPL_Effective_Time', '')),
                    'Changed': str(row.get('Changed', '')),
                    'is_historical': int(row.get('is_historical', 0)),
                    'Update_Notes': str(row.get('Update_Notes', '')) if pd.notna(row.get('Update_Notes')) else None,
                    'AI_Summary': str(row.get('AI_Summary', '')) if pd.notna(row.get('AI_Summary')) else None
                }
                objects.append(data)
                
                if len(objects) >= batch_size:
                    db.session.bulk_insert_mappings(DrugToxicity, objects)
                    db.session.commit()
                    total_count += len(objects)
                    prog = 60 + int(35 * (i / total_rows))
                    update_progress(task_id, prog)
                    objects = []
            
            if objects:
                db.session.bulk_insert_mappings(DrugToxicity, objects)
                db.session.commit()
                
            update_progress(task_id, 100, "DrugTox import complete.", status='completed')
            print(f"\n[!] Success! Imported records.")
            
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
    import_drugtox()
