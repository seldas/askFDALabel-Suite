import sqlite3
import os
import re

def fix_rld_status(db_path="data/label.db"):
    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return

    # Load RLD/RS application numbers from Orange Book products.txt
    rld_appl_nos = set()
    rs_appl_nos = set()
    ob_file_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'downloads', 'EOB_2026_01', 'products.txt')
    if os.path.exists(ob_file_path):
        try:
            with open(ob_file_path, 'r', encoding='latin-1') as f:
                header = f.readline()
                for line in f:
                    parts = line.split('~')
                    if len(parts) > 11:
                        appl_no = parts[6].strip().lstrip('0')
                        if parts[10].strip().upper() == 'YES':
                            rld_appl_nos.add(appl_no)
                        if parts[11].strip().upper() == 'YES':
                            rs_appl_nos.add(appl_no)
            print(f"Loaded {len(rld_appl_nos)} RLD and {len(rs_appl_nos)} RS application numbers.")
        except Exception as e:
            print(f"Error reading Orange Book file: {e}")
            return
    else:
        print(f"Orange Book file not found at {ob_file_path}")
        return

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    print("Updating RLD/RS status in sum_spl based on application numbers...")
    
    # Fetch all records to check
    cursor.execute("SELECT spl_id, appr_num FROM sum_spl")
    rows = cursor.fetchall()
    
    updates = [] # (is_rld, is_rs, spl_id)
    
    for row in rows:
        spl_id = row['spl_id']
        appr_num = row['appr_num']
        
        is_rld = 0
        is_rs = 0
        if appr_num:
            appr_parts = re.findall(r'\d+', appr_num)
            for ap in appr_parts:
                ap_norm = ap.lstrip('0')
                if ap_norm in rld_appl_nos:
                    is_rld = 1
                if ap_norm in rs_appl_nos:
                    is_rs = 1
        
        updates.append((is_rld, is_rs, spl_id))

    if updates:
        # Batch update
        cursor.executemany("UPDATE sum_spl SET is_rld = ?, is_rs = ? WHERE spl_id = ?", updates)
        conn.commit()
        print(f"Successfully updated {len(updates)} records.")
    else:
        print("No matches found.")

    conn.close()

if __name__ == "__main__":
    fix_rld_status()
