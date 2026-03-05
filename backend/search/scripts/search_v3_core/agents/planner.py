# scripts/search_v3_core/agents/planner.py
import json
import re
from dashboard.services.ai_handler import call_llm

PLANNER_INTENT_PROMPT = """
You are a Search Intent Classifier and Query Resolver for an FDA Drug Labeling system.
Analyze the user's latest query and the conversation history to determine the best action.

**Your Tasks:**
1. **Classify Intent**: Categorize the query (IDENTIFIER, ENTITY_LOOKUP, CLINICAL_QA, CLARIFICATION, OUT_OF_SCOPE).
2. **Resolve Query**: If the latest query is a follow-up or contains pronouns (it, they, that drug) or is a direct answer to a previous clarification, REWRITE it into a standalone, complete search query using the history. If it is a fresh query, keep it as is.

Categories:
- "IDENTIFIER": Specific ID lookup (Set-ID, NDC, NDA/ANDA).
- "ENTITY_LOOKUP": Simple drug name lookup.
- "CLINICAL_QA": Medical question requiring retrieval.
- "CLARIFICATION": Query is too vague (e.g., "What's the dose?" without a drug).
- "OUT_OF_SCOPE": Unrelated to FDA/Drugs.

User Query: {query}
Conversation History: {history}

Return ONLY a raw JSON object:
{{
  "intent": "CATEGORY",
  "resolved_query": "The standalone version of the query",
  "entities": ["drug names", "ids"],
  "clarification_question": "Question to ask if intent is CLARIFICATION",
  "is_continuation": true/false
}}
"""

def run_planner(state):
    """
    Smart Intent Routing & Query Resolution:
      - Merges history with latest query to create a standalone search term.
      - Routes to the appropriate retrieval path.
    """
    state.agent_flow.append("planner")
    raw_query = state.conversation.get("user_query", "").strip()
    history = state.conversation.get("history", [])

    if not raw_query:
        state.flags["terminate"] = True
        return

    try:
        response = call_llm(
            user=state.user,
            system_prompt=PLANNER_INTENT_PROMPT.format(query=raw_query, history=history),
            user_message="Analyze and resolve the query.",
            temperature=0.0
        )
        
        match = re.search(r"\{.*\}", response, re.DOTALL)
        intent_data = json.loads(match.group(0)) if match else {"intent": "CLINICAL_QA", "resolved_query": raw_query}
        
        state.intent = intent_data
        intent_type = intent_data.get("intent", "CLINICAL_QA")
        
        # UPDATE THE STATE WITH THE RESOLVED QUERY
        # This ensures SemanticRetriever and KeywordRetriever use the full context
        resolved_query = intent_data.get("resolved_query", raw_query)
        state.conversation["user_query"] = resolved_query
        
        if intent_data.get("is_continuation"):
            state.trace_log.append(f"Planner: Resolved follow-up context. New query: '{resolved_query}'")
        else:
            state.trace_log.append(f"Planner: Classified intent as {intent_type}.")

        # 2. Dynamic Routing Logic
        if intent_type == "OUT_OF_SCOPE":
            state.flags["next_step"] = "answer_composer"
            state.retrieval["plan"] = {"pipeline": ["answer_composer"]}
            
        elif intent_type == "CLARIFICATION":
            state.flags["next_step"] = "answer_composer"
            state.retrieval["plan"] = {"pipeline": ["answer_composer"]}

        elif intent_type in ["IDENTIFIER", "ENTITY_LOOKUP"]:
            state.flags["next_step"] = "keyword_retriever"
            state.retrieval["plan"] = {"pipeline": ["keyword_retriever", "answer_composer"]}
            
        else:
            state.flags["next_step"] = "semantic_retriever"
            state.retrieval["plan"] = {
                "pipeline": ["semantic_retriever", "reranker", "postprocess", "evidence_fetcher", "answer_composer"],
                "top_k": state.config.get("top_k", 50),
                "rerank_k": state.config.get("rerank_k", 10)
            }

    except Exception as e:
        state.trace_log.append(f"Planner error: {str(e)}. Defaulting to semantic path.")
        state.flags["next_step"] = "semantic_retriever"
        state.intent = {"intent": "CLINICAL_QA"}