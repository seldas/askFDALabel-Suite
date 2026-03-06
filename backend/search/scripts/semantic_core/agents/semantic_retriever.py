# scripts/semantic_core/agents/semantic_retriever.py
import os
import psycopg2
from dashboard.services.ai_handler import call_embedding

def run_semantic_retriever(state):
    """
    High-recall semantic retrieval using pgvector:
      - Generates embedding for the query.
      - Fetches top_k candidate chunks from label_embeddings table.
    """
    state.agent_flow.append("semantic_retriever")

    query = state.conversation.get("user_query", "").strip()
    top_k = state.config.get("top_k", 50)
    
    if not query:
        state.flags["next_step"] = "reranker"
        return

    # 1. Generate Query Embedding
    query_emb = call_embedding(query, user=state.user)
    if not query_emb:
        state.trace_log.append("SemanticRetriever: Failed to generate query embedding.")
        state.flags["next_step"] = "reranker"
        return

    # 2. Database Vector Search
    database_url = os.getenv("DATABASE_URL")
    candidates = []
    
    try:
        conn = psycopg2.connect(database_url)
        cursor = conn.cursor()
        
        # Use cosine distance (<=>) for the vector search
        # We join with sum_spl to get brand names (product_names)
        search_sql = """
            SELECT 
                e.id, 
                s.product_names as drug_name, 
                e.section_title as section, 
                e.chunk_text as text, 
                1 - (e.embedding <=> %s::vector) as score,
                e.set_id,
                e.spl_id
            FROM label_embeddings e
            JOIN labeling.sum_spl s ON e.set_id = s.set_id
            ORDER BY e.embedding <=> %s::vector
            LIMIT %s
        """
        
        cursor.execute(search_sql, (query_emb, query_emb, top_k))
        rows = cursor.fetchall()
        
        for row in rows:
            candidates.append({
                "id": str(row[0]),
                "drug_name": row[1],
                "section": row[2],
                "text": row[3],
                "score": float(row[4]),
                "source": {
                    "set_id": row[5],
                    "spl_id": row[6]
                }
            })
        
        conn.close()
        state.trace_log.append(f"SemanticRetriever: Found {len(candidates)} candidates.")
        
    except Exception as e:
        state.trace_log.append(f"SemanticRetriever: DB error: {str(e)}")
        if 'conn' in locals(): conn.close()

    state.retrieval["plan"]["semantic_query"] = query
    state.retrieval["plan"]["semantic_top_k"] = top_k
    state.retrieval["results"] = candidates

    state.flags["next_step"] = "reranker"
