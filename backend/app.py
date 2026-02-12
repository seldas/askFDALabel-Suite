import os
import logging
from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

# Import Dashboard app factory
from dashboard.srcs import create_app as create_dashboard_app
# Import Blueprints for Search and DrugTox
from search.blueprint import search_bp
from drugtox.blueprint import drugtox_bp

load_dotenv()

# Configure Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def create_unified_app():
    # 1. Create the base app using Dashboard's factory
    app = create_dashboard_app()
    
    # 2. Configure CORS for the whole app
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    # 3. Register Search and DrugTox blueprints with prefixes
    app.register_blueprint(search_bp, url_prefix='/api/search')
    app.register_blueprint(drugtox_bp, url_prefix='/api/drugtox')
    
    @app.route('/health')
    def health():
        return jsonify({"status": "healthy", "app": "askFDALabel-Suite"})

    return app

app = create_unified_app()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5200"))
    app.run(host="0.0.0.0", port=port, debug=True)
