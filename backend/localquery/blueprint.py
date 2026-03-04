from flask import Blueprint, request, jsonify, send_file
from dashboard.services.fdalabel_db import FDALabelDBService
from openpyxl import Workbook
from io import BytesIO
from datetime import datetime

localquery_bp = Blueprint('localquery', __name__)

@localquery_bp.route('/search', methods=['GET'])
def local_search():
    """
    Simple search for local label database.
    Supports Brand Name, Generic Name, Set ID, and Application Number.
    """
    query = request.args.get('query', '').strip()
    human_rx_only = request.args.get('human_rx_only') == 'true'
    rld_only = request.args.get('rld_only') == 'true'

    if not query:
        return jsonify({'results': [], 'total': 0})

    try:
        results = FDALabelDBService.local_search(
            query, 
            human_rx_only=human_rx_only, 
            rld_only=rld_only
        )
        return jsonify({
            'results': results,
            'total': len(results)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@localquery_bp.route('/export', methods=['GET', 'POST'])
def export_results():
    """
    Exports searched results as an Excel table importable by the dashboard.
    Supports exporting by query string or specific list of set_ids.
    """
    query = request.args.get('query', '').strip()
    set_ids = []
    
    # Check if set_ids are provided (either in args or JSON body for POST)
    if request.method == 'POST':
        data = request.get_json() or {}
        set_ids = data.get('set_ids', [])
    else:
        set_ids_raw = request.args.get('set_ids', '')
        if set_ids_raw:
            set_ids = [sid.strip() for sid in set_ids_raw.split(',') if sid.strip()]

    if not query and not set_ids:
        return jsonify({'error': 'No query or set_ids provided'}), 400

    try:
        if set_ids:
            results = FDALabelDBService.get_labels_by_set_ids_for_export(set_ids)
        else:
            results = FDALabelDBService.get_labels_for_export(query)
            
        if not results:
            return jsonify({'error': 'No results found to export'}), 404

        wb = Workbook()
        ws = wb.active
        ws.title = "LocalQuery Export"

        # Headers from the first result keys
        headers = list(results[0].keys())
        ws.append(headers)

        for row in results:
            ws.append([row.get(h, '') for h in headers])

        # Auto-adjust column widths
        for col in ws.columns:
            max_length = 0
            column = col[0].column_letter
            for cell in col:
                try:
                    if len(str(cell.value)) > max_length:
                        max_length = len(str(cell.value))
                except: pass
            ws.column_dimensions[column].width = min(40, max_length + 2)

        output = BytesIO()
        wb.save(output)
        output.seek(0)

        filename = f"LocalQuery_Export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        return send_file(
            output,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name=filename
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@localquery_bp.route('/autocomplete', methods=['GET'])
def autocomplete():
    """
    Autocomplete suggestions for Brand/Generic names.
    """
    query = request.args.get('query', '').strip()
    human_rx_only = request.args.get('human_rx_only') == 'true'
    rld_only = request.args.get('rld_only') == 'true'

    if not query or len(query) < 2:
        return jsonify({'suggestions': []})

    try:
        suggestions = FDALabelDBService.get_autocomplete_suggestions(
            query, 
            human_rx_only=human_rx_only, 
            rld_only=rld_only
        )
        return jsonify({'suggestions': suggestions})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@localquery_bp.route('/random', methods=['GET'])
def get_random():
    """
    Returns 5 random records for quick access.
    """
    human_rx_only = request.args.get('human_rx_only') == 'true'
    rld_only = request.args.get('rld_only') == 'true'
    try:
        results = FDALabelDBService.get_random_labels(
            limit=5, 
            human_rx_only=human_rx_only, 
            rld_only=rld_only
        )
        return jsonify({'results': results})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
