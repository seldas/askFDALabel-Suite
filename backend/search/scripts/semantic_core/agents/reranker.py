# scripts/semantic_core/agents/reranker.py
import json
from dashboard.services.ai_handler import call_llm

RERANKER_PROMPT = """
You are a precision reranking agent for FDA drug labeling search.
Your task is to evaluate the relevance of provided label excerpts to a user query.

User Query: {query}

For each excerpt below, provide a relevance score from 0 to 10 (10 being most relevant).
Return ONLY a JSON list of scores in the same order as the excerpts.
Format: [score1, score2, ...]
"""

def run_reranker(state):
    """
    Precision step:
      - Take candidates from semantic retrieval and re-rank them using an LLM.
    """
    state.agent_flow.append("reranker")

    candidates = state.retrieval.get("results", [])
    if not candidates:
        state.flags["next_step"] = "postprocess"
        return

    query = state.conversation.get("user_query", "")
    rerank_k = state.config.get("rerank_k", 10)

    # To save tokens and time, we only rerank the top 20 from semantic search
    to_rerank = candidates[:20]
    
    excerpts_text = ""
    for i, c in enumerate(to_rerank):
        excerpts_text += f"Excerpt {i}:\nDrug: {c['drug_name']}\nSection: {c['section']}\nText: {c['text'][:300]}...\n\n"

    system_prompt = RERANKER_PROMPT.format(query=query)
    
    try:
        response = call_llm(
            user=state.user,
            system_prompt=system_prompt,
            user_message=f"Evaluate these excerpts:\n\n{excerpts_text}",
            temperature=0.1
        )
        
        # Parse the JSON response
        import re
        match = re.search(r"\[.*\]", response, re.DOTALL)
        if match:
            scores = json.loads(match.group(0))
            # Attach scores to candidates
            for i, score in enumerate(scores):
                if i < len(to_rerank):
                    # Combine semantic score and LLM score
                    to_rerank[i]["score"] = (to_rerank[i]["score"] * 0.3) + (float(score)/10.0 * 0.7)
        
        # Sort by new score
        to_rerank.sort(key=lambda x: x["score"], reverse=True)
        reranked = to_rerank[:rerank_k]
        
        state.trace_log.append(f"Reranker: Re-scored top {len(to_rerank)} and kept top {len(reranked)}.")
        state.retrieval["results"] = reranked

    except Exception as e:
        state.trace_log.append(f"Reranker error: {str(e)}")
        # Fallback: just truncate
        state.retrieval["results"] = candidates[:rerank_k]

    state.retrieval["plan"]["semantic_rerank_k"] = rerank_k
    state.flags["next_step"] = "postprocess"
