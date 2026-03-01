from flask import Blueprint, request, jsonify, current_app, send_file
import os
import pandas as pd
import time
import re
import requests
import json
from io import BytesIO
from datetime import datetime
import urllib3

# Suppress insecure request warnings
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

webtest_bp = Blueprint('webtest', __name__)

def get_api_url(ui_url):
    """Translates a FDALabel UI URL to its corresponding JSON Service URL."""
    if "fdalabel" not in ui_url.lower():
        return ui_url
    if "/ui/spl-summaries/criteria/" in ui_url:
        return ui_url.replace("/ui/spl-summaries/criteria/", "/services/spl/summaries/json/criteria/")
    if "/ui/spl-summaries/" in ui_url:
        return ui_url.replace("/ui/spl-summaries/", "/services/spl/summaries/json/")
    if "/ui/search" in ui_url:
        return ui_url.replace("/ui/search", "/services/spl/search")
    if "/ui/spl-doc/" in ui_url:
        return ui_url.replace("/ui/spl-doc/", "/services/spl/set-ids/")
    return ui_url

@webtest_bp.route('/templates', methods=['GET'])
def list_templates():
    template_dir = os.path.join(current_app.root_path, '..', 'frontend', 'public', 'webtest')
    if not os.path.exists(template_dir):
         template_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'frontend', 'public', 'webtest'))
    if not os.path.exists(template_dir): return jsonify([])
    files = sorted([f for f in os.listdir(template_dir) if f.lower().endswith('.xlsx')])
    return jsonify(files)

@webtest_bp.route('/template_info', methods=['GET'])
def get_template_info():
    template_name = request.args.get('template_name')
    if not template_name: return jsonify({"error": "No name"}), 400
    template_dir = os.path.join(current_app.root_path, '..', 'frontend', 'public', 'webtest')
    if not os.path.exists(template_dir):
         template_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'frontend', 'public', 'webtest'))
    path = os.path.join(template_dir, template_name)
    if not os.path.exists(path): return jsonify({"error": "Not found"}), 404
    try:
        df = pd.read_excel(path).fillna('N/A')
        tasks = []
        for index, row in df.iterrows():
            tasks.append({
                "task_num": index + 1,
                "version": str(row.get('Version', 'N/A')).strip(),
                "url": str(row.get('Result Link', '')),
                "query_details": str(row.get('Query Details', 'N/A')),
                "status": "pending",
                "count": "N/A",
                "time_to_ready": 0
            })
        return jsonify({"template_name": template_name, "total_tasks": len(tasks), "tasks": tasks})
    except Exception as e: return jsonify({"error": str(e)}), 500

@webtest_bp.route('/probe_single', methods=['POST'])
def probe_single():
    data = request.get_json()
    ui_url = data.get('url')
    if not ui_url: return jsonify({"error": "No URL"}), 400
    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
    })
    start_time = time.time()
    api_url = get_api_url(ui_url)
    try:
        resp = session.get(api_url, timeout=(5, 45), verify=False)
        elapsed = round(time.time() - start_time, 2)
        if resp.status_code == 200:
            try:
                data = resp.json()
                total = None
                if isinstance(data, dict):
                    total = data.get('totalResultsCount')
                    if total is None: total = data.get('total') or data.get('count') or data.get('totalResults') or data.get('recordCount')
                elif isinstance(data, list): total = len(data)
                if total is not None: return jsonify({"status": "Success", "count": str(total), "time": elapsed})
            except:
                if "labeling results" in resp.text.lower():
                    match = re.search(r'(\d+)\s+Labeling Results', resp.text, re.IGNORECASE)
                    return jsonify({"status": "Success", "count": match.group(1) if match else "Found", "time": elapsed})
            return jsonify({"status": "Format Error", "count": "N/A", "time": elapsed})
        elif resp.status_code == 404: return jsonify({"status": "Not Found (404)", "count": "N/A", "time": elapsed})
        else: return jsonify({"status": f"HTTP {resp.status_code}", "count": "N/A", "time": elapsed})
    except: return jsonify({"status": "Inaccessible", "count": "N/A", "time": round(time.time() - start_time, 2)})

@webtest_bp.route('/report_from_data', methods=['POST'])
def report_from_data():
    data = request.get_json()
    results = data.get('results', [])
    if not results: return jsonify({"error": "No data"}), 400
    df = pd.DataFrame(results)
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Testing Results')
    output.seek(0)
    return send_file(output, mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', as_attachment=True, download_name=f"webtest_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx")

@webtest_bp.route('/save_results', methods=['POST'])
def save_results():
    """Automatically saves the completed run as a JSON file."""
    data = request.get_json()
    results = data.get('results', [])
    template_name = data.get('template_name', 'unknown')
    if not results: return jsonify({"error": "No results"}), 400
    
    results_dir = os.path.join(current_app.root_path, '..', 'frontend', 'public', 'webtest', 'results')
    if not os.path.exists(results_dir):
        # Alternative path check
        results_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'frontend', 'public', 'webtest', 'results'))
        os.makedirs(results_dir, exist_ok=True)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_name = "".join([c for c in template_name if c.isalnum() or c in (' ', '.', '_')]).rstrip()
    filename = f"result_{safe_name}_{timestamp}.json"
    filepath = os.path.join(results_dir, filename)
    
    try:
        with open(filepath, 'w') as f:
            json.dump({
                "template": template_name,
                "timestamp": datetime.now().isoformat(),
                "total_tasks": len(results),
                "results": results
            }, f, indent=4)
        return jsonify({"success": True, "filename": filename})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
