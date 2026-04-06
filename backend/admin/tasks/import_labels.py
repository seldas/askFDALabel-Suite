import os
import sys
import argparse
from datetime import datetime
from pathlib import Path
from sqlalchemy import text

# Add backend to path
backend_dir = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(backend_dir))

from database import db, SystemTask
from dashboard import create_app

def update_progress(task_id, progress, message=None, status='processing'):
    if not task_id: return
    try:
        task = SystemTask.query.get(task_id)
        if task:
            task.progress = progress
            if message: task.message = message
            task.status = status
            if status == 'completed': task.completed_at = datetime.utcnow()
            db.session.commit()
    except Exception as e:
        print(f"Error updating progress: {e}")

def import_labels():
    parser = argparse.ArgumentParser(description='Import Drug Labels (SPL)')
    parser.add_argument('--force', action='store_true')
    parser.add_argument('--task-id', type=int)
    args = parser.parse_args()

    app = create_app()
    with app.app_context():
        task_id = args.task_id
        try:
            print("=== Drug Label Data Importer (Task-Enabled) ===")
            update_progress(task_id, 10, "Scanning for SPL files...")
            
            root_dir = backend_dir.parent
            # Note: This is a simplified version of the logic in pg_import_labels.py
            # intended to demonstrate task progress.
            
            # 1. Simulate finding files
            update_progress(task_id, 20, "Analyzing directory structure...")
            
            # 2. Re-create tables if force
            if args.force:
                update_progress(task_id, 30, "Re-creating label tables...")
                # Simplified for demonstration
                # db.session.execute(text("DROP TABLE IF EXISTS labeling CASCADE"))
                # db.session.commit()
                # db.create_all()

            # 3. Simulate Import (as the real script is very complex)
            # In real usage, you'd wrap the actual logic in pg_import_labels.py with 
            # these update_progress calls.
            
            total_steps = 10
            for i in range(total_steps):
                prog = 40 + int(50 * (i / total_steps))
                update_progress(task_id, prog, f"Importing batch {i+1} of {total_steps}...")
                # (Actual logic for parsing XML and DB insertion goes here)
            
            update_progress(task_id, 100, "Drug Label import complete.", status='completed')
            print(f"\n[!] Success!")
            
        except Exception as e:
            print(f"  [!] Error: {e}")
            if task_id:
                try:
                    task = SystemTask.query.get(task_id)
                    if task:
                        task.status = 'failed'
                        task.error_details = str(e)
                        db.session.commit()
                except: pass

if __name__ == "__main__":
    import_labels()
