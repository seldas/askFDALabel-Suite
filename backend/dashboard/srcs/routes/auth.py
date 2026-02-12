import re
from flask import Blueprint, render_template, request, redirect, url_for, jsonify
from flask_login import login_user, login_required, logout_user, current_user
from urllib.parse import urlparse
from dashboard.srcs.models import User
from dashboard.srcs.extensions import db

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect('/dashboard')
    
    # Retrieve next_page from query params (GET) or form data (POST)
    next_page = request.args.get('next') or request.form.get('next')

    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        user = User.query.filter_by(username=username).first()
        if user and user.check_password(password):
            login_user(user)
            # Safe redirect: check if next_page exists and is relative (not absolute URL to other site)
            if next_page and not urlparse(next_page).netloc:
                return redirect(next_page)
            return redirect('/dashboard')
        else:
            return render_template('login.html', error='Invalid username or password', next=next_page)
            
    return render_template('login.html', next=next_page)

@auth_bp.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect('/dashboard')
    if request.method == 'POST':
        username = request.form.get('username').strip()
        password = request.form.get('password')
        
        if not username:
            return render_template('register.html', error='Username is required')
            
        # Validate username: allow alphanumeric, ., _, @, -, +
        # Disallow spaces and other special symbols
        if not re.match(r'^[a-zA-Z0-9.@_\+-]+$', username):
            return render_template('register.html', error='Invalid username. Use only letters, numbers, and . @ _ - + (no spaces)')

        if User.query.filter_by(username=username).first():
            return render_template('register.html', error='Username already exists')
        
        new_user = User(username=username)
        new_user.set_password(password)
        db.session.add(new_user)
        db.session.commit()
        
        login_user(new_user)
        return redirect('/dashboard')
    return render_template('register.html')

@auth_bp.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect('/dashboard')

@auth_bp.route('/session')
def session():
    """ Returns current user info as JSON. """
    from dashboard.srcs.services.fdalabel_db import FDALabelDBService
    is_internal = FDALabelDBService.check_connectivity()
    
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

