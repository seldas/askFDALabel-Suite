````md
# search_v2 Flow (Controller + State Machine)

## High-level execution path

```mermaid
%%{init: {"themeVariables": {"fontSize": "28px"}, "flowchart": {"nodeSpacing": 300, "rankSpacing": 10}} }%%
flowchart TD
  A["search_v2 payload"] --> B["AgentState init<br/>init state + flags.next_step = planner"]
  B --> C{"run_controller loop<br/>max_steps = 10<br/>current_step = flags.next_step"}

  %% Planner
  C -->|planner| P["Planner Agent<br/>- LLM (PLANNER_PROMPT)<br/>- normalize JSON<br/>- apply_plan_overrides()<br/>- set next_step"]
  P --> D{"intent.type?"}

  D -->|chitchat| AC["Answer Composer"]
  D -->|clarification| AC
  D -->|aggregate| AG["Aggregate Executor"]
  D -->|search / qa / list_sections / compare| DB["DB Executor"]
  D -->|other| AC

  %% DB Executor -> Postprocess
  DB --> PP["Postprocess Agent<br/>- decide fallback/evidence<br/>- set next_step"]
  DB -->|SQL error stored in state.retrieval.error| PP

  %% Postprocess decisions
  PP --> E{"results empty?"}

  E -->|YES| F{"Ingredient fallback allowed?<br/>- has search_terms<br/>- used name template<br/>- user NOT explicitly ingredient<br/>- ingredient_tried = false"}
  F -->|YES| DB2["DB Executor (fallback)<br/>- swap template to ingredient<br/>- set plan.substance_name"]
  DB2 --> PP
  F -->|NO| AC

  E -->|NO| G{"aggregate plan?"}
  G -->|YES| AC
  G -->|NO| H{"needs evidence?<br/>- plan.needs_evidence<br/>OR<br/>- detect_content_need topics<br/>  (AE / indication / interactions / etc.)"}

  H -->|YES| EV["Evidence Fetcher<br/>- fetch SPL_SEC content<br/>- by plan.section_loinc_codes<br/>  OR row.LOINC_CODE<br/>- save evidence.snippets"]
  EV --> AC
  H -->|NO| AC

  %% Aggregate Executor
  AG --> AC

  %% Answer + Reasoning
  AC --> RG["Reasoning Generator<br/>- LLM (REASONING_PROMPT)<br/>- flags.terminate = true"]
  RG --> Z["Return response"]

  %% Error path
  C -->|error| ERR["Error step<br/>- response_text = internal error occurred<br/>- terminate = true"]
  ERR --> Z
```

# “What writes what” (quick mental model)

## Planner (`run_planner`)

**Reads**

* `conversation.user_query`
* `conversation.history`

**Writes**

* `state.intent`
* `state.retrieval.plan`
* `flags.next_step` → `db_executor` / `aggregate_executor` / `answer_composer` / `error`

**Calls**

* `apply_plan_overrides()` *(deterministic)*

---

## DB Executor (`run_db_executor`)

**Reads**

* `state.retrieval.plan`
* `state.intent.slots`

**Writes**

* `state.retrieval.generated_sql`
* `state.retrieval.results` **or** `state.retrieval.error`
* `flags.next_step = postprocess`

---

## Postprocess (`run_postprocess`)

**Reads**

* `state.retrieval.results`
* `state.retrieval.plan`
* `conversation.user_query`

**Writes**

* may modify `state.retrieval.plan`

  * upgrade to `section_content`
  * set `section_loinc_codes`
* may set fallback flags in `state.retrieval.fallback`

**Sets `flags.next_step`**

* `db_executor` *(fallback loop)*
* `evidence_fetcher`
* `answer_composer`

---

## Evidence Fetcher (`run_evidence_fetcher`)

**Reads**

* `state.retrieval.results`
* `state.retrieval.plan.section_loinc_codes`

**Writes**

* `state.evidence.snippets`
* `flags.next_step = answer_composer`

---

## Aggregate Executor (`run_aggregate_executor`)

**Reads**

* `state.retrieval.plan` *(content_query, filters, etc.)*

**Writes**

* `state.retrieval.aggregate`
* `flags.next_step = answer_composer`

---

## Answer Composer (`run_answer_composer`)

**Reads**

* results / snippets / aggregate + `intent.type`

**Writes**

* `state.answer.response_text`
* `flags.next_step = reasoning_generator`

---

## Reasoning Generator (`run_reasoning_generator`)

**Reads**

* `state.trace_log`

**Writes**

* `state.reasoning`
* `flags.terminate = True`
