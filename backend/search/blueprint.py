from flask import Blueprint, request, jsonify, Response, stream_with_context, send_file
from flask_login import current_user
import os
import io
import json
import logging
import threading
import time
import pandas as pd
from openai import OpenAI
from openpyxl import load_workbook
from openpyxl.utils.dataframe import dataframe_to_rows

from dashboard.services.ai_handler import call_llm as unified_call_llm
from search.scripts.semantic_search import semantic_search as semantic_search_func
from search.scripts.semantic_core.state import AgentState
from search.scripts.semantic_core.controller import run_controller
from search.scripts.semantic_core.helpers import (
    convert_oracle_to_filtered_results,
    build_debug_stats,
)
from search.scripts.semantic_core.agents.answer_composer import run_answer_composer
from search.scripts.semantic_core.agents.reasoning_generator import run_reasoning_generator
from search.scripts.general_search import search_general

search_bp = Blueprint('search', __name__)
logger = logging.getLogger(__name__)

@search_bp.route("/chat", methods=["POST"])
def chat_with_ai():
    """
    AI Chat entry point. 
    Handles conversational responses based on labeling data.
    Includes history capping (20 msgs) and length truncation (300k chars).
    """
    payload = request.json or {}
    ai_provider = payload.get("ai_provider")
    user_obj = current_user._get_current_object() if current_user.is_authenticated else None
    if user_obj and ai_provider:
        user_obj.ai_provider = ai_provider
    
    user_input = payload.get("query")
    raw_history = payload.get("chat_history", [])

    # 1. Cap to last 20 messages
    capped_history = raw_history[-20:] if len(raw_history) > 20 else list(raw_history)

    # 2. Length truncation (300,000 characters)
    # We measure total character length of the history content
    total_chars = sum(len(str(m.get("content", ""))) for m in capped_history)
    
    final_history = capped_history
    omitted = len(raw_history) > 20

    if total_chars > 300000:
        current_len = total_chars
        while final_history and current_len > 300000:
            removed = final_history.pop(0)
            current_len -= len(str(removed.get("content", "")))
            omitted = True
        
    # Add the omitted marker to the first remaining message if we actually removed something
    if omitted and final_history:
        # Create a new dict to avoid mutating shared objects
        first_msg = dict(final_history[0])
        original_content = first_msg.get("content", "")
        first_msg["content"] = f"[..prev message omitted..] {original_content}"
        final_history[0] = first_msg

    # Pass everything to search_general
    resp = search_general(user_input, user=user_obj, filters=payload, history=final_history)
    return jsonify({"response_text": resp}), 200

# --- Database Filtering (Right Panel) ---
@search_bp.route("/filter_data", methods=["POST"])
def filter_data():
    """
    Data-only filtering for the Results panel.
    """
    from dashboard.services.fdalabel_db import FDALabelDBService
    payload = request.json or {}
    filters = payload.get("filters", {})
    limit = int(payload.get("limit", 5000))
    
    results, total_count = FDALabelDBService.filter_labels(filters, limit=limit)
    
    if total_count > limit:
        return jsonify({
            "results": [],
            "total_counts": total_count,
            "message": f"Too many results ({total_count}) meet the criteria, please add more conditions."
        }), 200
        
    return jsonify({
        "results": results,
        "total_counts": total_count,
        "message": ""
    }), 200

# --- Streaming Agentic Search (Semantic) ---
def _humanize_trace(line: str) -> str:
    s = (line or "").strip()
    if s.startswith("Planner:"): return "Planning query strategy..."
    if "semantic_retriever" in s.lower(): return "Searching label embeddings..."
    if "keyword_retriever" in s.lower(): return "Performing keyword lookup..."
    if "reranker" in s.lower(): return "Reranking results for precision..."
    if "evidence_fetcher" in s or "evidence" in s.lower(): return "Preparing label excerpts..."
    if "answer_composer" in s.lower() or "Composer" in s: return "Composing clinical answer..."
    return s

def stream_answer_tokens(state):
    # For semantic search, we typically use the answer_composer logic
    # We can either run it once or stream it if the composer supports it.
    # Here we simulate the stream via unified_call_llm if possible, 
    # but the simplest is to follow the v2 pattern.
    
    from search.scripts.semantic_core.agents.answer_composer import ANSWER_COMPOSER_SYSTEM_PROMPT
    query = state.conversation.get("user_query", "")
    snippets = state.evidence.get("snippets", [])
    
    if not snippets:
        yield "I couldn’t find relevant label excerpts for your question."
        return

    snippets_text = ""
    for i, s in enumerate(snippets):
        snippets_text += f"--- Excerpt {i+1} ---\nDrug: {s['drug_name']}\nSection: {s['section']}\nText: {s['snippet']}\n\n"

    system_prompt = ANSWER_COMPOSER_SYSTEM_PROMPT.format(snippets_text=snippets_text, query=query)
    
    stream = unified_call_llm(
        user=state.user,
        system_prompt=system_prompt,
        user_message="Please generate the grounded answer based on the label excerpts.",
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
    user_obj = current_user._get_current_object() if current_user.is_authenticated else None
    if user_obj and ai_provider:
        user_obj.ai_provider = ai_provider

    def generate():
        state = AgentState(payload, user=user_obj)
        done = threading.Event()
        err = {}
        
        def worker():
            try:
                # Run everything except the final answer generation (which we stream)
                run_controller(state, stop_before="answer_composer")
            except Exception as e:
                err["e"] = e
                logger.error(f"Agent worker failed: {e}", exc_info=True)
            finally:
                done.set()
        
        threading.Thread(target=worker, daemon=True).start()
        
        sent = 0
        yield json.dumps({"type": "status", "text": "Initializing Semantic Agent..."}) + "\n"
        
        while not done.is_set():
            while sent < len(state.trace_log):
                line = state.trace_log[sent]
                yield json.dumps({"type": "status", "text": _humanize_trace(line)}) + "\n"
                sent += 1
            time.sleep(0.1)
            
        while sent < len(state.trace_log):
            line = state.trace_log[sent]
            yield json.dumps({"type": "status", "text": _humanize_trace(line)}) + "\n"
            sent += 1
            
        if "e" in err:
            yield json.dumps({"type": "error", "error": str(err["e"])}) + "\n"
            return

        yield json.dumps({"type": "status", "text": "Generating answer..."}) + "\n"
        yield json.dumps({"type": "answer_start"}) + "\n"
        
        answer_text = ""
        try:
            for tok in stream_answer_tokens(state):
                answer_text += tok
                yield json.dumps({"type": "chunk", "text": tok}) + "\n"
        except Exception as e:
            yield json.dumps({"type": "error", "error": f"Streaming failed: {str(e)}"}) + "\n"
            return
            
        state.answer["response_text"] = answer_text
        yield json.dumps({"type": "answer_end"}) + "\n"
        
        # Final Reasoning
        try:
            run_reasoning_generator(state)
        except Exception: pass
        
        # Build final response object (compatibility with UI)
        debug_stats = build_debug_stats(state)
        final_results = list(convert_oracle_to_filtered_results(state.retrieval.get("results", [])).values())
        
        resp = {
            "med_answer": answer_text,
            "results": final_results,
            "agent_flow": state.agent_flow,
            "reasoning": state.reasoning,
            "debug_stats": debug_stats,
            "trace_log": state.trace_log,
        }
        yield json.dumps({"type": "final", "status": 200, "payload": resp}) + "\n"

    return Response(stream_with_context(generate()), mimetype="application/x-ndjson")

# --- Chat with Labels ---
@search_bp.route("/chat", methods=["POST"])
def chat():
    try:
        chatHistory = json.loads(request.form.get("chatHistory", "[]"))
        documents = request.form.get("documents", "")
        doc_type = request.form.get("doc_type", "")
        
        # For chat, we reuse the semantic answering logic but with direct context
        user_obj = current_user._get_current_object() if current_user.is_authenticated else None
        
        def chat_stream():
            # Minimal wrapper for streaming chat
            system_prompt = "You are a helpful FDA Labeling assistant. Answer based on the provided documents."
            user_msg = f"Context: {documents}\n\nUser Question: {chatHistory[-1]['content'] if chatHistory else 'Hello'}"
            
            stream = unified_call_llm(
                user=user_obj,
                system_prompt=system_prompt,
                user_message=user_msg,
                history=chatHistory[:-1],
                stream=True
            )
            for chunk in stream:
                text = ""
                if hasattr(chunk, 'choices'):
                    if chunk.choices and chunk.choices[0].delta and chunk.choices[0].delta.content:
                        text = chunk.choices[0].delta.content
                elif isinstance(chunk, str):
                    text = chunk
                if text:
                    yield json.dumps({"summary_chunk": text}) + "\n"

        return Response(stream_with_context(chat_stream()), content_type="application/json")
    except Exception as e:
        logger.error(f"Chat error: {e}")
        return jsonify({"error": str(e)}), 500

# --- Helper Routes (Metadata, Exports) ---
@search_bp.route("/get_metadata", methods=["POST"])
def get_metadata():
    from dashboard.services.fdalabel_db import FDALabelDBService
    payload = request.json or {}
    set_ids = payload.get("set_ids", [])
    results = []
    for sid_obj in set_ids:
        sid = sid_obj.get("set_id")
        meta = FDALabelDBService.get_label_metadata(sid)
        if meta:
            results.append(meta)
    return jsonify({"results": results})

@search_bp.route("/export_excel", methods=["POST"])
def export_excel():
    try:
        data = request.json or {}
        set_ids = data.get("set_ids", [])
        from dashboard.services.fdalabel_db import FDALabelDBService
        export_data = FDALabelDBService.get_labels_by_set_ids_for_export(set_ids)
        df = pd.DataFrame(export_data)
        
        out = io.BytesIO()
        df.to_excel(out, index=False)
        out.seek(0)
        return send_file(out, as_attachment=True, download_name="labels_export.xlsx")
    except Exception as e:
        return jsonify({"error": str(e)}), 500
