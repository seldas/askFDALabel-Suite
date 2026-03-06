# scripts/semantic_core/agents/reasoning_generator.py
def run_reasoning_generator(state):
    """
    Optional: produce a short explanation of why selected passages were used.
    Keep it lightweight for compliance; avoid chain-of-thought.
    """
    state.agent_flow.append("reasoning_generator")

    results = state.retrieval.get("results", [])
    state.reasoning = f"Selected {len(results)} label passages via semantic retrieval + reranking for grounded QA."
    state.flags["next_step"] = "end"
