# ./backend/search/scripts/search_v1.py

import os
import re
import json
import logging
from collections import defaultdict
from html import unescape
from typing import Any, Dict, List, Optional, Tuple, Generator

from dotenv import load_dotenv
from openai import OpenAI

from search.call_llm import safe_llm_call
from search.file_util import process_uploaded_file, process_image
from search.scripts.prompt_search_v1 import prompt_query, prompt_answering
from dashboard.services.fdalabel_db import FDALabelDBService
from dashboard.services.ai_handler import call_llm as unified_call_llm

load_dotenv()

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)
logging.getLogger("openai").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)

# -----------------------------
# Environment / Initialization
# -----------------------------
openai_api_key = os.getenv("LLM_KEY", "")
openai_api_base = os.getenv("LLM_URL", "")
llm_model_name = os.getenv("LLM_MODEL", "")

client = OpenAI(api_key=openai_api_key, base_url=openai_api_base)

def get_db_connection():
    """Create a new database connection (Postgres/Oracle)."""
    return FDALabelDBService.get_connection()

# -----------------------------
# Safety / Utilities
# -----------------------------
def is_safe_sql(sql: str) -> bool:
    """Basic SQL safety check for read-only access."""
    if not sql:
        return False
    sql_upper = sql.upper()
    forbidden = ["INSERT ", "UPDATE ", "DELETE ", "DROP ", "CREATE ", "ALTER ", "TRUNCATE ", "GRANT ", "REVOKE ", "EXEC ", "MERGE ", "REPLACE "]
    if not sql_upper.strip().startswith("SELECT"):
        return False
    return not any(word in sql_upper for word in forbidden)

def clean_xml_content(content: Any) -> str:
    if not content:
        return ""
    content = str(content)
    content = re.sub(r"<(?!/?(?:b|mark)\b)[^>]+>", " ", content)
    content = unescape(content)
    content = re.sub(r"\s+", " ", content).strip()
    return content

# -----------------------------
# Core: Search (callable)
# -----------------------------
def search_v1(payload: Dict[str, Any], user=None) -> Tuple[Dict[str, Any], int]:
    user_query = (payload or {}).get("query", "") or ""
    manual_sql = (payload or {}).get("manual_sql", "") or ""
    current_sql = (payload or {}).get("current_sql", "") or ""
    chat_history = (payload or {}).get("chat_history", []) or []

    logger.info(f"Search Request (V1 - DB): {user_query}")

    con = None
    cursor = None

    generated_query = ""
    suggestions: List[Any] = []
    is_answerable = False
    refined_question = user_query
    med_answer = ""

    try:
        if manual_sql:
            if not is_safe_sql(manual_sql):
                return {"error": "Unsafe SQL detected"}, 400
            generated_query = manual_sql
            med_answer = "Executing manual SQL query."
            is_answerable = True
        else:
            used_prompt = prompt_query.replace("{{CURRENT_SQL_CONTEXT}}", current_sql)
            messages: List[Dict[str, Any]] = [{"role": "system", "content": used_prompt}]
            if isinstance(chat_history, list) and chat_history:
                messages.extend(chat_history)
            messages.append({"role": "user", "content": user_query})

            process_success, llm_response = safe_llm_call(
                client, messages, max_tokens=1024, temperature=0.01, user=user
            )

            if not process_success:
                return {"error": "AI processing failed"}, 500

            try:
                llm_text = llm_response or ""
                if "```json" in llm_text:
                    match = re.search(r"```json\s*(.*?)\s*```", llm_text, re.DOTALL)
                    if match: llm_text = match.group(1).strip()
                elif "```" in llm_text:
                    match = re.search(r"```\s*(.*?)\s*```", llm_text, re.DOTALL)
                    if match: llm_text = match.group(1).strip()

                response_data = json.loads(llm_text)
                generated_query = response_data.get("sql", "") or ""
                med_answer = response_data.get("explanation", "") or ""
                suggestions = response_data.get("suggestions", []) or []
                is_answerable = bool(response_data.get("is_answerable", False))
                refined_question = response_data.get("refined_question", user_query) or user_query

                if not generated_query:
                    return {
                        "input_type": "T0",
                        "med_answer": med_answer,
                        "generated_sql": "",
                        "results": [],
                        "total_counts": 0,
                        "suggestions": suggestions,
                        "is_answerable": False,
                        "refined_question": refined_question,
                    }, 200

            except json.JSONDecodeError:
                return {"error": "Failed to parse AI response"}, 500

        if not is_safe_sql(generated_query):
            return {"error": "Generated SQL was unsafe"}, 400

        con = get_db_connection()
        if not con:
            return {"error": "Database connection failed"}, 500
            
        cursor = con.cursor()
        cursor.execute(generated_query)
        rows = cursor.fetchall()
        
        # Consistent with RealDictCursor or tuple-based access
        if hasattr(cursor, 'description') and cursor.description:
            column_names = [d[0] for d in cursor.description]
            results_list = [dict(row) if isinstance(row, dict) else dict(zip(column_names, row)) for row in rows]
        else:
            results_list = []

        processed_result = convert_db_to_filtered_results(results_list)
        return {
            "input_type": "T1",
            "med_answer": med_answer,
            "generated_sql": generated_query,
            "results": list(processed_result.values()),
            "total_counts": len(processed_result),
            "suggestions": suggestions,
            "is_answerable": is_answerable,
            "refined_question": refined_question,
        }, 200

    except Exception as e:
        import traceback
        logger.error(f"Search Error: {e}")
        traceback.print_exc()
        return {"error": str(e)}, 500
    finally:
        if con: con.close()

# -----------------------------
# Core: Answer generation (stream)
# -----------------------------
def generate_answer_stream(payload: Dict[str, Any], user=None) -> Generator[str, None, None]:
    results = (payload or {}).get("results", []) or []
    refined_question = (payload or {}).get("refined_question", "") or ""
    chat_history = (payload or {}).get("chat_history", []) or []

    try:
        if not results:
            yield json.dumps({"error": "No results provided"}) + "\n"
            return

        # V1 logic now only uses metadata
        top_meta = ""
        for i, res in enumerate(results[:10]):
            top_meta += f"--- Result {i+1} ---\n"
            top_meta += f"Brand: {res.get('PRODUCT_NAMES')}\n"
            top_meta += f"Generic: {res.get('GENERIC_NAMES')}\n"
            top_meta += f"Manufacturer: {res.get('COMPANY')}\n"
            top_meta += f"EPC: {res.get('EPC')}\n"
            top_meta += f"Indications/Usage: [NOT READ - Metadata Search Only]\n\n"

        answer_prompt = f"""
You are a helpful medical assistant.
The user asked: "{refined_question}"

Here is the labeling metadata found for relevant products:
{top_meta}

Please provide an answer based ONLY on the provided metadata. 
Explain that you are searching based on metadata only.
Follow the introduction and disclaimer rules from your system prompt.
"""

        stream = unified_call_llm(
            user=user,
            system_prompt=prompt_answering,
            user_message=answer_prompt,
            history=chat_history,
            max_tokens=4096,
            temperature=0.1,
            stream=True
        )

        for chunk in stream:
            if hasattr(chunk, 'choices'):
                if chunk.choices and chunk.choices[0].delta and chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content
            elif hasattr(chunk, 'text'):
                yield chunk.text
            elif isinstance(chunk, str):
                yield chunk

    except Exception as e:
        logger.error(f"Answer Generation Error: {e}")
        yield f"Error generating answer: {str(e)}"

# -----------------------------
# Metadata fetch (callable)
# -----------------------------
def get_metadata(payload: Dict[str, Any]) -> Tuple[Dict[str, Any], int]:
    requested_set_ids = (payload or {}).get("set_ids", []) or []
    if not requested_set_ids:
        return {"results": []}, 200

    try:
        formatted_results = []
        for x in requested_set_ids:
            tmp_res = dict(x)
            set_id = x.get("set_id")
            if not set_id:
                formatted_results.append(tmp_res)
                continue

            meta = FDALabelDBService.get_label_metadata(set_id)
            if meta:
                tmp_res["EFF_TIME"] = meta.get("effective_time")
            formatted_results.append(tmp_res)

        return {"results": formatted_results}, 200
    except Exception as e:
        logger.error(f"Error in get_metadata: {e}")
        return {"error": str(e)}, 500

# -----------------------------
# Result shaping
# -----------------------------
def convert_db_to_filtered_results(db_results: List[Dict[str, Any]], keywords: Optional[str] = None) -> Dict[str, Dict[str, Any]]:
    filtered_results: Dict[str, Dict[str, Any]] = defaultdict(dict)
    visited = set()

    for result in db_results:
        # Standardize keys to uppercase for compatibility with frontend if needed, 
        # or keep consistent with prompt mandatory columns
        res_upper = {k.upper(): v for k, v in result.items()}
        
        set_id = res_upper.get("SET_ID")
        if not set_id or set_id in visited: continue

        filtered_results[set_id] = {
            "set_id": set_id,
            "PRODUCT_NAMES": res_upper.get("PRODUCT_NAMES"),
            "GENERIC_NAMES": res_upper.get("GENERIC_NAMES") or res_upper.get("PRODUCT_NORMD_GENERIC_NAMES"),
            "COMPANY": res_upper.get("MANUFACTURER") or res_upper.get("AUTHOR_ORG_NORMD_NAME"),
            "APPR_NUM": res_upper.get("APPR_NUM"),
            "ACT_INGR_NAMES": res_upper.get("ACTIVE_INGREDIENTS") or res_upper.get("ACT_INGR_NAMES"),
            "MARKET_CATEGORIES": res_upper.get("MARKET_CATEGORIES"),
            "DOCUMENT_TYPE": res_upper.get("DOC_TYPE") or res_upper.get("DOCUMENT_TYPE"),
            "Routes": res_upper.get("ROUTES"),
            "DOSAGE_FORMS": res_upper.get("DOSAGE_FORMS"),
            "EPC": res_upper.get("EPC"),
            "NDC_CODES": res_upper.get("NDC_CODES"),
            "REVISED_DATE": res_upper.get("REVISED_DATE") or res_upper.get("EFF_TIME"),
            "section_content": "Metadata Search Only. Use AFL Agent for content analysis.",
            "is_metadata_only": True
        }
        visited.add(set_id)

    return filtered_results

# -----------------------------
# LLM answering with uploads (stream)
# -----------------------------
def call_llm_stream(chat_history: List[Dict[str, Any]], spl_xmls: List[str], uploads: Optional[List[Any]] = None, user=None) -> Generator[str, None, None]:
    """
    Streams LLM response as JSON lines: {"summary_chunk": "..."}\n
    """
    processed_uploads = ""
    image_contents: List[Dict[Dict[str, Any], Any]] = []

    if uploads:
        processed_uploads = "\n**User-Uploaded Files:**\n"
        for i, file_storage in enumerate(uploads, 1):
            file_name = getattr(file_storage, "filename", None) or f"file_{i}"
            file_type = getattr(file_storage, "content_type", None) or "unknown"
            file_extension = file_name.lower().split(".")[-1] if "." in file_name else ""
            is_image = (str(file_type).startswith("image/") or file_extension in ["jpg", "jpeg", "png", "gif", "bmp", "webp"])

            if is_image:
                image_content = process_image(file_storage)
                if isinstance(image_content, dict) and "type" in image_content:
                    image_contents.append(image_content)
                    processed_uploads += f"\n{i}. File: {file_name} (Type: {file_type}) - Image processed for AI analysis\n"
                else:
                    processed_uploads += f"\n{i}. File: {file_name} (Type: {file_type})\nContent: {image_content}\n"
                processed_uploads += "---\n"
            else:
                processed_content = process_uploaded_file(file_storage)
                processed_uploads += f"\n{i}. File: {file_name} (Type: {file_type})\nContent:\n{processed_content}\n"
                processed_uploads += "---\n"

    # Reference documents
    AI_ref = ""
    if spl_xmls:
        AI_ref = "\n**Reference Labeling XMLs:**\n"
        for idx, xml in enumerate(spl_xmls):
            AI_ref += f"--- Document {idx+1} ---\n{xml[:10000]}...\n---\n"

    system_prompt = (
        prompt_answering.replace("{{AI_ref}}", AI_ref)
        .replace("{{processed_uploads}}", processed_uploads)
    )

    messages = []
    if isinstance(chat_history, list):
        messages.extend(chat_history)

    # Attach images to the last user message if possible
    if image_contents:
        if messages and messages[-1]["role"] == "user":
            if isinstance(messages[-1]["content"], str):
                messages[-1]["content"] = [{"type": "text", "text": messages[-1]["content"]}]
            messages[-1]["content"].extend(image_contents)
        else:
            messages.append({"role": "user", "content": [{"type": "text", "text": "Include the uploaded images in context of our conversation."}] + image_contents})

    user_message = ""
    history = []
    if messages and messages[-1]['role'] == 'user':
        user_message = messages[-1]['content']
        history = messages[:-1]
    else:
        user_message = "Please process the information."
        history = messages

    stream = unified_call_llm(
        user=user,
        system_prompt=system_prompt,
        user_message=user_message,
        history=history,
        max_tokens=4096,
        temperature=0.01,
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
            yield json.dumps({"summary_chunk": text}) + "\n"

# Backwards compatibility for the imports in blueprint.py
lob_to_string = lambda x: str(x)
