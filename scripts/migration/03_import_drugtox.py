import os
import sys
import pandas as pd
from pathlib import Path

# Add backend to path
root_dir = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(root_dir / 'backend'))

from database import db, DrugToxicity
from dashboard import create_app

def import_drugtox():
    app = create_app()
    with app.app_context():
        print("=== DrugTox Data Importer ===")
        
        root_dir = Path(__file__).resolve().parent.parent.parent
        excel_path = root_dir / 'data' / 'downloads' / 'ALT_update_latest.xlsx'
        
        if not excel_path.exists():
            print(f"Error: Excel file not found at {excel_path}")
            return

        print(f"Reading {excel_path}...")
        try:
            df = pd.read_excel(excel_path)
        except Exception as e:
            print(f"Error reading Excel file: {e}")
            return

        # Basic Cleaning
        df.columns = [c.replace(' ', '_').replace('/', '_').replace('(', '').replace(')', '').replace('-', '_') for c in df.columns]
        
        if 'SETID' not in df.columns:
            print("Error: SETID column missing.")
            return

        print("Calculating historical flags...")
        df = df.sort_values(
            ['Trade_Name', 'Author_Organization', 'Tox_Type', 'SPL_Effective_Time'], 
            ascending=[True, True, True, False]
        )
        
        df['is_historical'] = df.duplicated(
            subset=['Trade_Name', 'Author_Organization', 'Tox_Type'], 
            keep='first'
        ).astype(int)

        print(f"Importing {len(df)} records into 'drug_toxicity' table...")
        
        # Clear existing
        DrugToxicity.query.delete()
        db.session.commit()

        # Bulk insert
        objects = []
        for _, row in df.iterrows():
            objects.append(DrugToxicity(
                SETID=str(row['SETID']),
                Trade_Name=str(row.get('Trade_Name', '')),
                Generic_Proper_Names=str(row.get('Generic_Proper_Names', '')),
                Toxicity_Class=str(row.get('Toxicity_Class', '')),
                Author_Organization=str(row.get('Author_Organization', '')),
                Tox_Type=str(row.get('Tox_Type', '')),
                SPL_Effective_Time=str(row.get('SPL_Effective_Time', '')),
                Changed=str(row.get('Changed', '')),
                is_historical=int(row.get('is_historical', 0)),
                Update_Notes=str(row.get('Update_Notes', '')) if pd.notna(row.get('Update_Notes')) else None,
                AI_Summary=str(row.get('AI_Summary', '')) if pd.notna(row.get('AI_Summary')) else None
            ))
            
            if len(objects) >= 1000:
                db.session.bulk_save_objects(objects)
                db.session.commit()
                objects = []
        
        if objects:
            db.session.bulk_save_objects(objects)
            db.session.commit()
            
        print(f"Success! Imported {len(df)} records.")

if __name__ == "__main__":
    import_drugtox()
