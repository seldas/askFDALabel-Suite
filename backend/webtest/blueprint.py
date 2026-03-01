from flask import Blueprint, request, jsonify, Response, current_app, send_file
import os
import pandas as pd
import threading
import time
import json
import uuid
from datetime import datetime
from io import BytesIO
import queue

# Try importing playwright
try:
    from playwright.sync_api import sync_playwright
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False

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
        self.add_log(f"Starting test task {self.task_id}")
        
        if not PLAYWRIGHT_AVAILABLE:
            self.add_log("Error: Playwright not installed on server.")
            self.status = "failed"
            self.event_queue.put({"type": "status", "data": "failed"})
            return

        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                context = browser.new_context(ignore_https_errors=True)
                
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
                    
                    start_time = time.time()
                    result_entry = {
                        "task_num": index + 1,
                        "version": version,
                        "url": url,
                        "query_details": query_details,
                        "status": "pending",
                        "time": 0,
                        "content": ""
                    }

                    try:
                        page = context.new_page()
                        page.goto(url, wait_until="load", timeout=60000)
                        
                        try:
                            # Wait up to 30s for the content to appear
                            page.wait_for_selector(".span4", timeout=30000)
                            content = page.locator(".span4").inner_text()
                        except:
                            content = "Timeout/Element Not Found"

                        result_entry["status"] = "Success" if "Error" not in content else "Error"
                        result_entry["content"] = content
                        result_entry["time"] = round(time.time() - start_time, 2)
                        page.close()
                    except Exception as e:
                        result_entry["status"] = f"Failed: {str(e)}"
                        result_entry["time"] = round(time.time() - start_time, 2)
                        self.add_log(f"Error testing {url}: {str(e)}")

                    self.results.append(result_entry)
                    self.event_queue.put({"type": "result", "data": result_entry})
                    self.update_progress(int(((index + 1) / total_rows) * 100))

                browser.close()
                
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
    """List all Excel templates in the public webtest folder."""
    template_dir = os.path.join(current_app.root_path, '..', 'frontend', 'public', 'webtest')
    # Alternative check relative to project root if above fails
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
        return jsonify({"error": f"Template {template_name} not found on server"}), 404

    try:
        df = pd.read_excel(template_path).fillna('')
        required = ['Result Link', 'Version']
        if not all(col in df.columns for col in required):
            return jsonify({"error": f"Missing required columns in {template_name}: {required}"}), 400
            
        task_id = str(uuid.uuid4())
        manager = WebTestManager(task_id, df)
        testing_tasks[task_id] = manager
        
        thread = threading.Thread(target=manager.run)
        thread.daemon = True
        thread.start()
        
        return jsonify({"task_id": task_id, "status": "started"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@webtest_bp.route('/status/<task_id>')
def get_status(task_id):
    manager = testing_tasks.get(task_id)
    if not manager:
        return jsonify({"error": "Task not found"}), 404
    
    return jsonify({
        "task_id": task_id,
        "status": manager.status,
        "progress": manager.progress,
        "results_count": len(manager.results),
        "completed_at": manager.completed_at
    })

@webtest_bp.route('/events/<task_id>')
def events(task_id):
    manager = testing_tasks.get(task_id)
    if not manager:
        return Response("Task not found", status=404)

    def event_stream():
        # Send initial state
        init_data = json.dumps({'type': 'init', 'logs': manager.logs, 'results': manager.results})
        yield f"data: {init_data}\n\n"
        
        while True:
            try:
                event = manager.event_queue.get(timeout=20)
                yield f"data: {json.dumps(event)}\n\n"
                if event['type'] == 'status' and event['data'] in ['completed', 'failed']:
                    break
            except queue.Empty:
                yield ": keepalive\n\n"
            except GeneratorExit:
                break
    
    return Response(event_stream(), mimetype='text/event-stream')

@webtest_bp.route('/report/<task_id>')
def download_report(task_id):
    manager = testing_tasks.get(task_id)
    if not manager or not manager.results:
        return jsonify({"error": "No results available"}), 404
    
    df_res = pd.DataFrame(manager.results)
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df_res.to_excel(writer, index=False, sheet_name='Testing Results')
    
    output.seek(0)
    filename = f"webtest_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return send_file(output, mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', as_attachment=True, download_name=filename)

@webtest_bp.route('/stop/<task_id>', methods=['POST'])
def stop_test(task_id):
    manager = testing_tasks.get(task_id)
    if manager:
        manager.stop_requested = True
        return jsonify({"success": True})
    return jsonify({"error": "Task not found"}), 404
