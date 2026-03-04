import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()
conn = psycopg2.connect(os.getenv('DATABASE_URL'))
cur = conn.cursor()
cur.execute("""
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_schema = 'labeling' AND table_name = 'sum_spl'
""")
cols = cur.fetchall()
print("Columns in labeling.sum_spl:")
for col in cols:
    print(f" - {col[0]}")
conn.close()
