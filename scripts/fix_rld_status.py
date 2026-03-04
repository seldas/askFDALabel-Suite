import sqlite3
import os
import re

def fix_rld_status(db_path="data/label.db"):
    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return

    # Load RLD application numbers from Orange Book products.txt
    rld_appl_nos = set()
    ob_file_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'downloads', 'EOB_2026_01', 'products.txt')
    if os.path.exists(ob_file_path):
        try:
            with open(ob_file_path, 'r', encoding='latin-1') as f:
                header = f.readline()
                for line in f:
                    parts = line.split('~')
                    if len(parts) > 10:
                        is_rld_val = parts[10].strip().upper()
                        if is_rld_val == 'YES':
                            appl_no = parts[6].strip()
                            rld_appl_nos.add(appl_no.lstrip('0'))
            print(f"Loaded {len(rld_appl_nos)} RLD application numbers from Orange Book.")
        except Exception as e:
            print(f"Error reading Orange Book file: {e}")
            return
    else:
        print(f"Orange Book file not found at {ob_file_path}")
        return

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    print("Updating RLD status in sum_spl based on application numbers...")
    
    # Fetch all records to check
    cursor.execute("SELECT spl_id, appr_num FROM sum_spl")
    rows = cursor.fetchall()
    
    update_count = 0
    updates = []
    
    for row in rows:
        spl_id = row['spl_id']
        appr_num = row['appr_num']
        
        is_rld = 0
        if appr_num:
            appr_parts = re.findall(r'\d+', appr_num)
            for ap in appr_parts:
                if ap.lstrip('0') in rld_appl_nos:
                    is_rld = 1
                    break
        
        if is_rld == 1:
            updates.append((spl_id,))
            update_count += 1

    # Reset all to 0 first
    cursor.execute("UPDATE sum_spl SET is_rld = 0")
    
    if updates:
        # Batch update is_rld = 1
        cursor.executemany("UPDATE sum_spl SET is_rld = 1 WHERE spl_id = ?", updates)
        conn.commit()
        print(f"Successfully updated {update_count} records as RLD.")
    else:
        print("No RLD matches found.")

    conn.close()

if __name__ == "__main__":
    fix_rld_status()
