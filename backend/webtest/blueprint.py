from flask import Blueprint, request, jsonify, Response, current_app, send_file
import os
import pandas as pd
import threading
import time
import json
import uuid
import re
from datetime import datetime
from io import BytesIO
import queue
import requests
import urllib3

# Suppress insecure request warnings
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

webtest_bp = Blueprint('webtest', __name__)

# Global storage for task status
testing_tasks = {}

class WebTestManager:
    def __init__(self, task_id, df_template):
        self.task_id = task_id
        self.df = df_template
        self.status = "pending"
        self.progress = 0
        self.results = []
        self.logs = []
        self.event_queue = queue.Queue()
        self.completed_at = None
        self.stop_requested = False

    def add_log(self, message):
        timestamp = datetime.now().strftime("%H:%M:%S")
        log_entry = f"[{timestamp}] {message}"
        self.logs.append(log_entry)
        self.event_queue.put({"type": "log", "data": log_entry})

    def update_progress(self, progress):
        self.progress = progress
        self.event_queue.put({"type": "progress", "data": progress})

    def get_api_url(self, ui_url):
        """
        Translates a FDALabel UI URL to its corresponding JSON Service URL.
        Example: .../ui/spl-summaries/criteria/215090 -> .../services/spl/summaries/json/criteria/215090
        """
        if "fdalabel" not in ui_url.lower():
            return ui_url # No translation for non-fdalabel links
            
        # Target pattern: /ui/spl-summaries/criteria/ -> /services/spl/summaries/json/criteria/
        if "/ui/spl-summaries/criteria/" in ui_url:
            return ui_url.replace("/ui/spl-summaries/criteria/", "/services/spl/summaries/json/criteria/")
        
        # General summaries pattern: /ui/spl-summaries/ -> /services/spl/summaries/json/
        if "/ui/spl-summaries/" in ui_url:
            return ui_url.replace("/ui/spl-summaries/", "/services/spl/summaries/json/")

        # Search pattern: /ui/search -> /services/spl/search
        if "/ui/search" in ui_url:
            return ui_url.replace("/ui/search", "/services/spl/search")
            
        # SPL Doc pattern: /ui/spl-doc/ -> /services/spl/set-ids/
        if "/ui/spl-doc/" in ui_url:
            return ui_url.replace("/ui/spl-doc/", "/services/spl/set-ids/")

        return ui_url

    def run(self):
        self.status = "running"
        self.add_log(f"Starting batch {self.task_id} (Direct JSON Service Mode)")
        
        session = requests.Session()
        session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*'
        })

        try:
            total_rows = len(self.df)
            for index, row in self.df.iterrows():
                if self.stop_requested:
                    self.add_log("Task stopped by user.")
                    break

                ui_url = row.get('Result Link', '')
                if not isinstance(ui_url, str) or 'http' not in ui_url:
                    continue

                query_details = row.get('Query Details', 'N/A')
                version = row.get('Version', 'N/A')
                self.add_log(f"[{index+1}/{total_rows}] Testing {version}: {query_details}")
                
                task_start_time = time.time()
                result_entry = {
                    "task_num": index + 1,
                    "version": version,
                    "url": ui_url,
                    "query_details": query_details,
                    "status": "pending",
                    "count": "N/A",
                    "time_to_ready": 0
                }

                api_url = self.get_api_url(ui_url)
                self.add_log(f"   --> Probing: {api_url}")
                
                max_wait = 60
                found = False
                # Connection timeout: 5s, Read timeout: 55s
                timeout = (5, 55)

                try:
                    # DIRECT PROBE: We expect JSON
                    resp = session.get(api_url, timeout=timeout, verify=False)
                    
                    elapsed = round(time.time() - task_start_time, 2)
                    result_entry["time_to_ready"] = elapsed

                    if resp.status_code == 200:
                        try:
                            # Parse JSON result count
                            data = resp.json()
                            total = None
                            
                            # Handle FDALabel JSON response structures
                            if isinstance(data, dict):
                                # Prioritize the user-confirmed 'totalResultsCount'
                                total = data.get('totalResultsCount')
                                if total is None:
                                    # Fallbacks for other possible search/summary endpoints
                                    total = data.get('total') or data.get('count') or data.get('totalResults') or data.get('recordCount')
                            elif isinstance(data, list):
                                total = len(data)
                            
                            if total is not None:
                                result_entry["count"] = str(total)
                                result_entry["status"] = "Success"
                                self.add_log(f"   --> Found {total} results in {elapsed}s")
                                found = True
                            else:
                                result_entry["status"] = "JSON Success (No Count)"
                                self.add_log(f"   --> Success but no count field in JSON")
                                found = True
                        except Exception as je:
                            # Not JSON - maybe it returned the HTML anyway?
                            if "labeling results" in resp.text.lower():
                                match = re.search(r'(\d+)\s+Labeling Results', resp.text, re.IGNORECASE)
                                result_entry["count"] = match.group(1) if match else "Found"
                                result_entry["status"] = "Success (Text)"
                                found = True
                            else:
                                result_entry["status"] = "Format Error"
                                self.add_log(f"   --> Received non-JSON response.")
                                found = True
                    elif resp.status_code == 404:
                        result_entry["status"] = "Not Found (404)"
                        self.add_log(f"   --> Error 404: Service endpoint not found.")
                        found = True
                    else:
                        result_entry["status"] = f"HTTP {resp.status_code}"
                        self.add_log(f"   --> HTTP Error {resp.status_code}")
                        found = True

                except (requests.exceptions.ConnectionError, requests.exceptions.ConnectTimeout):
                    result_entry["status"] = "Inaccessible"
                    result_entry["time_to_ready"] = round(time.time() - task_start_time, 2)
                    self.add_log(f"   --> Connection Failed.")
                    found = True
                except Exception as e:
                    result_entry["status"] = "Error"
                    self.add_log(f"   --> Unexpected error: {str(e)}")
                    found = True

                self.results.append(result_entry)
                self.event_queue.put({"type": "result", "data": result_entry})
                self.update_progress(int(((index + 1) / total_rows) * 100))
                
                # Small delay to ensure UI has time to catch up and show progress
                time.sleep(0.3)

            self.status = "completed"
            self.completed_at = datetime.now().isoformat()
            self.event_queue.put({"type": "status", "data": "completed"})
            self.add_log("Testing sequence completed.")
            
        except Exception as e:
            self.add_log(f"Batch Processing Error: {str(e)}")
            self.status = "failed"
            self.event_queue.put({"type": "status", "data": "failed"})

@webtest_bp.route('/templates', methods=['GET'])
def list_templates():
    template_dir = os.path.join(current_app.root_path, '..', 'frontend', 'public', 'webtest')
    if not os.path.exists(template_dir):
         template_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'frontend', 'public', 'webtest'))
    if not os.path.exists(template_dir): return jsonify([])
    files = sorted([f for f in os.listdir(template_dir) if f.lower().endswith('.xlsx')])
    return jsonify(files)

@webtest_bp.route('/start', methods=['POST'])
def start_test():
    data = request.get_json()
    template_name = data.get('template_name')
    if not template_name: return jsonify({"error": "No template"}), 400
    template_dir = os.path.join(current_app.root_path, '..', 'frontend', 'public', 'webtest')
    if not os.path.exists(template_dir):
         template_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'frontend', 'public', 'webtest'))
    path = os.path.join(template_dir, template_name)
    if not os.path.exists(path): return jsonify({"error": "Not found"}), 404
    try:
        df = pd.read_excel(path).fillna('')
        task_id = str(uuid.uuid4())
        manager = WebTestManager(task_id, df)
        testing_tasks[task_id] = manager
        t = threading.Thread(target=manager.run)
        t.daemon = True
        t.start()
        return jsonify({"task_id": task_id, "status": "started"})
    except Exception as e: return jsonify({"error": str(e)}), 500

@webtest_bp.route('/events/<task_id>')
def events(task_id):
    manager = testing_tasks.get(task_id)
    if not manager: return Response("Not found", status=404)
    def stream():
        # Send initial state including progress
        init_data = json.dumps({
            'type': 'init', 
            'logs': manager.logs, 
            'results': manager.results, 
            'progress': manager.progress,
            'status': manager.status
        })
        yield f"data: {init_data}\n\n"
        while True:
            try:
                ev = manager.event_queue.get(timeout=20)
                yield f"data: {json.dumps(ev)}\n\n"
                if ev['type'] == 'status' and ev['data'] in ['completed', 'failed']: break
            except queue.Empty: yield ": keepalive\n\n"
            except GeneratorExit: break
            
    return Response(stream(), mimetype='text/event-stream', headers={
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
        'Connection': 'keep-alive'
    })

@webtest_bp.route('/report/<task_id>')
def download_report(task_id):
    manager = testing_tasks.get(task_id)
    if not manager: return jsonify({"error": "No results"}), 404
    df_res = pd.DataFrame(manager.results)
    if 'content' in df_res.columns: df_res = df_res.drop(columns=['content'])
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df_res.to_excel(writer, index=False)
    output.seek(0)
    return send_file(output, mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', as_attachment=True, download_name=f"webtest_report.xlsx")

@webtest_bp.route('/stop/<task_id>', methods=['POST'])
def stop_test(task_id):
    m = testing_tasks.get(task_id)
    if m: m.stop_requested = True
    return jsonify({"success": True})
