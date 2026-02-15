import re
from flask import Blueprint, render_template, request, redirect, url_for, jsonify
from flask_login import login_user, login_required, logout_user, current_user
from urllib.parse import urlparse
from database import db, User, Project
import logging

logger = logging.getLogger(__name__)

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        if request.is_json:
            return jsonify({'success': True, 'message': 'Already authenticated'})
        return redirect('/')
    
    if request.method == 'POST':
        if request.is_json:
            data = request.get_json()
            username = data.get('username')
            password = data.get('password')
        else:
            username = request.form.get('username')
            password = request.form.get('password')

        user = User.query.filter_by(username=username).first()
        if user and user.check_password(password):
            login_user(user)
            if request.is_json:
                return jsonify({'success': True})
            return redirect('/')
        else:
            if request.is_json:
                return jsonify({'success': False, 'error': 'Invalid username or password'}), 401
            return render_template('login.html', error='Invalid username or password')
            
    return render_template('login.html')

@auth_bp.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        if request.is_json:
            return jsonify({'success': True, 'message': 'Already authenticated'})
        return redirect('/')

    if request.method == 'POST':
        if request.is_json:
            data = request.get_json()
            username = data.get('username', '').strip()
            password = data.get('password')
        else:
            username = request.form.get('username', '').strip()
            password = request.form.get('password')
        
        if not username:
            if request.is_json:
                return jsonify({'success': False, 'error': 'Username is required'}), 400
            return render_template('register.html', error='Username is required')
            
        if not re.match(r'^[a-zA-Z0-9.@_\+-]+$', username):
            error_msg = 'Invalid username. Use only letters, numbers, and . @ _ - + (no spaces)'
            if request.is_json:
                return jsonify({'success': False, 'error': error_msg}), 400
            return render_template('register.html', error=error_msg)

        if User.query.filter_by(username=username).first():
            if request.is_json:
                return jsonify({'success': False, 'error': 'Username already exists'}), 400
            return render_template('register.html', error='Username already exists')
        
        new_user = User(username=username)
        new_user.set_password(password)
        db.session.add(new_user)
        db.session.commit()
        
        login_user(new_user)
        if request.is_json:
            return jsonify({'success': True})
        return redirect('/')
    return render_template('register.html')

@auth_bp.route('/logout')
@login_required
def logout():
    logout_user()
    if request.is_json or request.headers.get('Accept') == 'application/json':
        return jsonify({'success': True})
    return redirect('/')

@auth_bp.route('/change_password', methods=['GET', 'POST'])
@login_required
def change_password():
    if request.method == 'POST':
        if request.is_json:
            data = request.get_json()
            new_password = data.get('password')
        else:
            new_password = request.form.get('password')

        if not new_password:
            if request.is_json:
                return jsonify({'success': False, 'error': 'Password cannot be empty'}), 400
            return render_template('change_password.html', error='Password cannot be empty')
        
        current_user.set_password(new_password)
        db.session.commit()
        
        if request.is_json:
            return jsonify({'success': True})
        return redirect('/')
    return render_template('change_password.html')

@auth_bp.route('/session')
def session():
    """ Returns current user info as JSON. """
    from dashboard.services.fdalabel_db import FDALabelDBService
    try:
        is_internal = FDALabelDBService.check_connectivity()
    except Exception as e:
        logger.error(f"Error checking FDALabelDB connectivity: {e}")
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