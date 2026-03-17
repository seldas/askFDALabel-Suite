import os
import json
import gzip
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

load_dotenv()

def import_embeddings(input_file="data/embeddings_export.json.gz"):
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("Error: DATABASE_URL not found in .env")
        return

    if not os.path.exists(input_file):
        print(f"Error: Export file {input_file} not found.")
        return

    try:
        print(f"Connecting to target database...")
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()

        # 1. Fetch available set_ids from the target environment (master labeling table)
        print("Fetching existing set_ids from 'labeling.sum_spl'...")
        cur.execute("SELECT set_id FROM labeling.sum_spl")
        available_set_ids = {row[0] for row in cur.fetchall()}
        print(f"Found {len(available_set_ids)} available labels in target database.")

        if not available_set_ids:
            print("Warning: No labels found in 'labeling.sum_spl'. Nothing will be imported.")
            return

        # 2. Read and filter data from export file
        print(f"Reading data from {input_file}...")
        with gzip.open(input_file, 'rt', encoding='utf-8') as f:
            data = json.load(f)
        
        print("Filtering embeddings for available labels...")
        values = []
        skipped_count = 0
        
        for r in data:
            if r['set_id'] in available_set_ids:
                values.append((
                    r['set_id'], 
                    r['spl_id'], 
                    r['section_title'], 
                    r['chunk_text'], 
                    r['embedding_str']
                ))
            else:
                skipped_count += 1

        if not values:
            print("No matching labels found for the exported embeddings. Import aborted.")
            return

        # 3. Perform bulk insert
        print(f"Inserting {len(values)} records (Skipped {skipped_count} unmatched records)...")
        insert_query = """
            INSERT INTO label_embeddings (set_id, spl_id, section_title, chunk_text, embedding)
            VALUES %s
        """
        
        execute_values(cur, insert_query, values)
        
        conn.commit()
        print("Import completed successfully.")

    except Exception as e:
        print(f"Import failed: {e}")
        if 'conn' in locals(): conn.rollback()
    finally:
        if 'conn' in locals(): conn.close()

if __name__ == "__main__":
    import_embeddings()
