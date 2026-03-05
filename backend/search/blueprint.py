from flask import Blueprint, request, jsonify, Response, stream_with_context, send_file
from flask_login import current_user
from flask_cors import CORS
import os
import io
import json
import logging
import oracledb
import time
import threading
import pandas as pd
from dotenv import load_dotenv
from openai import OpenAI
from openpyxl import load_workbook
from openpyxl.utils.dataframe import dataframe_to_rows

# Since we are moving this to backend/search/blueprint.py, we need to adjust imports
# assuming the python path includes 'backend' or we run from 'backend'
from search.call_llm import safe_llm_call
from search.prompt_active import prompt_boring
from dashboard.services.ai_handler import call_llm as unified_call_llm

from search.scripts.search_v1 import (
    search_v1 as search_v1_func,
    generate_answer_stream as generate_answer_stream_func,
    get_metadata as get_metadata_func,
    call_llm_stream as call_llm_stream_func,
    lob_to_string,
)
from search.scripts.search_v2 import search_v2 as search_v2_func
from search.scripts.search_v3 import search_v3 as search_v3_func

from search.scripts.search_v2 import (
    AgentState,
    run_controller,
    build_debug_stats,
    convert_oracle_to_filtered_results,
)

from dashboard.services.fda_client import find_labels

from search.scripts.search_v2_core.agents.answer_composer import build_answer_messages, run_answer_composer
from search.scripts.search_v2_core.agents.reasoning_generator import run_reasoning_generator
from search.scripts.search_v2_core.config import client

try:
    from search.scripts.search_v2_core.config import llm_model_name
except Exception:
    llm_model_name = None

search_bp = Blueprint('search', __name__)

logger = logging.getLogger(__name__)

# Re-initialize or use shared config if possible
# For now, keep it mostly as is but using search_bp

openai_api_key = os.getenv("LLM_KEY", "")
openai_api_base = os.getenv("LLM_URL", "")
llm_model_name = os.getenv("LLM_MODEL", "")
client = OpenAI(api_key=openai_api_key, base_url=openai_api_base)

FDALabel_SERV = os.getenv("FDALabel_SERV")
FDALabel_PORT = os.getenv("FDALabel_PORT")
FDALabel_APP = os.getenv("FDALabel_APP")
FDALabel_USER = os.getenv("FDALabel_USER")
FDALabel_PSW = os.getenv("FDALabel_PSW")

if FDALabel_SERV and FDALabel_PORT and FDALabel_APP:
    dsnStr = oracledb.makedsn(FDALabel_SERV, FDALabel_PORT, FDALabel_APP)
else:
    dsnStr = None

@search_bp.route("/search", methods=["POST"])
def search():
    payload = request.json or {}
    ai_provider = payload.get("ai_provider")
    user_obj = current_user._get_current_object() if current_user.is_authenticated else None
    if user_obj and ai_provider:
        user_obj.ai_provider = ai_provider
    resp, status = search_v1_func(payload, user=user_obj)
    return jsonify(resp), status

@search_bp.route("/search_v3", methods=["POST"])
def search_v3_route():
    payload = request.json or {}
    ai_provider = payload.get("ai_provider")
    user_obj = current_user._get_current_object() if current_user.is_authenticated else None
    if user_obj and ai_provider:
        user_obj.ai_provider = ai_provider
    resp, status = search_v3_func(payload, user=user_obj)
    return jsonify(resp), status

@search_bp.route("/generate_answer", methods=["POST"])
def generate_answer():
    payload = request.json or {}
    ai_provider = payload.get("ai_provider")
    user_obj = current_user._get_current_object() if current_user.is_authenticated else None
    if user_obj and ai_provider:
        user_obj.ai_provider = ai_provider
    def gen():
        yield from generate_answer_stream_func(payload, user=user_obj)
    return Response(stream_with_context(gen()), content_type="text/plain")

@search_bp.route("/get_metadata", methods=["POST"])
def get_metadata():
    payload = request.json or {}
    resp, status = get_metadata_func(payload)
    return jsonify(resp), status

def build_v2_response_from_state(state: AgentState):
    debug_stats = build_debug_stats(state)
    raw_results = state.retrieval.get("results", [])
    processed_results_dict = convert_oracle_to_filtered_results(raw_results)
    final_results = list(processed_results_dict.values())
    response = {
        "med_answer": state.answer["response_text"],
        "debug_intent": state.intent,
        "results": final_results,
        "is_answerable": True,
        "input_type": "T1",
        "generated_sql": state.retrieval.get("generated_sql", ""),
        "total_counts": len(final_results),
        "suggestions": [],
        "agent_flow": state.agent_flow,
        "reasoning": state.reasoning,
        "debug_plan": state.retrieval.get("plan", {}),
        "debug_stats": debug_stats,
        "trace_log": state.trace_log,
    }
    return response, 200

def _humanize_trace(line: str) -> str:
    s = (line or "").strip()
    if s.startswith("Planner:"): return "Planning query strategy..."
    if "db_executor" in s.lower() or s.startswith("DB"): return "Running database query..."
    if "Evidence Fetcher" in s or "evidence" in s.lower(): return "Fetching label evidence..."
    if "answer_composer" in s.lower() or "Composer" in s: return "Composing answer..."
    return s

def stream_answer_tokens(state):
    intent_type = (state.intent or {}).get("type") or ""
    is_aggregate = bool((state.retrieval or {}).get("aggregate"))
    if is_aggregate or intent_type in ("chitchat", "clarification"):
        run_answer_composer(state)
        yield (state.answer or {}).get("response_text", "") or ""
        return
    
    messages = build_answer_messages(state)
    
    # Extract system prompt if present
    system_prompt = ""
    user_message = ""
    if messages and messages[0]['role'] == 'system':
        system_prompt = messages[0]['content']
        user_message = "Please generate the answer." # build_answer_messages usually puts everything in system prompt or similar
    
    # Actually build_answer_messages returns a single system message with everything
    
    stream = unified_call_llm(
        user=state.user,
        system_prompt=system_prompt,
        user_message=user_message,
        max_tokens=4096,
        temperature=0.1,
        stream=True
    )

    for chunk in stream:
        text = ""
        if hasattr(chunk, 'choices'):
            if chunk.choices and chunk.choices[0].delta and chunk.choices[0].delta.content:
                text = chunk.choices[0].delta.content
        elif hasattr(chunk, 'text'):
            text = chunk.text
        elif isinstance(chunk, str):
            text = chunk
            
        if text:
            yield text

@search_bp.route("/search_agentic_stream", methods=["POST"])
def search_agentic_stream():
    payload = request.json or {}
    ai_provider = payload.get("ai_provider")
    
    # Capture the actual user object before returning the generator
    # This is critical for threads and streaming context
    user_obj = current_user._get_current_object() if current_user.is_authenticated else None
    if user_obj and ai_provider:
        # Override in-memory for the current request flow
        user_obj.ai_provider = ai_provider

    def generate():
        state = AgentState(payload, user=user_obj)
        done = threading.Event()
        err = {}
        def worker():
            try:
                run_controller(state, stop_before="answer_composer")
            except Exception as e:
                err["e"] = e
            finally:
                done.set()
        threading.Thread(target=worker, daemon=True).start()
        sent = 0
        yield json.dumps({"type": "status", "text": "Starting agent run..."}) + "\n"
        while not done.is_set():
            while sent < len(state.trace_log):
                line = state.trace_log[sent]
                yield json.dumps({"type": "status", "text": _humanize_trace(line)}) + "\n"
                sent += 1
            time.sleep(0.12)
        while sent < len(state.trace_log):
            line = state.trace_log[sent]
            yield json.dumps({"type": "status", "text": _humanize_trace(line)}) + "\n"
            sent += 1
        if "e" in err:
            yield json.dumps({"type": "error", "error": str(err["e"])}) + "\n"
            return
        yield json.dumps({"type": "status", "text": "Writing answer..."}) + "\n"
        yield json.dumps({"type": "answer_start"}) + "\n"
        answer_text = ""
        try:
            for tok in stream_answer_tokens(state):
                if not tok: continue
                answer_text += tok
                yield json.dumps({"type": "chunk", "text": tok}) + "\n"
        except Exception as e:
            yield json.dumps({"type": "error", "error": f"Answer streaming failed: {str(e)}"}) + "\n"
            return
        state.answer = state.answer or {}
        state.answer["response_text"] = answer_text
        yield json.dumps({"type": "answer_end"}) + "\n"
        try:
            yield json.dumps({"type": "status", "text": "Finalizing reasoning..."}) + "\n"
            run_reasoning_generator(state)
        except Exception: pass
        resp, status = build_v2_response_from_state(state)
        yield json.dumps({"type": "final", "status": status, "payload": resp}) + "\n"
    r = Response(stream_with_context(generate()), mimetype="application/x-ndjson")
    r.headers["Cache-Control"] = "no-cache"
    r.headers["X-Accel-Buffering"] = "no"
    return r

@search_bp.route("/chat", methods=["POST"])
def chat():
    try:
        chatHistory = json.loads(request.form.get("chatHistory", "[]"))
        documents = request.form.get("documents", "")
        doc_type = request.form.get("doc_type", "")
        uploaded_files = []
        if "uploadedFiles" in request.files:
            uploaded_files = [f for f in request.files.getlist("uploadedFiles") if f and f.filename]
        spl_xmls = []
        if doc_type == "setids":
            setids = json.loads(documents)
            from search.file_util import get_xml
            spl_xmls = get_xml(setids)
        elif doc_type == "ref":
            spl_xmls.append(documents)
        else:
            return jsonify({"error": "Invalid doc_type"}), 400
        user_obj = current_user._get_current_object() if current_user.is_authenticated else None
        def chat_stream():
            yield from search.call_llm_stream_func(
                chatHistory, 
                spl_xmls, 
                uploaded_files, 
                user=user_obj
            )
        return Response(stream_with_context(chat_stream()), content_type="application/json")
    except Exception as e:
        logger.error(f"Error in chat: {e}")
        return jsonify({"error": str(e)}), 500

@search_bp.route("/export_xml", methods=["POST"])
def export_xml():
    try:
        data = request.json or {}
        set_ids = data.get("set_ids", [])
        if len(set_ids) > 5: set_ids = set_ids[:5]
        if not set_ids: return jsonify({"error": "No SET_IDs provided"}), 400
        
        from dashboard.services.fdalabel_db import FDALabelDBService
        xml_data = {}
        for set_id in set_ids:
            xml = FDALabelDBService.get_full_xml(set_id)
            if xml:
                xml_data[set_id] = xml
            else:
                xml_data[set_id] = "XML content not found in local database."
        return jsonify(xml_data)
    except Exception as e:
        logger.error(f"Error in export_xml: {e}")
        return jsonify({"error": str(e)}), 500

@search_bp.route("/export_excel", methods=["POST"])
def export_excel():
    try:
        data = request.json or {}
        set_ids = data.get("set_ids", [])
        if not set_ids: return jsonify({"error": "No SET_IDs provided"}), 400
        
        from dashboard.services.fdalabel_db import FDALabelDBService
        export_data = FDALabelDBService.get_labels_by_set_ids_for_export(set_ids)
        if not export_data:
            return jsonify({"error": "No data found for the provided SET IDs"}), 404
            
        df_export = pd.DataFrame(export_data)
        
        template_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            "idea",
            "fdalabel-query-240623-DILI-RLD-WARNING.xlsx",
        )
        try:
            wb = load_workbook(template_path)
            ws = wb.active
            if ws.max_row > 1: ws.delete_rows(2, ws.max_row - 1)
            
            # Map column names if they differ from template
            # For now just append data rows
            for r in dataframe_to_rows(df_export, index=False, header=False): 
                ws.append(r)
                
            out_buffer = io.BytesIO()
            wb.save(out_buffer)
            out_buffer.seek(0)
            return send_file(out_buffer, as_attachment=True, download_name="fdalabel_export.xlsx", mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        except Exception as e:
            logger.error(f"Template processing error: {e}")
            return jsonify({"error": f"Failed to generate Excel: {str(e)}"}), 500
    except Exception as e:
        logger.error(f"Error in export_excel: {e}")
        return jsonify({"error": str(e)}), 500

@search_bp.route("/random_query", methods=["GET"])
def random_query():
    try:
        user_obj = current_user._get_current_object() if current_user.is_authenticated else None
        messages = [{"role": "system", "content": prompt_boring}, 
                    {"role": "user", "content": "Generate a random question about drug labels that a medical professional might ask."}]
        process_success, generated_question = safe_llm_call(
            client, 
            messages, 
            max_tokens=100, 
            temperature=0.9, 
            user=user_obj
        )
        if not process_success: return jsonify({"query": "What are the indications for Ozempic?"})
        return jsonify({"query": generated_question.replace('"', "").strip()})
    except Exception as e:
        logger.error(f"Error in random_query: {e}")
        return jsonify({"query": "What are the indications for Ozempic?"}), 500


