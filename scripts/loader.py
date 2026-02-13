import pandas as pd
import sqlite3
import os
import glob
from sqlalchemy import create_engine, text

# Configuration
DB_NAME = "data/afd.db"
# We look for ALT_latest.xlsx, but if not found, we look for any ALT_update_*.xlsx
DEFAULT_EXCEL_PATH = "data/ALT_latest.xlsx"
TABLE_NAME = "drug_toxicity"

def get_latest_excel():
    if os.path.exists(DEFAULT_EXCEL_PATH):
        return DEFAULT_EXCEL_PATH
    
    # Fallback: Find the most recent ALT_update_*.xlsx file
    files = glob.glob("data/ALT_update_*.xlsx")
    if not files:
        return None
    # Sort by filename (which includes date) descending
    files.sort(reverse=True)
    return files[0]

def load_data():
    excel_path = get_latest_excel()
    if not excel_path:
        print("Error: No Excel file found in data/ folder (expected ALT_latest.xlsx or ALT_update_*.xlsx)")
        return

    print(f"Reading {excel_path}...")
    try:
        df = pd.read_excel(excel_path)
    except Exception as e:
        print(f"Error reading Excel file: {e}")
        return

    # Basic Cleaning: Standardize column names for SQL
    # Removing spaces and special characters
    df.columns = [c.replace(' ', '_').replace('/', '_').replace('(', '').replace(')', '').replace('-', '_') for c in df.columns]
    
    # Ensure SETID is present (it's our primary key)
    if 'SETID' not in df.columns:
        print("Error: SETID column missing from the dataset. This is required for indexing.")
        return

    # Calculate custom historical flag
    # Group by Brand, Company, and Tox Type, then find the latest Effective Time
    print("Calculating historical flags...")
    # Sort by Name, Company, Tox Type, and Time (Descending)
    df = df.sort_values(
        ['Trade_Name', 'Author_Organization', 'Tox_Type', 'SPL_Effective_Time'], 
        ascending=[True, True, True, False]
    )
    
    # is_historical = 1 if it's a duplicate in the sorted group (i.e., not the first/latest one)
    df['is_historical'] = df.duplicated(
        subset=['Trade_Name', 'Author_Organization', 'Tox_Type'], 
        keep='first'
    ).astype(int)

    engine = create_engine(f"sqlite:///{DB_NAME}")
    
    print(f"Importing {len(df)} records into '{TABLE_NAME}' table...")
    
    try:
        # We use 'replace' to ensure the schema matches the latest Excel structure.
        # However, to maintain primary keys and indexes, we need to apply them after.
        df.to_sql(TABLE_NAME, engine, if_exists='replace', index=False)
        
        with engine.connect() as conn:
            # SQLite doesn't support 'ALTER TABLE' to add primary keys easily.
            # But we can create indexes which serve a similar performance purpose for queries.
            print("Creating indexes...")
            conn.execute(text(f"CREATE INDEX IF NOT EXISTS idx_setid ON {TABLE_NAME} (SETID)"))
            conn.execute(text(f"CREATE INDEX IF NOT EXISTS idx_trade_name ON {TABLE_NAME} (Trade_Name)"))
            conn.execute(text(f"CREATE INDEX IF NOT EXISTS idx_generic_name ON {TABLE_NAME} (Generic_Proper_Names)"))
            conn.execute(text(f"CREATE INDEX IF NOT EXISTS idx_tox_class ON {TABLE_NAME} (Toxicity_Class)"))
            conn.commit()
            
        print(f"Success! Database '{DB_NAME}' updated with {len(df)} records.")
        
    except Exception as e:
        print(f"Error during database import: {e}")

if __name__ == "__main__":
    load_data()
