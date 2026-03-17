import os
import json
import psycopg2
import gzip
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
from pathlib import Path

load_dotenv()

def export_embeddings(output_file="data/embeddings_export.json.gz"):
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("Error: DATABASE_URL not found in .env")
        return

    print(f"Connecting to source database...")
    try:
        conn = psycopg2.connect(db_url, cursor_factory=RealDictCursor)
        cur = conn.cursor()

        # Query all fields. We cast embedding to text for easy JSON serialization
        query = """
            SELECT set_id, spl_id, section_title, chunk_text, 
                   embedding::text as embedding_str, created_at::text as created_at_str
            FROM label_embeddings
        """
        
        print("Fetching data from 'label_embeddings'...")
        cur.execute(query)
        rows = cur.fetchall()
        
        print(f"Exporting {len(rows)} records to {output_file}...")
        
        # Ensure directory exists
        Path(output_file).parent.mkdir(parents=True, exist_ok=True)

        with gzip.open(output_file, 'wt', encoding='utf-8') as f:
            json.dump(rows, f)

        print("Export completed successfully.")
        
    except Exception as e:
        print(f"Export failed: {e}")
    finally:
        if 'conn' in locals(): conn.close()

if __name__ == "__main__":
    export_embeddings()
