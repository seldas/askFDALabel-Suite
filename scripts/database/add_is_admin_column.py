import sys
from pathlib import Path
from sqlalchemy import text

# Add backend to path
root_dir = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(root_dir / 'backend'))

from database import db
from dashboard import create_app

def add_column():
    app = create_app()
    with app.app_context():
        print("=== Adding 'is_admin' column to 'user' table ===")
        try:
            # Check if column exists first (PostgreSQL)
            check_sql = text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='user' AND column_name='is_admin';
            """)
            result = db.session.execute(check_sql).fetchone()
            
            if not result:
                print("Column 'is_admin' not found. Adding it...")
                add_sql = text("ALTER TABLE \"user\" ADD COLUMN is_admin BOOLEAN DEFAULT FALSE;")
                db.session.execute(add_sql)
                db.session.commit()
                print("Column 'is_admin' successfully added.")
            else:
                print("Column 'is_admin' already exists.")
                
        except Exception as e:
            db.session.rollback()
            print(f"Error adding column: {e}")

if __name__ == "__main__":
    add_column()
