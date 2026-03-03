from flask import Blueprint, request, jsonify, current_app, send_file
import os
import pandas as pd
import numpy as np
import time
import re
import requests
import json
from io import BytesIO
from datetime import datetime
import urllib3
from flask_login import current_user

# Suppress insecure request warnings
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

webtest_bp = Blueprint('webtest', __name__)

def get_api_url(ui_url, version=""):
    """Translates a FDALabel UI URL to its corresponding JSON Service URL."""
    if "fdalabel" not in ui_url.lower():
        return ui_url
    
    # If version contains CDER, the path includes /ldt/
    is_ldt = "CDER" in (version or "")
    base_service = "/services/spl/ldt/summaries/json/" if is_ldt else "/services/spl/summaries/json/"
    criteria_service = "/services/spl/ldt/summaries/json/criteria/" if is_ldt else "/services/spl/summaries/json/criteria/"

    if "/ui/spl-summaries/criteria/" in ui_url:
        return ui_url.replace("/ui/spl-summaries/criteria/", criteria_service)
    if "/ui/spl-summaries/" in ui_url:
        return ui_url.replace("/ui/spl-summaries/", base_service)
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
    
    # Load history if available to show "last seen" values
    history_map = {}
    last_run_date = "N/A"
    safe_name = "".join([c for c in template_name if c.isalnum() or c in (' ', '.', '_')]).rstrip()
    if safe_name.lower().endswith('.xlsx'): safe_name = safe_name[:-5]
    history_dir = os.path.join(template_dir, 'history')
    h_path = os.path.join(history_dir, f"History_{safe_name}.xlsx")
    
    if os.path.exists(h_path):
        try:
            h_df = pd.read_excel(h_path)
            
            # Robust parsing of Query_Date for sorting
            def parse_qd(val):
                val_str = str(val).strip()
                try:
                    if ',' in val_str: # YYYY/MM/DD, HH:MM
                        return datetime.strptime(val_str, "%Y/%m/%d, %H:%M")
                    return pd.to_datetime(val_str)
                except:
                    return datetime.min

            if not h_df.empty:
                h_df['_sort_date'] = h_df['Query_Date'].apply(parse_qd)
                h_df = h_df.sort_values('_sort_date')
                
                max_date = h_df['_sort_date'].max()
                if max_date != datetime.min:
                    last_run_date = max_date.strftime("%Y/%m/%d, %H:%M")

                # Group by URL and get the latest record
                for url, group in h_df.groupby('URL', sort=False):
                    last_row = group.iloc[-1]
                    count = last_row.get('Count')
                    if pd.isna(count) or count == 'nan':
                        qr = str(last_row.get('Query Results', ''))
                        m = re.search(r'(\d+)', qr)
                        count = m.group(1) if m else "N/A"
                    
                    delay = last_row.get('Delay')
                    if pd.isna(delay):
                        delay = last_row.get('Result Time (Minimum 1s)', 0)
                    
                    history_map[str(url)] = {
                        "count": str(count),
                        "time": float(delay) if not pd.isna(delay) else 0.0
                    }
        except Exception as e:
            print(f"Error loading history for template info: {e}")

    try:
        df = pd.read_excel(path).fillna('N/A')
        tasks = []
        last_query_details = "N/A"
        
        for index, row in df.iterrows():
            current_url = str(row.get('Result Link', ''))
            current_details = str(row.get('Query Details', 'N/A')).strip()
            
            if current_details == 'N/A' or not current_details:
                current_details = last_query_details
            else:
                last_query_details = current_details
            
            h_data = history_map.get(current_url, {"count": "N/A", "time": 0})
                
            tasks.append({
                "task_num": index + 1,
                "version": str(row.get('Version', 'N/A')).strip(),
                "url": current_url,
                "query_details": current_details,
                "status": "pending",
                "count": "N/A",
                "time_to_ready": 0,
                "prev_count": h_data["count"],
                "prev_time": h_data["time"]
            })
        return jsonify({
            "template_name": template_name, 
            "total_tasks": len(tasks), 
            "tasks": tasks,
            "last_run_date": last_run_date
        })
    except Exception as e: return jsonify({"error": str(e)}), 500

@webtest_bp.route('/probe_single', methods=['POST'])
def probe_single():
    if not current_user.is_authenticated:
        return jsonify({"error": "Unauthorized"}), 401
        
    data = request.get_json()
    ui_url = data.get('url')
    version = data.get('version', '')
    template_name = data.get('template_name', '')
    
    if not ui_url: return jsonify({"error": "No URL"}), 400
    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
    })
    start_time = time.time()
    api_url = get_api_url(ui_url, version)
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
                
                if total is not None:
                    record_history(template_name, ui_url, str(total), elapsed, current_user.username)
                    return jsonify({"status": "Success", "count": str(total), "time": elapsed})
            except:
                if "labeling results" in resp.text.lower():
                    match = re.search(r'(\d+)\s+Labeling Results', resp.text, re.IGNORECASE)
                    count = match.group(1) if match else "Found"
                    record_history(template_name, ui_url, count, elapsed, current_user.username)
                    return jsonify({"status": "Success", "count": count, "time": elapsed})
            return jsonify({"status": "Format Error", "count": "N/A", "time": elapsed})
        elif resp.status_code == 404: return jsonify({"status": "Not Found (404)", "count": "N/A", "time": elapsed})
        else: return jsonify({"status": f"HTTP {resp.status_code}", "count": "N/A", "time": elapsed})
    except: return jsonify({"status": "Inaccessible", "count": "N/A", "time": round(time.time() - start_time, 2)})

def get_formatted_df(results):
    """Helper to format results into the history-consistent structure."""
    now_str = datetime.now().strftime("%Y/%m/%d, %H:%M")
    formatted = []
    username = current_user.username if current_user.is_authenticated else "Anonymous"
    for r in results:
        server = "PROD"
        url = r.get('url', '')
        if "dev" in url.lower(): server = "DEV"
        elif "tst" in url.lower() or "test" in url.lower(): server = "TEST"
        
        count_val = r.get('count', 'N/A')
        query_results = f"{count_val} labeling results" if count_val not in ['N/A', 'Found', ''] else count_val
        
        formatted.append({
            "#Task": r.get('task_num'),
            "Server": server,
            "Version": r.get('version'),
            "URL": url,
            "Query Results": query_results,
            "Result Time (Minimum 1s)": r.get('time_to_ready'),
            "Query_Date": now_str,
            "Query Details": r.get('query_details'),
            "Notes": f"Ran by {username}"
        })
    return pd.DataFrame(formatted)

@webtest_bp.route('/report_from_data', methods=['POST'])
def report_from_data():
    if not current_user.is_authenticated:
        return jsonify({"error": "Unauthorized"}), 401
    data = request.get_json()
    results = data.get('results', [])
    if not results: return jsonify({"error": "No data"}), 400
    
    df = get_formatted_df(results)
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Testing Results')
    output.seek(0)
    return send_file(output, mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', as_attachment=True, download_name=f"webtest_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx")

@webtest_bp.route('/save_results', methods=['POST'])
def save_results():
    """Automatically saves the completed run as a JSON file, consistent with history format."""
    if not current_user.is_authenticated:
        return jsonify({"error": "Unauthorized"}), 401
    data = request.get_json()
    results = data.get('results', [])
    template_name = data.get('template_name', 'unknown')
    if not results: return jsonify({"error": "No results"}), 400
    
    results_dir = os.path.join(current_app.root_path, '..', 'frontend', 'public', 'webtest', 'results')
    if not os.path.exists(results_dir):
        results_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'frontend', 'public', 'webtest', 'results'))
        os.makedirs(results_dir, exist_ok=True)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_name = "".join([c for c in template_name if c.isalnum() or c in (' ', '.', '_')]).rstrip()
    filename = f"result_{safe_name}_{timestamp}.json"
    filepath = os.path.join(results_dir, filename)
    
    # Format results for consistency
    df_formatted = get_formatted_df(results)
    formatted_results = df_formatted.to_dict(orient='records')
    
    try:
        with open(filepath, 'w') as f:
            json.dump({
                "template": template_name,
                "timestamp": datetime.now().isoformat(),
                "total_tasks": len(results),
                "results": formatted_results
            }, f, indent=4)
        return jsonify({"success": True, "filename": filename})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def record_history(template_name, url, count, delay, username="Anonymous"):
    """Appends a task run to the history Excel file, matching its original format."""
    if not template_name or template_name == "unknown":
        return
    
    history_dir = os.path.join(current_app.root_path, '..', 'frontend', 'public', 'webtest', 'history')
    if not os.path.exists(history_dir):
        history_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'frontend', 'public', 'webtest', 'history'))
        os.makedirs(history_dir, exist_ok=True)
    
    safe_name = "".join([c for c in template_name if c.isalnum() or c in (' ', '.', '_')]).rstrip()
    if safe_name.lower().endswith('.xlsx'):
        safe_name = safe_name[:-5]
        
    filepath = os.path.join(history_dir, f"History_{safe_name}.xlsx")
    
    now = datetime.now()
    new_data = {
        "URL": url,
        "Date": now.strftime("%Y-%m-%d %H:%M:%S"),
        "Count": str(count) if count is not None else "0",
        "Delay": round(float(delay), 2) if delay is not None else 0.0,
        "Notes": f"Ran by {username}"
    }
    
    try:
        if os.path.exists(filepath):
            df_history = pd.read_excel(filepath)
            # Try to populate more fields from previous entries if URL matches
            match = df_history[df_history['URL'] == url]
            if not match.empty:
                last_match = match.iloc[-1]
                new_data["#Task"] = last_match.get("#Task")
                new_data["Server"] = last_match.get("Server")
                new_data["Version"] = last_match.get("Version")
                new_data["Query Details"] = last_match.get("Query Details")
            
            df_history = pd.concat([df_history, pd.DataFrame([new_data])], ignore_index=True)
        else:
            df_history = pd.DataFrame([new_data])
        
        # Ensure Count and URL stay string
        df_history['Count'] = df_history['Count'].astype(str)
        df_history['URL'] = df_history['URL'].astype(str)
        df_history.to_excel(filepath, index=False)
    except Exception as e:
        print(f"Error recording history: {e}")

@webtest_bp.route('/task_history', methods=['GET'])
def get_task_history():
    template_name = request.args.get('template_name')
    url = request.args.get('url')
    
    if not template_name or not url:
        return jsonify({"error": "Missing template_name or url"}), 400
        
    history_dir = os.path.join(current_app.root_path, '..', 'frontend', 'public', 'webtest', 'history')
    if not os.path.exists(history_dir):
        history_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'frontend', 'public', 'webtest', 'history'))
        
    safe_name = "".join([c for c in template_name if c.isalnum() or c in (' ', '.', '_')]).rstrip()
    if safe_name.lower().endswith('.xlsx'):
        safe_name = safe_name[:-5]
        
    filepath = os.path.join(history_dir, f"History_{safe_name}.xlsx")
    
    if not os.path.exists(filepath):
        return jsonify([])
        
    try:
        df = pd.read_excel(filepath)
        # Filter for URL match
        task_history = df[df['URL'].astype(str) == str(url)].copy()
        
        if not task_history.empty:
            results = []
            # Calculate 2 years ago cutoff
            two_years_ago = datetime.now() - pd.DateOffset(years=2)
            
            for _, row in task_history.iterrows():
                # Extract Date and handle filtering
                dt_str = row.get('Date')
                if pd.isna(dt_str) or str(dt_str) == 'NaT' or str(dt_str) == 'nan':
                    dt_str = row.get('Query_Date', '')
                
                # Attempt to parse for filtering and consistent sorting
                record_dt = None
                try:
                    # Handle multiple potential formats
                    clean_dt_str = str(dt_str).strip()
                    if ',' in clean_dt_str: # YYYY/MM/DD, HH:MM
                        # Split and take just the date part for more robust parsing if time format varies
                        date_part = clean_dt_str.split(',')[0].strip()
                        record_dt = datetime.strptime(date_part, "%Y/%m/%d")
                    else: # YYYY-MM-DD HH:MM:SS
                        record_dt = pd.to_datetime(clean_dt_str)
                    
                    if record_dt and record_dt < two_years_ago:
                        continue
                except:
                    pass
                
                # Extract Count
                count = row.get('Count')
                if pd.isna(count) or count == 'nan':
                    # Try parsing from 'Query Results' column
                    qr = str(row.get('Query Results', ''))
                    m = re.search(r'(\d+)', qr)
                    count = m.group(1) if m else "0"
                
                # Extract Delay
                delay = row.get('Delay')
                if pd.isna(delay):
                    delay = row.get('Result Time (Minimum 1s)', 0)
                
                results.append({
                    "Date": record_dt.strftime("%Y-%m-%d %H:%M:%S") if record_dt else str(dt_str),
                    "SortDate": record_dt if record_dt else datetime.min,
                    "URL": str(url),
                    "Version": str(row.get('Version', 'N/A')),
                    "Count": str(count),
                    "Delay": float(delay) if not pd.isna(delay) else 0.0,
                    "Notes": str(row.get('Notes', ''))
                })
            
            # Accurate chronological sort
            results.sort(key=lambda x: x['SortDate'])
            
            # Cleanup for JSON response
            for r in results:
                r.pop('SortDate', None)
            
            return jsonify(results)
            
        return jsonify([])
    except Exception as e:
        print(f"Error in get_task_history: {e}")
        return jsonify({"error": str(e)}), 500

@webtest_bp.route('/group_history', methods=['GET'])
def get_group_history():
    template_name = request.args.get('template_name')
    query_details = request.args.get('query_details')
    
    if not template_name or not query_details:
        return jsonify({"error": "Missing template_name or query_details"}), 400
        
    history_dir = os.path.join(current_app.root_path, '..', 'frontend', 'public', 'webtest', 'history')
    if not os.path.exists(history_dir):
        history_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'frontend', 'public', 'webtest', 'history'))
        
    safe_name = "".join([c for c in template_name if c.isalnum() or c in (' ', '.', '_')]).rstrip()
    if safe_name.lower().endswith('.xlsx'):
        safe_name = safe_name[:-5]
        
    filepath = os.path.join(history_dir, f"History_{safe_name}.xlsx")
    
    if not os.path.exists(filepath):
        return jsonify([])
        
    try:
        df = pd.read_excel(filepath)
        # Ensure column exists
        if 'Query Details' not in df.columns:
            # Fallback for older history files if they use different names
            possible_names = ['Query Details', 'Details', 'Query', 'Task Details']
            for name in possible_names:
                if name in df.columns:
                    df['Query Details'] = df[name]
                    break
        
        if 'Query Details' not in df.columns:
            return jsonify([])

        # Filter for Query Details match
        # Clean query details to match robustly
        q_clean = str(query_details).strip()
        # Handle cases where Query Details might be NaN
        df['Query Details'] = df['Query Details'].fillna('').astype(str).str.strip()
        group_history = df[df['Query Details'] == q_clean].copy()
        
        if not group_history.empty:
            results = []
            two_years_ago = datetime.now() - pd.DateOffset(years=2)
            
            for _, row in group_history.iterrows():
                dt_str = row.get('Date')
                if pd.isna(dt_str) or str(dt_str) == 'NaT' or str(dt_str) == 'nan' or not str(dt_str).strip():
                    dt_str = row.get('Query_Date', '')
                
                record_dt = None
                try:
                    clean_dt_str = str(dt_str).strip()
                    if clean_dt_str:
                        if ',' in clean_dt_str:
                            date_part = clean_dt_str.split(',')[0].strip()
                            record_dt = datetime.strptime(date_part, "%Y/%m/%d")
                        else:
                            record_dt = pd.to_datetime(clean_dt_str)
                    
                    if record_dt and record_dt < two_years_ago:
                        continue
                except:
                    pass
                
                count = row.get('Count')
                if pd.isna(count) or str(count).lower() == 'nan' or str(count).strip() == '':
                    qr = str(row.get('Query Results', ''))
                    m = re.search(r'(\d+)', qr)
                    count = m.group(1) if m else "0"
                
                delay = row.get('Delay')
                if pd.isna(delay) or str(delay).lower() == 'nan':
                    delay = row.get('Result Time (Minimum 1s)', 0)
                
                results.append({
                    "Date": record_dt.strftime("%Y-%m-%d %H:%M:%S") if record_dt else str(dt_str),
                    "SortDate": record_dt if record_dt else datetime.min,
                    "URL": str(row.get('URL', '')),
                    "Version": str(row.get('Version', 'N/A')),
                    "Count": str(count),
                    "Delay": float(delay) if not pd.isna(delay) and str(delay).strip() != '' else 0.0,
                    "Notes": str(row.get('Notes', ''))
                })
            
            results.sort(key=lambda x: x['SortDate'])
            for r in results:
                r.pop('SortDate', None)
            
            return jsonify(results)
            
        return jsonify([])
    except Exception as e:
        import traceback
        print(f"Error in get_group_history: {e}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
