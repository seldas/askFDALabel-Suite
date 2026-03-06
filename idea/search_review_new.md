# 🔍 askFDALabel-Suite: Semantic Search Strategy Review

This document provides a comprehensive map of the current search strategy logic following the 2026 re-architecture (formerly V3).

## 🏗️ Architectural Pattern: Multi-Agent Orchestration
The system uses a **Controller-Agent** pattern. A central controller manages a state machine (`AgentState`) that transitions through specialized worker agents based on intent and data requirements.

---

## 🚦 Phase 1: Planning & Intent Resolution
**Agent:** `planner.py`
- **Context Awareness**: Uses LLM to analyze the current query + conversation history.
- **Query Resolution**: If the user uses pronouns ("its dose", "that drug"), the planner rewrites the query into a standalone search term.
- **Intent Classification**:
    - `IDENTIFIER`: Routes to Fast-Path (Keyword) for Set-ID, NDC, or NDA lookups.
    - `ENTITY_LOOKUP`: Routes to Fast-Path (Keyword) for specific drug name matching.
    - `CLINICAL_QA`: Routes to Semantic-Path (pgvector) for complex medical questions.
    - `OUT_OF_SCOPE / CLARIFICATION`: Routes directly to Answer Composer.

---

## 🏎️ Phase 2A: Fast-Path Retrieval (Keyword)
**Agent:** `keyword_retriever.py`
- **Mechanism**: Standard SQL execution on `labeling.sum_spl`.
- **Logic**:
    - **Identifiers**: Exact match on `set_id`, partial match on `ndc_codes` or `appr_num`.
    - **Entities**: `ILIKE` substring match on `product_names` or `generic_names`.
- **Transition**: Skips reranking and moves directly to `answer_composer` for speed.

---

## 🧠 Phase 2B: Semantic-Path Retrieval (Vector)
**Agent:** `semantic_retriever.py`
- **Mechanism**: `pgvector` Cosine Similarity search.
- **Process**:
    1.  Generates embedding for the *Resolved Query*.
    2.  Executes vector search against `label_embeddings` table.
    3.  Joins with `labeling.sum_spl` to attach drug metadata (Brand Name).
- **Default**: Top 50 candidate chunks retrieved.

---

## 🎯 Phase 3: Precision & Filtering
**Agent:** `reranker.py`
- **Logic**: Take the top 20 semantic results and use a "Cheap" LLM call to score relevance (0-10) against the original question.
- **Scoring**: Weighted average (30% Vector Score + 70% LLM Relevance Score).
- **Result**: Truncates to the top `rerank_k` (default 10) high-confidence passages.

**Agent:** `postprocess.py`
- **Logic**: Dedupes results by text content and enforces a `min_score` threshold.

---

## 📖 Phase 4: Evidence & Synthesis
**Agent:** `evidence_fetcher.py`
- **Logic**: Formats the selected chunks into structured snippets (Drug Name | Section | Text) for the LLM prompt.

**Agent:** `answer_composer.py`
- **Mechanism**: Grounded Generation.
- **Rule**: Instructs the LLM to only answer using provided snippets. If the answer isn't there, it must state "I don't know based on the provided labels."
- **Output**: Markdown with citations linking back to result items.

---

## 🛠️ Performance & Scalability Design
1.  **pgvector GIN/IVFFlat Indexing**: Ensures vector searches remain sub-100ms even with 1M+ chunks.
2.  **Tri-state Connectivity**: `FDALabelDBService` handles Oracle vs. Postgres fallbacks automatically.
3.  **Streaming**: The `search_agentic_stream` route in `blueprint.py` allows the UI to show agent progress (Planning -> Searching -> Composing) in real-time.

---

## 📝 Planned Improvements (Pending)
- **Study Mode**: Re-implementing aggregate counts and trend analysis via specialized SQL templates.
- **Hybrid Search**: Combining Keyword + Semantic scores at the database level using Reciprocal Rank Fusion (RRF).
