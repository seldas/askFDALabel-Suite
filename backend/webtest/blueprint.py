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

# Suppress insecure request warnings for internal/test servers
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

webtest_bp = Blueprint('webtest', __name__)

# Global storage for task status and results
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
        self.add_log(f"Starting test task {self.task_id} using Dynamic HTTP Polling")
        
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
                
                self.add_log(f"Testing {version}: {query_details}")
                
                task_start_time = time.time()
                result_entry = {
                    "task_num": index + 1,
                    "version": version,
                    "url": url,
                    "query_details": query_details,
                    "status": "pending",
                    "count": "N/A",
                    "time_to_ready": 0,
                    "content": ""
                }

                # Polling loop: Wait for content to change from "loading" to "Results"
                # Max wait: 60 seconds
                ready = False
                attempts = 0
                max_wait = 60 
                
                while (time.time() - task_start_time) < max_wait:
                    if self.stop_requested: break
                    
                    try:
                        attempts += 1
                        response = session.get(url, timeout=15, verify=False)
                        
                        if response.status_code == 200:
                            soup = BeautifulSoup(response.text, 'html.parser')
                            
                            # Standard FDALabel selectors
                            span4 = soup.find(class_='span4')
                            span12 = soup.find(class_='span12')
                            
                            content = span4.get_text(strip=True) if span4 else ""
                            if not content and span12:
                                content = span12.get_text(strip=True)
                            
                            # Fallback to whole body if specific spans are missing
                            if not content:
                                content = soup.get_text(separator=' ', strip=True)

                            # Check if we have the results yet
                            if "labeling results" in content.lower():
                                # Extract the number (e.g., "125 Labeling Results")
                                match = re.search(r'(\d+)\s+Labeling Results', content, re.IGNORECASE)
                                if match:
                                    result_entry["count"] = match.group(1)
                                
                                result_entry["status"] = "Success"
                                result_entry["content"] = content
                                result_entry["time_to_ready"] = round(time.time() - task_start_time, 2)
                                ready = True
                                break
                            elif "loading" in content.lower():
                                # Still loading, wait and retry
                                time.sleep(2)
                            else:
                                # Neither loading nor results - maybe an error page or empty?
                                result_entry["status"] = "No Results Found"
                                result_entry["content"] = content[:100]
                                result_entry["time_to_ready"] = round(time.time() - task_start_time, 2)
                                break
                        else:
                            result_entry["status"] = f"HTTP {response.status_code}"
                            break
                            
                    except Exception as e:
                        result_entry["status"] = "Conn Error"
                        result_entry["content"] = str(e)
                        break

                if not ready and result_entry["status"] == "pending":
                    result_entry["status"] = "Timeout"
                    result_entry["time_to_ready"] = max_wait

                self.results.append(result_entry)
                self.event_queue.put({"type": "result", "data": result_entry})
                self.update_progress(int(((index + 1) / total_rows) * 100))

            self.status = "completed"
            self.completed_at = datetime.now().isoformat()
            self.event_queue.put({"type": "status", "data": "completed"})
            self.add_log("Testing task completed.")
            
        except Exception as e:
            self.add_log(f"Critical Task Error: {str(e)}")
            self.status = "failed"
            self.event_queue.put({"type": "status", "data": "failed"})

@webtest_bp.route('/templates', methods=['GET'])
def list_templates():
    template_dir = os.path.join(current_app.root_path, '..', 'frontend', 'public', 'webtest')
    if not os.path.exists(template_dir):
         template_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'frontend', 'public', 'webtest'))
    
    if not os.path.exists(template_dir):
        return jsonify([])
    files = [f for f in os.listdir(template_dir) if f.lower().endswith('.xlsx')]
    return jsonify(files)

@webtest_bp.route('/start', methods=['POST'])
def start_test():
    data = request.get_json()
    template_name = data.get('template_name')
    if not template_name:
        return jsonify({"error": "No template selected"}), 400
    
    template_dir = os.path.join(current_app.root_path, '..', 'frontend', 'public', 'webtest')
    if not os.path.exists(template_dir):
         template_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'frontend', 'public', 'webtest'))
    
    template_path = os.path.join(template_dir, template_name)
    if not os.path.exists(template_path):
        return jsonify({"error": "Template not found"}), 404

    try:
        df = pd.read_excel(template_path).fillna('')
        task_id = str(uuid.uuid4())
        manager = WebTestManager(task_id, df)
        testing_tasks[task_id] = manager
        thread = threading.Thread(target=manager.run)
        thread.daemon = True
        thread.start()
        return jsonify({"task_id": task_id, "status": "started"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@webtest_bp.route('/events/<task_id>')
def events(task_id):
    manager = testing_tasks.get(task_id)
    if not manager: return Response("Not found", status=404)
    def stream():
        yield f"data: {json.dumps({'type': 'init', 'logs': manager.logs, 'results': manager.results})}\n\n"
        while True:
            try:
                event = manager.event_queue.get(timeout=20)
                yield f"data: {json.dumps(event)}\n\n"
                if event['type'] == 'status' and event['data'] in ['completed', 'failed']: break
            except queue.Empty: yield ": keepalive\n\n"
            except GeneratorExit: break
    return Response(stream(), mimetype='text/event-stream')

@webtest_bp.route('/report/<task_id>')
def download_report(task_id):
    manager = testing_tasks.get(task_id)
    if not manager or not manager.results: return jsonify({"error": "No results"}), 404
    df_res = pd.DataFrame(manager.results)
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df_res.to_excel(writer, index=False)
    output.seek(0)
    return send_file(output, mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', as_attachment=True, download_name=f"webtest_{task_id}.xlsx")

@webtest_bp.route('/stop/<task_id>', methods=['POST'])
def stop_test(task_id):
    manager = testing_tasks.get(task_id)
    if manager:
        manager.stop_requested = True
        return jsonify({"success": True})
    return jsonify({"error": "Not found"}), 404
