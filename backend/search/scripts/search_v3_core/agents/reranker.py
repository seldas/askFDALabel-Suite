# scripts/search_v3_core/agents/reranker.py
def run_reranker(state):
    """
    Precision step:
      - Take candidates from semantic retrieval and re-rank them using your SOTA GenAI model.
      - This keeps your 'AI advantage' where it matters: selecting evidence.

    Output: replace or annotate state.retrieval["results"] with reranked list.
    """
    state.agent_flow.append("reranker")

    candidates = state.retrieval.get("results", [])
    rerank_k = state.config["rerank_k"]

    # TODO: implement LLM reranking. Common approach:
    # - Provide query + (title/section/text snippet) for each candidate
    # - Ask model to score relevance / select top rerank_k
    # Placeholder: keep as-is, truncate.
    reranked = candidates[:rerank_k]

    state.retrieval["plan"]["v3_rerank_k"] = rerank_k
    state.retrieval["results"] = reranked

    state.flags["next_step"] = "postprocess"