import sqlite3
import os

db_path = 'users.db'
if os.path.exists('instance/users.db'):
    db_path = 'instance/users.db'

print(f"Checking database at: {db_path}")
if not os.path.exists(db_path):
    print("Database file not found.")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()
cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = cursor.fetchall()
print("Tables:", [t[0] for t in tables])
conn.close()