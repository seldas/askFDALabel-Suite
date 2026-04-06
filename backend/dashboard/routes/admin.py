import os
import subprocess
import sys
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from database import db, User, SystemTask
from functools import wraps

admin_bp = Blueprint('admin', __name__)

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated or not current_user.is_admin:
            return jsonify({'success': False, 'error': 'Admin privileges required'}), 403
        return f(*args, **kwargs)
    return decorated_function

# --- User Management ---

@admin_bp.route('/users', methods=['GET'])
@login_required
@admin_required
def get_users():
    users = User.query.all()
    return jsonify({
        'success': True,
        'users': [{
            'id': u.id,
            'username': u.username,
            'is_admin': u.is_admin,
            'ai_provider': u.ai_provider
        } for u in users]
    })

@admin_bp.route('/users', methods=['POST'])
@login_required
@admin_required
def create_user():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    is_admin = data.get('is_admin', False)

    if not username or not password:
        return jsonify({'success': False, 'error': 'Username and password required'}), 400

    if User.query.filter_by(username=username).first():
        return jsonify({'success': False, 'error': 'Username already exists'}), 400

    new_user = User(username=username, is_admin=is_admin)
    new_user.set_password(password)
    db.session.add(new_user)
    db.session.commit()
    return jsonify({'success': True, 'user_id': new_user.id})

@admin_bp.route('/users/<int:user_id>', methods=['PUT'])
@login_required
@admin_required
def update_user(user_id):
    user = User.query.get_or_404(user_id)
    data = request.get_json()

    if 'is_admin' in data:
        user.is_admin = data['is_admin']
    if 'password' in data and data['password']:
        user.set_password(data['password'])
    if 'username' in data:
        user.username = data['username']

    db.session.commit()
    return jsonify({'success': True})

@admin_bp.route('/users/<int:user_id>', methods=['DELETE'])
@login_required
@admin_required
def delete_user(user_id):
    if user_id == current_user.id:
        return jsonify({'success': False, 'error': 'Cannot delete yourself'}), 400
    
    user = User.query.get_or_404(user_id)
    db.session.delete(user)
    db.session.commit()
    return jsonify({'success': True})

# --- Database Updates ---

@admin_bp.route('/update_db', methods=['POST'])
@login_required
@admin_required
def trigger_db_update():
    data = request.get_json()
    db_type = data.get('type') # 'labeling', 'orangebook', 'drugtox', 'meddra'
    
    scripts = {
        'labeling': 'backend/admin/tasks/import_labels.py',
        'orangebook': 'backend/admin/tasks/import_orangebook.py',
        'drugtox': 'backend/admin/tasks/import_drugtox.py',
        'meddra': 'backend/admin/tasks/import_meddra.py'
    }

    if db_type not in scripts:
        return jsonify({'success': False, 'error': 'Invalid database type'}), 400

    # Create a new SystemTask
    new_task = SystemTask(
        task_type=db_type,
        status='processing',
        progress=0,
        message=f'Starting {db_type} update...'
    )
    db.session.add(new_task)
    db.session.commit()

    script_path = scripts[db_type]
    venv_python = os.path.join(os.getcwd(), 'venv', 'bin', 'python3')
    if not os.path.exists(venv_python):
        venv_python = sys.executable

    try:
        # Pass --task-id to the script
        cmd = [venv_python, script_path, '--force', '--task-id', str(new_task.id)]
        
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        
        return jsonify({
            'success': True, 
            'task_id': new_task.id,
            'message': f'Started update for {db_type}.'
        })
    except Exception as e:
        new_task.status = 'failed'
        new_task.error_details = str(e)
        db.session.commit()
        return jsonify({'success': False, 'error': str(e)}), 500

@admin_bp.route('/tasks/<int:task_id>', methods=['GET'])
@login_required
@admin_required
def get_task_status(task_id):
    task = SystemTask.query.get_or_404(task_id)
    return jsonify({
        'success': True,
        'task': {
            'id': task.id,
            'type': task.task_type,
            'status': task.status,
            'progress': task.progress,
            'message': task.message,
            'error_details': task.error_details,
            'updated_at': task.updated_at.isoformat() if task.updated_at else None
        }
    })
