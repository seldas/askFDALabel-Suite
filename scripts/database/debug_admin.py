import sys
from pathlib import Path

# Add backend to path
root_dir = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(root_dir / 'backend'))

from database import db, User
from dashboard import create_app
from sqlalchemy import text

def debug_admin():
    app = create_app()
    with app.app_context():
        print("=== Debugging Admin Login ===")
        
        # 1. Check if column exists
        try:
            res = db.session.execute(text("SELECT is_admin FROM \"user\" LIMIT 1")).fetchone()
            print(f"Column 'is_admin' exists check: Success")
        except Exception as e:
            print(f"Column 'is_admin' exists check: FAILED - {e}")
            return

        # 2. Check admin user
        admin = User.query.filter_by(username='admin').first()
        if not admin:
            print("User 'admin' NOT FOUND in database.")
        else:
            print(f"User 'admin' found. ID: {admin.id}, is_admin: {admin.is_admin}")
            
            # 3. Test password check
            password_to_test = "1986414"
            try:
                is_valid = admin.check_password(password_to_test)
                print(f"Password check for '{password_to_test}': {'SUCCESS' if is_valid else 'FAILED'}")
            except Exception as e:
                print(f"Password check error: {e}")

if __name__ == "__main__":
    debug_admin()
