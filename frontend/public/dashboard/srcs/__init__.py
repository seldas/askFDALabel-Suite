import os
from flask import Flask
from dotenv import load_dotenv

from srcs.config import Config
from srcs.extensions import db, migrate, login_manager
from srcs.models import User, Project, Favorite, FavoriteComparison, PgxBiomarker, PgxAssessment, PgxSynonym

def create_app(config_class=Config):
    load_dotenv()
    
    app = Flask(__name__, 
                template_folder='../templates', 
                static_folder='../static')
    app.config.from_object(config_class)

    # Initialize Extensions
    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)
    login_manager.login_view = 'auth.login'

    # Register Blueprints
    from srcs.routes.auth import auth_bp
    from srcs.routes.main import main_bp
    from srcs.routes.api import api_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(main_bp)
    app.register_blueprint(api_bp)

    # Ensure data directories exist
    if not os.path.exists(app.config['DATA_DIR']):
        os.makedirs(app.config['DATA_DIR'])
    if not os.path.exists(app.config['UPLOAD_FOLDER']):
        os.makedirs(app.config['UPLOAD_FOLDER'])

    # User Loader
    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(int(user_id))

    # Context Processor / Before First Request logic
    with app.app_context():
        # Create tables if they don't exist
        db.create_all()
        migrate_projects()
        check_meddra_data()

    return app

def check_meddra_data():
    """Checks if MedDRA tables are populated and warns the user if not."""
    try:
        from srcs.models import MeddraSOC
        count = MeddraSOC.query.count()
        if count == 0:
            print("\n" + "!"*60)
            print("WARNING: MedDRA dictionary data is not populated in the database.")
            print("FAERS analysis features will have limited details (N/A for SOC/HLT).")
            print("To fix this, please run:")
            print("    python populate_meddra.py")
            print("!"*60 + "\n")
    except Exception as e:
        # Tables might not exist yet if migration hasn't run
        pass

def migrate_projects():
    """Ensure all users have a 'Not Grouped' Project and move orphaned items there."""
    try:
        users = User.query.all()
        for user in users:
            # 1. Rename old "Default Project" if exists
            old_default = Project.query.filter_by(owner_id=user.id, title="Default Project").first()
            if old_default:
                old_default.title = "Not Grouped"
                if old_default.display_order is None:
                    old_default.display_order = 0
            
            # 2. Check/Create "Not Grouped" project
            default_proj = Project.query.filter_by(owner_id=user.id, title="Not Grouped").first()
            if not default_proj:
                default_proj = Project(title="Not Grouped", description="My default workspace", owner_id=user.id, display_order=0)
                db.session.add(default_proj)
                db.session.commit() # Commit to get ID
            
            # Move orphaned Favorites
            orphaned_favs = Favorite.query.filter_by(user_id=user.id, project_id=None).all()
            for fav in orphaned_favs:
                fav.project_id = default_proj.id
                
            # Move orphaned Comparisons
            orphaned_comps = FavoriteComparison.query.filter_by(user_id=user.id, project_id=None).all()
            for comp in orphaned_comps:
                comp.project_id = default_proj.id
        
        db.session.commit()
    except Exception as e:
        print(f"Migration error: {e}")
        db.session.rollback()
