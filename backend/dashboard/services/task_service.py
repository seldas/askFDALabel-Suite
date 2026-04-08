import threading
import json
import logging
from datetime import datetime
from database import db, SystemTask

logger = logging.getLogger(__name__)

class TaskService:
    @staticmethod
    def create_task(task_type, user_id=None, project_id=None, message=None):
        """Create a new SystemTask record in the database."""
        task = SystemTask(
            task_type=task_type,
            user_id=user_id,
            project_id=project_id,
            message=message or f"Starting {task_type} task...",
            status='pending',
            progress=0
        )
        db.session.add(task)
        db.session.commit()
        return task

    @staticmethod
    def update_task(task_id, progress=None, message=None, status=None, result_data=None, error_details=None):
        """Update an existing SystemTask record."""
        # Use a new session to avoid issues with background threads
        task = SystemTask.query.get(task_id)
        if not task:
            logger.error(f"Task {task_id} not found for update.")
            return None

        if progress is not None:
            task.progress = progress
        if message:
            task.message = message
        if status:
            task.status = status
            if status in ['completed', 'failed']:
                task.completed_at = datetime.utcnow()
        if result_data:
            task.result_data = json.dumps(result_data) if isinstance(result_data, (dict, list)) else result_data
        if error_details:
            task.error_details = error_details

        db.session.commit()
        return task

    @staticmethod
    def start_background_task(app, task_id, target_fn, *args, **kwargs):
        """Run a function in a background thread with application context."""
        def wrapper():
            with app.app_context():
                try:
                    TaskService.update_task(task_id, status='processing')
                    target_fn(task_id, *args, **kwargs)
                except Exception as e:
                    logger.error(f"Background task {task_id} failed: {e}", exc_info=True)
                    TaskService.update_task(task_id, status='failed', error_details=str(e))

        thread = threading.Thread(target=wrapper, daemon=True)
        thread.start()
        return thread
