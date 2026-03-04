# scripts/search_v3_core/agents/postprocess.py
def run_postprocess(state):
    """
    Normalize output for frontend compatibility:
      - dedupe
      - enforce min_score
      - ensure required fields exist
    """
    state.agent_flow.append("postprocess")

    min_score = state.config["min_score"]
    results = state.retrieval.get("results", [])

    filtered = []
    seen = set()
    for r in results:
        rid = r.get("id") or (r.get("source", {}) or {}).get("doc_id")
        if rid and rid in seen:
            continue
        if rid:
            seen.add(rid)

        score = float(r.get("score", 0.0) or 0.0)
        if score < min_score:
            continue

        filtered.append(r)

    state.retrieval["results"] = filtered
    state.flags["next_step"] = "evidence_fetcher"