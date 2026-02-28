import sqlite3
import os

def init_db(db_path="data/label.db"):
    # Ensure directory exists
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    print(f"Initializing {db_path}...")

    # 1. Main Metadata Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sum_spl (
        spl_id TEXT PRIMARY KEY,
        set_id TEXT,
        product_names TEXT,
        generic_names TEXT,
        manufacturer TEXT,
        appr_num TEXT,
        active_ingredients TEXT,
        market_categories TEXT,
        doc_type TEXT,
        routes TEXT,
        dosage_forms TEXT,
        epc TEXT,
        ndc_codes TEXT,
        revised_date TEXT,
        initial_approval_year INTEGER,
        is_rld INTEGER DEFAULT 0
    )
    """)

    # 2. Section Content Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS spl_sections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        spl_id TEXT,
        loinc_code TEXT,
        title TEXT,
        content_xml TEXT,
        FOREIGN KEY(spl_id) REFERENCES sum_spl(spl_id)
    )
    """)

    # 3. Full-Text Search Virtual Table
    # FTS5 requires specific syntax for external content if used, 
    # but here we'll use a standard FTS5 table for simplicity and speed.
    try:
        cursor.execute("""
        CREATE VIRTUAL TABLE IF NOT EXISTS spl_sections_search USING fts5(
            spl_id UNINDEXED,
            loinc_code UNINDEXED,
            title,
            content_text
        )
        """)
    except sqlite3.OperationalError as e:
        print(f"Error creating FTS5 table: {e}. Ensure SQLite was compiled with FTS5.")

    # 4. Mapping Tables
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS active_ingredients_map (
        spl_id TEXT,
        substance_name TEXT,
        is_active INTEGER,
        FOREIGN KEY(spl_id) REFERENCES sum_spl(spl_id)
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS epc_map (
        spl_id TEXT,
        epc_term TEXT,
        FOREIGN KEY(spl_id) REFERENCES sum_spl(spl_id)
    )
    """)

    conn.commit()
    conn.close()
    print("Database initialization complete.")

if __name__ == "__main__":
    init_db()
