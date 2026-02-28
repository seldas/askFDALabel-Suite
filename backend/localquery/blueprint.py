from flask import Blueprint, request, jsonify
from dashboard.services.fdalabel_db import FDALabelDBService

localquery_bp = Blueprint('localquery', __name__)

@localquery_bp.route('/search', methods=['GET'])
def local_search():
    """
    Simple search for local label database.
    Supports Brand Name, Generic Name, Set ID, and Application Number.
    """
    query = request.args.get('query', '').strip()
    if not query:
        return jsonify({'results': [], 'total': 0})

    try:
        results = FDALabelDBService.local_search(query)
        return jsonify({
            'results': results,
            'total': len(results)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@localquery_bp.route('/autocomplete', methods=['GET'])
def autocomplete():
    """
    Autocomplete suggestions for Brand/Generic names.
    """
    query = request.args.get('query', '').strip()
    if not query or len(query) < 2:
        return jsonify({'suggestions': []})

    try:
        suggestions = FDALabelDBService.get_autocomplete_suggestions(query)
        return jsonify({'suggestions': suggestions})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@localquery_bp.route('/random', methods=['GET'])
def get_random():
    """
    Returns 5 random records for quick access.
    """
    try:
        results = FDALabelDBService.get_random_labels(limit=5)
        return jsonify({'results': results})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
