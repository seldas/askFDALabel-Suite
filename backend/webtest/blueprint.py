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
from bs4 import BeautifulSoup
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

    def run(self):
        self.status = "running"
        self.add_log(f"Starting test task {self.task_id}")
        
        session = requests.Session()
        session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        })

        try:
            total_rows = len(self.df)
            for index, row in self.df.iterrows():
                if self.stop_requested:
                    self.add_log("Task stopped by user.")
                    break

                url = row.get('Result Link', '')
                if not isinstance(url, str) or 'http' not in url:
                    continue

                query_details = row.get('Query Details', 'N/A')
                version = row.get('Version', 'N/A')
                
                self.add_log(f"[{index+1}/{total_rows}] Testing {version}: {query_details}")
                
                task_start_time = time.time()
                result_entry = {
                    "task_num": index + 1,
                    "version": version,
                    "url": url,
                    "query_details": query_details,
                    "status": "pending",
                    "count": "N/A",
                    "time_to_ready": 0
                }

                # Hybrid Polling Mechanism
                max_wait = 60
                found_final_state = False
                
                while (time.time() - task_start_time) < max_wait:
                    if self.stop_requested: break
                    
                    try:
                        # Fetch the current state
                        response = session.get(url, timeout=20, verify=False)
                        
                        if response.status_code == 200:
                            html = response.text
                            soup = BeautifulSoup(html, 'html.parser')
                            
                            # Get all text but prioritize the specific result spans if they exist
                            span4 = soup.find(class_='span4')
                            span12 = soup.find(class_='span12')
                            
                            if span4: text_content = span4.get_text(separator=' ', strip=True)
                            elif span12: text_content = span12.get_text(separator=' ', strip=True)
                            else: text_content = soup.get_text(separator=' ', strip=True)
                            
                            text_lower = text_content.lower()

                            # CHECK FOR FINAL SUCCESS STATE
                            if "labeling results" in text_lower:
                                # Extract number: "125 Labeling Results"
                                match = re.search(r'(\d+)\s+Labeling Results', text_content, re.IGNORECASE)
                                result_entry["count"] = match.group(1) if match else "Found"
                                result_entry["status"] = "Success"
                                result_entry["time_to_ready"] = round(time.time() - task_start_time, 2)
                                found_final_state = True
                                self.add_log(f"   --> Detected: {result_entry['count']} results in {result_entry['time_to_ready']}s")
                                break
                            
                            # CHECK FOR LOADING STATE
                            elif "loading" in text_lower:
                                # Still loading, let's try to hit the API directly if possible
                                if "fdalabel" in url and "ui/search" in url:
                                    api_url = url.replace("ui/search", "services/spl/search")
                                    # Handle different possible API endpoints
                                    try:
                                        api_resp = session.get(api_url, timeout=10, verify=False)
                                        if api_resp.status_code == 200:
                                            try:
                                                api_data = api_resp.json()
                                                # Standard FDALabel API usually has 'total'
                                                count = api_data.get('total') or api_data.get('count')
                                                if count is not None:
                                                    result_entry["count"] = str(count)
                                                    result_entry["status"] = "Success (API)"
                                                    result_entry["time_to_ready"] = round(time.time() - task_start_time, 2)
                                                    found_final_state = True
                                                    self.add_log(f"   --> Success via API: {count} results")
                                                    break
                                            except: pass
                                    except: pass
                                
                                # Wait and retry
                                time.sleep(2)
                            
                            # CHECK FOR ERROR STATE
                            elif "error" in text_lower or "not found" in text_lower:
                                result_entry["status"] = "Error detected"
                                result_entry["count"] = "0"
                                result_entry["time_to_ready"] = round(time.time() - task_start_time, 2)
                                found_final_state = True
                                self.add_log(f"   --> Error page found")
                                break
                            
                            else:
                                # "Unknown Content" but let's keep polling instead of giving up
                                # The original script waited until 'loading' disappeared.
                                # If it's neither 'loading' nor 'results', maybe the search is slow.
                                self.add_log(f"   --> Content detected but not 'Results' yet. Retrying...")
                                time.sleep(3)
                        else:
                            result_entry["status"] = f"HTTP {response.status_code}"
                            found_final_state = True
                            break
                            
                    except Exception as e:
                        result_entry["status"] = "Conn Error"
                        self.add_log(f"   --> Error: {str(e)}")
                        # Don't break immediately on transient connection errors, retry once
                        time.sleep(2)

                if not found_final_state:
                    result_entry["status"] = "Timeout"
                    result_entry["time_to_ready"] = 60.0
                    self.add_log(f"   --> Task timed out")

                self.results.append(result_entry)
                self.event_queue.put({"type": "result", "data": result_entry})
                self.update_progress(int(((index + 1) / total_rows) * 100))

            self.status = "completed"
            self.completed_at = datetime.now().isoformat()
            self.event_queue.put({"type": "status", "data": "completed"})
            
        except Exception as e:
            self.add_log(f"Critical error: {str(e)}")
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
        yield f"data: {json.dumps({'type': 'init', 'logs': manager.logs, 'results': manager.results})}\n\n"
        while True:
            try:
                ev = manager.event_queue.get(timeout=20)
                yield f"data: {json.dumps(ev)}\n\n"
                if ev['type'] == 'status' and ev['data'] in ['completed', 'failed']: break
            except queue.Empty: yield ": keepalive\n\n"
            except GeneratorExit: break
    return Response(stream(), mimetype='text/event-stream')

@webtest_bp.route('/report/<task_id>')
def download_report(task_id):
    manager = testing_tasks.get(task_id)
    if not manager: return jsonify({"error": "No results"}), 404
    df_res = pd.DataFrame(manager.results)
    # Remove large/internal content field for excel
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
