import os
import logging
from pathlib import Path
from flask import Blueprint, jsonify 
from flask_cors import CORS
from dotenv import load_dotenv
from werkzeug.middleware.proxy_fix import ProxyFix

# Calculate the path to the root .env
env_path = Path(__file__).resolve().parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

# Import Dashboard app factory
from dashboard import create_app as create_dashboard_app
# Import Blueprints for Search and DrugTox
from search.blueprint import search_bp
from drugtox.blueprint import drugtox_bp
from labelcomp.blueprint import labelcomp_bp

# Configure Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def create_unified_app():
    # 1. Create the base app using Dashboard's factory
    app = create_dashboard_app()
    
    # Apply ProxyFix to handle X-Forwarded-Proto, X-Forwarded-For, X-Forwarded-Host, etc.
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)
    
    # 2. Configure CORS for the whole app
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    # 3. Register Search and DrugTox blueprints with prefixes
    app.register_blueprint(search_bp, url_prefix='/api/search')
    app.register_blueprint(drugtox_bp, url_prefix='/api/drugtox')
    app.register_blueprint(labelcomp_bp, url_prefix='/api/labelcomp')
    
    @app.route('/health')
    def health():
        return jsonify({"status": "healthy", "app": "askFDALabel-Suite"})

    @app.route('/api/check-fdalabel', methods=['POST'])
    def check_fdalabel():
        from dashboard.services.fdalabel_db import FDALabelDBService
        is_internal = FDALabelDBService.check_connectivity()
        return jsonify({"isInternal": is_internal})

    return app

app = create_unified_app()
   

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8849"))
    app.run(host="0.0.0.0", port=port, debug=True)
