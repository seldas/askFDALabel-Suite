import os
from flask import Flask
from dotenv import load_dotenv

from pathlib import Path
from dashboard.config import Config
from database import db, migrate, login_manager, User, Project, Favorite, FavoriteComparison, PgxBiomarker, PgxAssessment, PgxSynonym, MeddraSOC

def create_app(config_class=Config):
    env_path = Path(__file__).resolve().parent.parent.parent / '.env'
    load_dotenv(dotenv_path=env_path)
    
    base_dir = os.path.abspath(os.path.dirname(__file__))
    project_root = os.path.abspath(os.path.join(base_dir, "..", ".."))
    template_dir = os.path.join(project_root, "frontend", "public", "dashboard", "templates")
    static_dir = os.path.join(project_root, "frontend", "public", "dashboard")

    app = Flask(
        __name__,
        template_folder=template_dir,
        static_folder=static_dir,
        static_url_path='/api/dashboard/static',
    )
    app.config.from_object(config_class)

    # Initialize Extensions
    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)
    login_manager.login_view = "auth.login"

    # Register Blueprints
    from dashboard.routes.auth import auth_bp
    from dashboard.routes.main import main_bp
    from dashboard.routes.api import api_bp

    app.register_blueprint(auth_bp, url_prefix='/api/dashboard/auth')
    app.register_blueprint(main_bp, url_prefix='/api/dashboard')
    app.register_blueprint(api_bp, url_prefix='/api/dashboard')

    # Ensure data directories exist
    os.makedirs(app.config["DATA_DIR"], exist_ok=True)
    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(int(user_id))

    with app.app_context():
        db.create_all()
        migrate_projects()
        check_meddra_data()

    return app

def check_meddra_data():
    """Checks if MedDRA tables are populated and warns the user if not."""
    try:
        from database import MeddraSOC
        count = MeddraSOC.query.count()
        if count == 0:
            print("\n" + "!"*60)
            print("WARNING: MedDRA dictionary data is not populated in the database.")
            print("FAERS analysis features will have limited details (N/A for SOC/HLT).")
            print("To fix this, please run:")
            print("    python test/populate_meddra.py")
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
