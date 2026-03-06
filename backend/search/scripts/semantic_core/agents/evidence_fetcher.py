# scripts/search_v3_core/agents/evidence_fetcher.py
def run_evidence_fetcher(state):
    """
    Extract snippets for grounded answering.
    In v2 you fetch additional evidence; in v3 you likely already have text chunks.
    """
    state.agent_flow.append("evidence_fetcher")

    snippets = []
    for r in state.retrieval.get("results", []):
        text = r.get("text", "") or ""
        if text:
            snippets.append(
                {
                    "id": r.get("id", ""),
                    "section": r.get("section", ""),
                    "drug_name": r.get("drug_name", ""),
                    "snippet": text[:1200],  # keep bounded
                    "score": r.get("score", None),
                    "source": r.get("source", {}),
                }
            )

    state.evidence["snippets"] = snippets
    state.flags["next_step"] = "answer_composer"