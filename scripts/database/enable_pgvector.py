import psycopg2
import os
from dotenv import load_dotenv
from pathlib import Path

def enable_pgvector():
    env_path = Path(__file__).resolve().parent.parent.parent / '.env'
    load_dotenv(dotenv_path=env_path)
    
    db_url = os.getenv('DATABASE_URL')
    if not db_url:
        print("DATABASE_URL not found in .env")
        return

    # Replace 'db' with 'localhost' if running from host
    if '@db:' in db_url:
        db_url = db_url.replace('@db:', '@localhost:')

    try:
        conn = psycopg2.connect(db_url)
        conn.autocommit = True
        with conn.cursor() as cur:
            print("Enabling pgvector extension...")
            cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")
            print("Success!")
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    enable_pgvector()
