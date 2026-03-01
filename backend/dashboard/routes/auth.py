import re
from flask import Blueprint, request, jsonify
from flask_login import login_user, login_required, logout_user, current_user
from database import db, User
import logging

logger = logging.getLogger(__name__)

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/login', methods=['POST'])
def login():
    if current_user.is_authenticated:
        return jsonify({'success': True, 'message': 'Already authenticated'})
    
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'error': 'Missing JSON data'}), 400

    username = data.get('username')
    password = data.get('password')

    user = User.query.filter_by(username=username).first()
    if user and user.check_password(password):
        login_user(user)
        return jsonify({'success': True})
    else:
        return jsonify({'success': False, 'error': 'Invalid username or password'}), 401

@auth_bp.route('/register', methods=['POST'])
def register():
    if current_user.is_authenticated:
        return jsonify({'success': True, 'message': 'Already authenticated'})

    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'error': 'Missing JSON data'}), 400

    username = data.get('username', '').strip()
    password = data.get('password')
    
    if not username:
        return jsonify({'success': False, 'error': 'Username is required'}), 400
        
    if not re.match(r'^[a-zA-Z0-9.@_\+-]+$', username):
        return jsonify({
            'success': False, 
            'error': 'Invalid username. Use only letters, numbers, and . @ _ - + (no spaces)'
        }), 400

    if User.query.filter_by(username=username).first():
        return jsonify({'success': False, 'error': 'Username already exists'}), 400
    
    new_user = User(username=username)
    new_user.set_password(password)
    db.session.add(new_user)
    db.session.commit()
    
    login_user(new_user)
    return jsonify({'success': True})

@auth_bp.route('/logout')
@login_required
def logout():
    logout_user()
    return jsonify({'success': True})

@auth_bp.route('/change_password', methods=['POST'])
@login_required
def change_password():
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'error': 'Missing JSON data'}), 400

    new_password = data.get('password')

    if not new_password:
        return jsonify({'success': False, 'error': 'Password cannot be empty'}), 400
    
    current_user.set_password(new_password)
    db.session.commit()
    
    return jsonify({'success': True})

@auth_bp.route('/session')
def session():
    """ Returns current user info as JSON. """
    from dashboard.services.fdalabel_db import FDALabelDBService
    try:
        is_internal = FDALabelDBService.is_internal()
    except Exception as e:
        logger.error(f"Error checking FDALabelDB internal status: {e}")
        is_internal = False
    
    if current_user.is_authenticated:
        return jsonify({
            'is_authenticated': True,
            'id': current_user.id,
            'username': current_user.username,
            'ai_provider': current_user.ai_provider,
            'custom_gemini_key': current_user.custom_gemini_key,
            'openai_api_key': current_user.openai_api_key,
            'openai_base_url': current_user.openai_base_url,
            'openai_model_name': current_user.openai_model_name,
            'is_internal': is_internal
        })
    return jsonify({
        'is_authenticated': False,
        'is_internal': is_internal
    })
