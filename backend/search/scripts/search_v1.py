# ./backend/scripts/search_v1.py

import os
import re
import json
import logging
from collections import defaultdict
from html import unescape
from typing import Any, Dict, List, Optional, Tuple, Generator

import oracledb
from dotenv import load_dotenv
from openai import OpenAI

from search.call_llm import safe_llm_call  # expected to exist in your project
from search.file_util import process_uploaded_file, process_image  # expected to exist
from search.scripts.prompt_search_v1 import prompt_query, prompt_answering  # expected to exist

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

FDALabel_SERV = os.getenv("FDALabel_SERV")
FDALabel_PORT = os.getenv("FDALabel_PORT")
FDALabel_APP = os.getenv("FDALabel_APP")
FDALabel_USER = os.getenv("FDALabel_USER")
FDALabel_PSW = os.getenv("FDALabel_PSW")

if FDALabel_SERV and FDALabel_PORT and FDALabel_APP:
    dsnStr = oracledb.makedsn(FDALabel_SERV, FDALabel_PORT, FDALabel_APP)
else:
    dsnStr = None
    logger.warning("Oracle DB environment variables missing. DB features will be disabled.")


def get_db_connection() -> oracledb.Connection:
    """Create a new Oracle DB connection. Caller is responsible for closing."""
    return oracledb.connect(user=FDALabel_USER, password=FDALabel_PSW, dsn=dsnStr)


# -----------------------------
# Safety / Utilities
# -----------------------------
def is_safe_sql(sql: str) -> bool:
    """Basic SQL safety check for read-only access."""
    if not sql:
        return False
    sql_upper = sql.upper()
    forbidden = [
        "INSERT ",
        "UPDATE ",
        "DELETE ",
        "DROP ",
        "CREATE ",
        "ALTER ",
        "TRUNCATE ",
        "GRANT ",
        "REVOKE ",
        "EXEC ",
        "MERGE ",
        "REPLACE ",
    ]
    if not sql_upper.strip().startswith("SELECT"):
        return False
    return not any(word in sql_upper for word in forbidden)


def remove_application_prefixes(data: Dict[str, Any]) -> Dict[str, Any]:
    """Remove NDA/BLA/ANDA/NDC prefixes from certain string fields."""
    for k, v in list(data.items()):
        if ("appr" in k.lower() or "ndc" in k.lower()) and isinstance(v, str):
            v = re.sub(r"ANDA\s*", "", v)
            v = re.sub(r"NDA\s*", "", v)
            v = re.sub(r"BLA\s*", "", v)
            data[k] = re.sub(r"NDC\s*", "", v)
    return data


def clean_xml_content(content: Any) -> str:
    """
    Remove XML/HTML tags and clean up content for display.
    Preserves highlight markers (<b>, <mark>) if present.
    """
    if not content:
        return ""
    content = str(content)
    content = re.sub(r"<(?!/?(?:b|mark)\b)[^>]+>", " ", content)
    content = unescape(content)
    content = re.sub(r"\s+", " ", content).strip()
    return content


def lob_to_string(lob_obj: Any) -> str:
    """Convert Oracle LOB object to a string (no truncation)."""
    if lob_obj is None:
        return ""
    try:
        if hasattr(lob_obj, "read"):
            content = lob_obj.read()
            if isinstance(content, bytes):
                return content.decode("utf-8", errors="ignore")
            return str(content)
        return str(lob_obj)
    except Exception as e:
        logger.error(f"Error reading LOB object: {e}")
        return "[Error reading XML content]"


def lob_to_string_limited(value: Any, max_length: int = 5000) -> Optional[str]:
    """Convert LOB (or value) to cleaned string with length limit."""
    if value is None:
        return None
    try:
        if hasattr(value, "read"):
            content = value.read()
            if isinstance(content, bytes):
                content = content.decode("utf-8", errors="ignore")
            content = clean_xml_content(content)
        else:
            content = clean_xml_content(str(value))

        if len(content) > max_length:
            return content[:max_length] + "..."
        return content
    except Exception as e:
        return f"[Error reading LOB: {str(e)}]"


# -----------------------------
# Core: Search (callable)
# -----------------------------
def search_v1(payload: Dict[str, Any]) -> Tuple[Dict[str, Any], int]:
    """
    Callable search function.
    Input payload keys (expected):
      - query: str
      - manual_sql: str
      - current_sql: str
      - chat_history: list[dict]
    Returns: (response_payload, http_status)
    """
    user_query = (payload or {}).get("query", "") or ""
    manual_sql = (payload or {}).get("manual_sql", "") or ""
    current_sql = (payload or {}).get("current_sql", "") or ""
    chat_history = (payload or {}).get("chat_history", []) or []

    logger.info(f"Search Request: {user_query}")

    con = None
    cursor = None

    generated_query = ""
    suggestions: List[Any] = []
    is_answerable = False
    refined_question = user_query
    med_answer = ""

    try:
        con = get_db_connection()
        cursor = con.cursor()

        if manual_sql:
            if not is_safe_sql(manual_sql):
                return {"error": "Unsafe SQL detected"}, 400
            generated_query = manual_sql
            med_answer = "Executing manual SQL query."
            # For manual sql, we can assume answerable is True-ish, but keep conservative:
            is_answerable = True
        else:
            used_prompt = prompt_query.replace("{{CURRENT_SQL_CONTEXT}}", current_sql)

            # Always include current user query as the last user message.
            messages: List[Dict[str, Any]] = [{"role": "system", "content": used_prompt}]
            if isinstance(chat_history, list) and chat_history:
                messages.extend(chat_history)

            messages.append({"role": "user", "content": user_query})

            process_success, llm_response = safe_llm_call(
                client,
                messages,
                max_tokens=1024,
                temperature=0.01,
            )

            if not process_success:
                return {"error": "AI processing failed"}, 500

            try:
                llm_text = llm_response or ""
                if "```json" in llm_text:
                    match = re.search(r"```json\s*(.*?)\s*```", llm_text, re.DOTALL)
                    if match:
                        llm_text = match.group(1).strip()
                elif "```" in llm_text:
                    match = re.search(r"```\s*(.*?)\s*```", llm_text, re.DOTALL)
                    if match:
                        llm_text = match.group(1).strip()

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

        cursor.execute(generated_query)
        rows = cursor.fetchall()
        column_names = [desc[0] for desc in cursor.description] if cursor.description else []
        oracle_results: List[Dict[str, Any]] = [dict(zip(column_names, row)) for row in rows]

        processed_result = convert_oracle_to_filtered_results(oracle_results)
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
        logger.error(f"Search Error: {e}")
        return {"error": str(e)}, 500
    finally:
        try:
            if cursor:
                cursor.close()
        except Exception:
            pass
        try:
            if con:
                con.close()
        except Exception:
            pass


# -----------------------------
# Core: Answer generation (stream)
# -----------------------------
def generate_answer_stream(payload: Dict[str, Any]) -> Generator[str, None, None]:
    """
    Returns a generator that yields streamed text chunks for an answer.

    payload keys:
      - results: list[dict]
      - refined_question: str
      - chat_history: list[dict]
    """
    results = (payload or {}).get("results", []) or []
    refined_question = (payload or {}).get("refined_question", "") or ""
    chat_history = (payload or {}).get("chat_history", []) or []

    con = None
    cursor = None
    try:
        con = get_db_connection()
        cursor = con.cursor()

        if not results:
            yield json.dumps({"error": "No results provided"}) + "\n"
            return

        top_content = fetch_top_results_content(results[:5], cursor)

        if not top_content:
            yield "I couldn't retrieve enough content from the top results to answer confidently.\n"
            return

        answer_prompt = f"""
You are a helpful medical assistant.
The user asked: "{refined_question}"

Here is the relevant information extracted from the top search results:
{top_content}

Please provide a concise and direct answer to the user's question based ONLY on the provided information.

**CITATION RULE:**
You MUST cite your sources. When you use information from a result, add a clickable citation at the end of the sentence.
The format MUST be: `[[Result Index]](#cite-SET_ID)`
Example: "Ozempic causes nausea [[1]](#cite-1234-5678-...)".

If the information is contradictory, mention that.
If the information is not sufficient to answer, state that.
Format the answer in Markdown.

**GUIDANCE RULE:**
At the very end of your response, always include a separate paragraph with a helpful suggestion or question to guide the user toward missing information or further search refinements.
"""

        messages: List[Dict[str, Any]] = [{"role": "system", "content": "You are a helpful medical assistant."}]
        if isinstance(chat_history, list) and chat_history:
            messages.extend(chat_history)
        messages.append({"role": "user", "content": answer_prompt})

        response = client.chat.completions.create(
            model=llm_model_name,
            messages=messages,
            max_tokens=4096,
            temperature=0.1,
            stream=True,
        )

        for chunk in response:
            if chunk.choices and chunk.choices[0].delta and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    except Exception as e:
        logger.error(f"Answer Generation Error: {e}")
        yield f"Error generating answer: {str(e)}"
    finally:
        try:
            if cursor:
                cursor.close()
        except Exception:
            pass
        try:
            if con:
                con.close()
        except Exception:
            pass


def fetch_top_results_content(top_results: List[Dict[str, Any]], cursor) -> str:
    """
    Fetches text content for the top results to enable answering.
    If LOINC_CODE exists, fetches that section's text.
    Otherwise, fetches full SPL XML (partial).
    """
    content_snippets: List[str] = []

    for i, res in enumerate(top_results):
        row = {str(k).upper(): v for k, v in (res or {}).items()}
        set_id = row.get("SET_ID")
        product = row.get("PRODUCT_NAMES")

        if not set_id:
            continue

        snippet = f"--- Result {i+1} (ID: {set_id}): {product} ---\n"

        if row.get("LOINC_CODE"):
            loinc = row["LOINC_CODE"]
            try:
                spl_id = row.get("SPL_ID")
                query = """
                    SELECT XMLSERIALIZE(CONTENT s.CONTENT_XML AS CLOB)
                    FROM druglabel.SPL_SEC s
                    WHERE s.SPL_ID = :spl_id AND s.LOINC_CODE = :loinc
                """
                cursor.execute(query, {"spl_id": spl_id, "loinc": loinc})
                lob_res = cursor.fetchone()

                if lob_res and lob_res[0]:
                    text = lob_to_string(lob_res[0])
                    snippet += f"Section ({row.get('SECTION_TITLE')}):\n{clean_xml_content(text)[:2000]}...\n"
                else:
                    snippet += "Section text not found.\n"

            except Exception as e:
                logger.error(f"Error fetching section content: {e}")
                snippet += "Error fetching section text.\n"

        else:
            try:
                query = """
                    SELECT XMLSERIALIZE(DOCUMENT l.SPL_XML AS CLOB)
                    FROM druglabel.SPL l
                    WHERE l.SET_ID = :set_id
                """
                cursor.execute(query, {"set_id": set_id})
                lob_res = cursor.fetchone()

                if lob_res and lob_res[0]:
                    text = lob_to_string(lob_res[0])
                    snippet += f"Full Label Content (partial):\n{clean_xml_content(text)[:20000]}...\n"
                else:
                    snippet += "Label XML content not found.\n"
                    snippet += f"Generic Name: {row.get('PRODUCT_NORMD_GENERIC_NAMES')}\n"
                    snippet += f"Manufacturer: {row.get('AUTHOR_ORG_NORMD_NAME')}\n"

            except Exception as e:
                logger.error(f"Error fetching full SPL content: {e}")
                snippet += "Error fetching label content.\n"

        content_snippets.append(snippet)

    return "\n".join(content_snippets)


# -----------------------------
# LLM answering with uploads (stream)
# -----------------------------
def call_llm_stream(chat_history: List[Dict[str, Any]], AI_ref: str, uploads: Optional[List[Any]] = None) -> Generator[str, None, None]:
    """
    Streams LLM response as JSON lines: {"summary_chunk": "..."}\n

    uploads: list of werkzeug FileStorage objects (or compatible),
             processed via file_util.process_uploaded_file / process_image
    """
    processed_uploads = ""
    image_contents: List[Dict[str, Any]] = []

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
                    processed_uploads += f"\n{i}. File: {file_name} (Type: {file_type})\n"
                    processed_uploads += f"Content: {image_content}\n"
                processed_uploads += "---\n"
            else:
                processed_content = process_uploaded_file(file_storage)
                processed_uploads += f"\n{i}. File: {file_name} (Type: {file_type})\n"
                processed_uploads += f"Content:\n{processed_content}\n"
                processed_uploads += "---\n"

    system_prompt = (
        prompt_answering.replace("{{AI_ref}}", AI_ref)
        .replace("{{processed_uploads}}", processed_uploads)
    )

    messages: List[Dict[str, Any]] = [{"role": "system", "content": system_prompt}]
    if isinstance(chat_history, list):
        messages.extend(chat_history)

    # Attach images to the last user message if possible
    if image_contents:
        if messages and messages[-1]["role"] == "user":
            if isinstance(messages[-1]["content"], str):
                messages[-1]["content"] = [{"type": "text", "text": messages[-1]["content"]}]
            messages[-1]["content"].extend(image_contents)
        else:
            messages.append(
                {
                    "role": "user",
                    "content": [{"type": "text", "text": "Include the uploaded images in context of our conversation."}]
                    + image_contents,
                }
            )

    response = client.chat.completions.create(
        model=llm_model_name,
        messages=messages,
        max_tokens=4096,
        temperature=0.01,
        stream=True,
    )

    for chunk in response:
        if chunk.choices and chunk.choices[0].delta and chunk.choices[0].delta.content:
            yield json.dumps({"summary_chunk": chunk.choices[0].delta.content}) + "\n"


# -----------------------------
# Metadata fetch (callable)
# -----------------------------
def get_metadata(payload: Dict[str, Any]) -> Tuple[Dict[str, Any], int]:
    """
    Callable metadata function.
    payload: {"set_ids": [{"set_id": "..."} , ...]}
    Returns: (payload, status)
    """
    requested_set_ids = (payload or {}).get("set_ids", []) or []
    if not requested_set_ids:
        return {"results": []}, 200

    con = None
    cursor = None
    try:
        con = get_db_connection()
        cursor = con.cursor()

        formatted_results = []
        for x in requested_set_ids:
            tmp_res = dict(x)
            set_id = x.get("set_id")
            if not set_id:
                formatted_results.append(tmp_res)
                continue

            query = """
                SELECT l.set_id, l.product_names, l.AUTHOR_ORG_NORMD_NAME, l.eff_time, l.APPR_NUM
                FROM druglabel.dgv_sum_rx_spl l
                WHERE l.set_id = :set_id
            """
            cursor.execute(query, {"set_id": set_id})
            result = cursor.fetchone()
            if result:
                tmp_res["EFF_TIME"] = result[3]

            formatted_results.append(tmp_res)

        return {"results": formatted_results}, 200

    except Exception as e:
        logger.error(f"Error in get_metadata: {e}")
        return {"error": str(e)}, 500
    finally:
        try:
            if cursor:
                cursor.close()
        except Exception:
            pass
        try:
            if con:
                con.close()
        except Exception:
            pass


# -----------------------------
# Result shaping
# -----------------------------
def convert_oracle_to_filtered_results(oracle_results: List[Dict[str, Any]], keywords: Optional[str] = None) -> Dict[str, Dict[str, Any]]:
    """
    Convert Oracle search results to filtered_results format.
    Handles LOB objects, cleans XML content, and extracts context snippets.
    """
    filtered_results: Dict[str, Dict[str, Any]] = defaultdict(dict)
    visited = set()

    if not oracle_results:
        return filtered_results

    def extract_setid_from_link(spl_link: Optional[str]) -> Optional[str]:
        if not spl_link:
            return None
        match = re.search(r"setid=([a-f0-9-]{36})", spl_link, re.IGNORECASE)
        return match.group(1) if match else None

    def safe_get(d: Dict[str, Any], *keys: str) -> Any:
        for key in keys:
            val = d.get(key)
            if val is not None:
                return lob_to_string_limited(val) if hasattr(val, "read") else val
        return None

    for result in oracle_results:
        result_dict = {str(k).upper(): v for k, v in (result or {}).items()}

        set_id = safe_get(result_dict, "SET_ID", "SETID", "SPL_GUID", "SPLGUID")
        if not set_id:
            set_id = extract_setid_from_link(result_dict.get("SPL_LINK"))

        if not set_id or set_id in visited:
            continue

        has_section_code = result_dict.get("LOINC_CODE") or result_dict.get("SECTION_CODE")
        if has_section_code:
            section_title = safe_get(result_dict, "SECTION_TITLE", "TITLE")
            section_content = f"Detailed Evidence in {section_title} - TBD" if section_title else "Detailed Evidence - TBD"
        else:
            section_content = "Detailed Evidence - TBD"

        filtered_results[set_id] = {
            "set_id": set_id,
            "keywords": re.sub(r";\s*", "%7c", keywords) if keywords else "",
            "section_code": safe_get(result_dict, "LOINC_CODE", "SECTION_CODE", "SEC_CODE") or "",
            "similarity_score": 0,
            "section_content": section_content,
            "PRODUCT_NAMES": safe_get(result_dict, "PRODUCT_NAMES", "PRODUCTNAMES", "PRODUCT_TITLE", "DRUG NAME (BRAND - GENERIC)"),
            "GENERIC_NAMES": safe_get(result_dict, "PRODUCT_NORMD_GENERIC_NAMES", "GENERIC_NAMES", "PRODUCT_GENERIC_NAMES"),
            "COMPANY": safe_get(result_dict, "AUTHOR_ORG_NORMD_NAME", "COMPANY", "MANUFACTURER", "AUTHOR_ORG"),
            "APPR_NUM": safe_get(result_dict, "APPR_NUM", "APPROVAL_NUM", "APPLICATION_NUM"),
            "ACT_INGR_NAMES": safe_get(result_dict, "ACT_INGR_NAMES", "ACTIVE_INGREDIENTS", "INGREDIENTS"),
            "MARKET_CATEGORIES": safe_get(result_dict, "MARKET_CATEGORIES", "MARKETING_CATEGORIES", "APPLICATION_TYPE"),
            "DOCUMENT_TYPE": safe_get(result_dict, "DOCUMENT_TYPE", "DOC_TYPE", "LABEL_TYPE"),
            "Routes": safe_get(result_dict, "ROUTES_OF_ADMINISTRATION", "ROUTES", "ROUTE"),
            "DOSAGE_FORMS": safe_get(result_dict, "DOSAGE_FORMS", "DOSAGEFORMS", "FORMULATION"),
            "EPC": safe_get(result_dict, "EPC", "PHARMACOLOGIC_CLASS", "PHARM_CLASS"),
            "NDC_CODES": safe_get(result_dict, "NDC_CODES", "NDC", "PRODUCT_NDC"),
            "SPL_ID": safe_get(result_dict, "SPL_ID", "SPLID"),
            "REVISED_DATE": safe_get(result_dict, "REVISED_DATE", "REVISION_DATE"),
            "INITIAL_APPROVAL_YEAR": safe_get(result_dict, "INITIAL_APPROVAL_YEAR", "APPROVAL_YEAR"),
            "SPL_LINK": result_dict.get("SPL_LINK"),
            "SECTION_TITLE": safe_get(result_dict, "SECTION_TITLE", "TITLE"),
        }

        visited.add(set_id)

    return filtered_results

