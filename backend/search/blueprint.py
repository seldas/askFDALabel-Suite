from flask import Blueprint, request, jsonify, Response, stream_with_context, send_file
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

from search.scripts.search_v1 import (
    search_v1 as search_v1_func,
    generate_answer_stream as generate_answer_stream_func,
    get_metadata as get_metadata_func,
    call_llm_stream as call_llm_stream_func,
    lob_to_string,
)
from search.scripts.search_v2 import search_v2 as search_v2_func

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
    resp, status = search_v1_func(payload)
    return jsonify(resp), status

@search_bp.route("/find", methods=["GET"])
def find():
    query = request.args.get("q", "").strip()
    skip = request.args.get("skip", 0, type=int)
    limit = request.args.get("limit", 10, type=int)
    
    if not query:
        return jsonify({"results": [], "total": 0})
        
    try:
        labels, total = find_labels(query, skip=skip, limit=limit)
        return jsonify({"results": labels, "total": total})
    except Exception as e:
        logger.error(f"Error in /find: {e}")
        return jsonify({"error": str(e)}), 500

@search_bp.route("/search_agentic", methods=["POST"])
def search_agentic():
    payload = request.json or {}
    resp, status = search_v2_func(payload)
    return jsonify(resp), status

@search_bp.route("/generate_answer", methods=["POST"])
def generate_answer():
    payload = request.json or {}
    def gen():
        yield from generate_answer_stream_func(payload)
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
    model = llm_model_name or ""
    stream = client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=0.1,
        stream=True,
    )
    for evt in stream:
        try:
            delta = evt.choices[0].delta.content
        except Exception:
            delta = None
        if delta:
            yield delta

@search_bp.route("/search_agentic_stream", methods=["POST"])
def search_agentic_stream():
    payload = request.json or {}
    def generate():
        state = AgentState(payload)
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
        def chat_stream():
            yield from search.call_llm_stream_func(chatHistory, spl_xmls, uploaded_files)
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
        xml_data = {}
        con = None
        try:
            con = oracledb.connect(user=FDALabel_USER, password=FDALabel_PSW, dsn=dsnStr)
            cursor = con.cursor()
            query = "SELECT XMLSERIALIZE(DOCUMENT spl_xml AS CLOB) FROM spl WHERE set_id = :set_id"
            for set_id in set_ids:
                cursor.execute(query, {"set_id": set_id})
                result = cursor.fetchone()
                if result: xml_data[set_id] = lob_to_string(result[0])
                else: xml_data[set_id] = "XML content not found in database."
        except oracledb.DatabaseError as db_err:
            logger.error(f"Database error during XML export: {db_err}")
            return jsonify({"error": "Database operation failed"}), 500
        finally:
            if con: con.close()
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
        con = None
        try:
            con = oracledb.connect(user=FDALabel_USER, password=FDALabel_PSW, dsn=dsnStr)
            cursor = con.cursor()
            bind_names = [f":id{i}" for i in range(len(set_ids))]
            bind_map = {f"id{i}": sid for i, sid in enumerate(set_ids)}
            sql = f"SELECT * FROM druglabel.dgv_sum_rx_spl WHERE set_id IN ({','.join(bind_names)})"
            cursor.execute(sql, bind_map)
            columns = [col[0].upper() for col in cursor.description]
            rows = cursor.fetchall()
            df_db = pd.DataFrame(rows, columns=columns)
        except Exception as e:
            logger.error(f"DB Error in export_excel: {e}")
            return jsonify({"error": "Database query failed"}), 500
        finally:
            if con: con.close()
        def get_col(df, candidates):
            for c in candidates:
                if c in df.columns: return df[c]
            return ""
        export_df = pd.DataFrame()
        export_df["Marketing Category"] = get_col(df_db, ["MARKET_CATEGORIES", "MARKETING_CATEGORIES", "APPLICATION_TYPE"])
        export_df["Application Number(s)"] = get_col(df_db, ["APPR_NUM", "APPROVAL_NUM"])
        export_df["Trade Name"] = get_col(df_db, ["PRODUCT_NAMES", "PRODUCT_TITLE"])
        export_df["Generic/Proper Name(s)"] = get_col(df_db, ["GENERIC_NAMES", "PRODUCT_NORMD_GENERIC_NAMES"])
        eff_time = get_col(df_db, ["EFF_TIME", "EFFECTIVE_TIME"])
        export_df["SPL Effective Date (YYYY/MM/DD)"] = pd.to_datetime(eff_time, errors="coerce").dt.strftime("%Y/%m/%d")
        export_df["Initial U.S. Approval"] = get_col(df_db, ["INITIAL_APPROVAL_YEAR", "APPROVAL_YEAR"])
        export_df["Dosage Form(s)"] = get_col(df_db, ["DOSAGE_FORMS"])
        export_df["Route(s) of Administration"] = get_col(df_db, ["ROUTES", "ROUTES_OF_ADMINISTRATION"])
        export_df["Established Pharmacologic Class(es)"] = get_col(df_db, ["EPC"])
        export_df["Company"] = get_col(df_db, ["AUTHOR_ORG_NORMD_NAME", "COMPANY"])
        export_df["NDC(s)"] = get_col(df_db, ["NDC_CODES", "NDC"])
        export_df["Marketing Date(s) (YYYY/MM/DD)"] = get_col(df_db, ["MARKETING_START_DATE", "START_MARKETING_DATE"])
        export_df["Active Ingredient UNII(s)"] = get_col(df_db, ["ACT_INGR_UNIIS", "UNII"])
        export_df["Active Ingredient(s)"] = get_col(df_db, ["ACT_INGR_NAMES", "ACTIVE_INGREDIENTS"])
        export_df["Labeling Type"] = get_col(df_db, ["DOCUMENT_TYPE", "DOC_TYPE", "LABEL_TYPE"])
        base_fda = "https://fdalabel.fda.gov/fdalabel-r/services/spl/set-ids/{}/spl-doc"
        base_dm_spl = "https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid={}"
        base_dm_pdf = "https://dailymed.nlm.nih.gov/dailymed/downloadpdffile.cfm?setId={}"
        set_ids_col = get_col(df_db, ["SET_ID"])
        export_df["FDALabel Link"] = set_ids_col.apply(lambda x: base_fda.format(x) if x else "")
        export_df["DailyMed SPL Link"] = set_ids_col.apply(lambda x: base_dm_spl.format(x) if x else "")
        export_df["DailyMed PDF Link"] = set_ids_col.apply(lambda x: base_dm_pdf.format(x) if x else "")
        export_df["SET ID"] = set_ids_col
        template_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            "idea",
            "fdalabel-query-240623-DILI-RLD-WARNING.xlsx",
        )
        try:
            wb = load_workbook(template_path)
            ws = wb.active
            if ws.max_row > 1: ws.delete_rows(2, ws.max_row - 1)
            for r in dataframe_to_rows(export_df, index=False, header=False): ws.append(r)
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
        messages = [{"role": "system", "content": prompt_boring}]
        process_success, generated_question = safe_llm_call(client, messages, max_tokens=100, temperature=0.9)
        if not process_success: return jsonify({"query": "What are the indications for Ozempic?"})
        return jsonify({"query": generated_question.replace('"', "").strip()})
    except Exception as e:
        logger.error(f"Error in random_query: {e}")
        return jsonify({"query": "What are the indications for Ozempic?"}), 500

@search_bp.route("/snippet-preview", methods=["GET"])
def snippet_preview():
    drug_name = request.args.get("drug_name", "").strip()
    if not drug_name: return jsonify({"error": "Missing drug_name"}), 400
    con = None
    try:
        con = oracledb.connect(user=FDALabel_USER, password=FDALabel_PSW, dsn=dsnStr)
        cursor = con.cursor()
        query = """
            SELECT s.SET_ID, s.APPR_NUM, s.PRODUCT_NAMES, s.PRODUCT_NORMD_GENERIC_NAMES, s.ACT_INGR_NAMES, rld.RLD, s.EFF_TIME
            FROM druglabel.DGV_SUM_SPL s
            LEFT JOIN druglabel.sum_spl_rld rld on rld.spl_id = s.spl_id
            WHERE (UPPER(s.PRODUCT_NAMES) LIKE UPPER(:dn) OR UPPER(s.PRODUCT_NORMD_GENERIC_NAMES) LIKE UPPER(:dn) OR UPPER(s.ACT_INGR_NAMES) LIKE UPPER(:dn))
            ORDER BY rld.RLD DESC, s.EFF_TIME DESC
            FETCH FIRST 1 ROWS ONLY
        """
        cursor.execute(query, {"dn": drug_name})
        row = cursor.fetchone()
        if not row:
            cursor.execute(query, {"dn": f"%{drug_name}%"})
            row = cursor.fetchone()
            if not row: return jsonify({"found": False, "drug_name": drug_name}), 200
        data = {"found": True, "set_id": row[0], "appr_num": row[1], "product_name": row[2], "generic_name": row[3], "active_ingredients": row[4], "is_RLD": row[5], "effective_date": row[6]}
        return jsonify(data)
    except Exception as e:
        logger.error(f"Error in snippet_preview: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if con: con.close()

