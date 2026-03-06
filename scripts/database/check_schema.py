import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()
conn = psycopg2.connect(os.getenv('DATABASE_URL'))
cur = conn.cursor()
cur.execute("""
    SELECT atttypmod 
    FROM pg_attribute 
    WHERE attrelid = 'label_embeddings'::regclass 
      AND attname = 'embedding'
""")
res = cur.fetchone()
if res:
    print(f"Embedding dimension: {res[0]}")
else:
    print("Column 'embedding' not found or has no dimension.")
conn.close()
