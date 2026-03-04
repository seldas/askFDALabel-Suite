# scripts/search_v3_core/agents/planner.py
def run_planner(state):
    state.agent_flow.append("planner")
    q = state.conversation.get("user_query", "").strip()

    # Minimal intent scaffold (extend as needed)
    state.intent = {
        "task": "label_grounded_qa",
        "query": q,
    }

    state.retrieval["plan"] = {
        "pipeline": ["semantic_retriever", "reranker", "postprocess", "evidence_fetcher", "answer_composer", "reasoning_generator"],
        "top_k": state.config["top_k"],
        "rerank_k": state.config["rerank_k"],
        "min_score": state.config["min_score"],
    }

    state.flags["next_step"] = "semantic_retriever"