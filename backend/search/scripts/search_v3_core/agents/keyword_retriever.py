# scripts/search_v3_core/agents/keyword_retriever.py
import os
import psycopg2

def run_keyword_retriever(state):
    """
    Fast Path Retrieval:
      - Uses standard SQL to find labels by Set-ID, NDC, or Drug Name.
    """
    state.agent_flow.append("keyword_retriever")

    query = state.conversation.get("user_query", "").strip()
    intent_type = state.intent.get("intent")
    
    database_url = os.getenv("DATABASE_URL")
    candidates = []

    try:
        conn = psycopg2.connect(database_url)
        cursor = conn.cursor()

        # Handle different lookup types
        if intent_type == "IDENTIFIER":
            # Direct ID lookup (Set-ID, NDC, etc.)
            sql = """
                SELECT set_id, spl_id, product_names 
                FROM labeling.sum_spl 
                WHERE set_id = %s OR ndc_codes LIKE %s OR appr_num LIKE %s
                LIMIT 5
            """
            # Fuzzy match for NDC or AppNum, Exact for SetID
            cursor.execute(sql, (query, f"%{query}%", f"%{query}%"))
        else:
            # ENTITY_LOOKUP: Fuzzy name search
            sql = """
                SELECT set_id, spl_id, product_names 
                FROM labeling.sum_spl 
                WHERE product_names ILIKE %s OR generic_names ILIKE %s
                ORDER BY is_rld DESC
                LIMIT 10
            """
            cursor.execute(sql, (f"%{query}%", f"%{query}%"))
            
        rows = cursor.fetchall()
        for row in rows:
            candidates.append({
                "id": row[0],
                "drug_name": row[2],
                "section": "Label Metadata",
                "text": f"Found label for {row[2]}. SetID: {row[0]}. SPL_ID: {row[1]}.",
                "score": 1.0, # Exact/Match score
                "source": {"set_id": row[0], "spl_id": row[1]}
            })

        conn.close()
        state.trace_log.append(f"KeywordRetriever: Found {len(candidates)} direct matches.")
        
    except Exception as e:
        state.trace_log.append(f"KeywordRetriever error: {str(e)}")
        if 'conn' in locals(): conn.close()

    state.retrieval["results"] = candidates
    state.flags["next_step"] = "answer_composer"
