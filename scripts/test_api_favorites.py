import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))
from dashboard import create_app
from database import db, Favorite, Project, User
import json

app = create_app()
with app.app_context():
    # Simulate current_user = User.query.get(1)
    user = User.query.get(1)
    project_id = 1
    
    favorites = Favorite.query.filter_by(project_id=project_id).order_by(Favorite.timestamp.desc()).all()
    print(f"Found {len(favorites)} favorites for project {project_id}")
    
    favorites_list = [{
        'set_id': fav.set_id,
        'brand_name': fav.brand_name,
        'manufacturer_name': fav.manufacturer_name,
        'effective_time': fav.effective_time,
        'timestamp': fav.timestamp.isoformat(),
        'added_by': fav.user.username
    } for fav in favorites]
    
    print(json.dumps(favorites_list[:2], indent=2))
