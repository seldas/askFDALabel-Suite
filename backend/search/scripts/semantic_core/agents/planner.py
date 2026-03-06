# scripts/semantic_core/agents/planner.py
import json
import re
from dashboard.services.ai_handler import call_llm

PLANNER_INTENT_PROMPT = """
You are a Search Intent Classifier and Query Resolver for an FDA Drug Labeling system.
Analyze the user's latest query and the conversation history to determine the best action.

**User's Current Mode:** {search_mode} (semantic or study)

**Your Tasks:**
1. **Classify Intent**: Categorize the query (IDENTIFIER, ENTITY_LOOKUP, CLINICAL_QA, STUDY_ANALYSIS, CLARIFICATION, OUT_OF_SCOPE).
   - "STUDY_ANALYSIS": Query asks for counts, trends, or comparative population data (e.g., "How many drugs for X?", "Compare warning counts for Y").
2. **Resolve Query**: If the latest query is a follow-up, REWRITE it into a standalone complete search query.

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
    Smart Intent Routing & Query Resolution.
    """
    state.agent_flow.append("planner")
    raw_query = state.conversation.get("user_query", "").strip()
    history = state.conversation.get("history", [])
    search_mode = state.config.get("search_mode", "semantic")

    if not raw_query:
        state.flags["terminate"] = True
        return

    try:
        response = call_llm(
            user=state.user,
            system_prompt=PLANNER_INTENT_PROMPT.format(
                query=raw_query, 
                history=history,
                search_mode=search_mode
            ),
            user_message="Analyze and resolve the query.",
            temperature=0.0
        )
        
        match = re.search(r"\{.*\}", response, re.DOTALL)
        intent_data = json.loads(match.group(0)) if match else {"intent": "CLINICAL_QA", "resolved_query": raw_query}
        
        state.intent = intent_data
        intent_type = intent_data.get("intent", "CLINICAL_QA")
        resolved_query = intent_data.get("resolved_query", raw_query)
        state.conversation["user_query"] = resolved_query
        
        state.trace_log.append(f"Planner: Classified intent as {intent_type} in {search_mode} mode.")

        # 2. Dynamic Routing Logic
        if intent_type == "OUT_OF_SCOPE":
            state.flags["next_step"] = "answer_composer"
            
        elif intent_type == "CLARIFICATION":
            state.flags["next_step"] = "answer_composer"

        elif intent_type in ["IDENTIFIER", "ENTITY_LOOKUP"] and search_mode == "semantic":
            state.flags["next_step"] = "keyword_retriever"
            
        elif intent_type == "STUDY_ANALYSIS" or search_mode == "study":
            # For now, study mode also uses semantic but we flag it for the answer composer
            # to provide aggregate data if possible. 
            state.flags["next_step"] = "semantic_retriever"
            state.retrieval["plan"] = {
                "pipeline": ["semantic_retriever", "reranker", "postprocess", "answer_composer"],
                "is_study": True
            }
        else:
            state.flags["next_step"] = "semantic_retriever"
            state.retrieval["plan"] = {
                "pipeline": ["semantic_retriever", "reranker", "postprocess", "evidence_fetcher", "answer_composer"],
                "top_k": state.config.get("top_k", 50)
            }

    except Exception as e:
        state.trace_log.append(f"Planner error: {str(e)}. Defaulting to semantic path.")
        state.flags["next_step"] = "semantic_retriever"
        state.intent = {"intent": "CLINICAL_QA"}
