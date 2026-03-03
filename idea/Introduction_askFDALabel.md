# Technical Report: askFDALabel-Suite
## A Unified AI-Augmented Regulatory Intelligence Platform

**Date:** March 2, 2026  
**Status:** Technical Manuscript / System Introduction  
**Core Technologies:** Python (Flask), Next.js (React/TypeScript), SQLite/Oracle, LLM (Gemini/Llama/Elsa)

---

## 1. Introduction

### 1.1 The Critical Need for Drug Labeling Analysis
Drug labeling serves as the authoritative source of truth for the safe and effective use of pharmaceutical products. For regulatory scientists, clinicians, and pharmacovigilance experts, the ability to rapidly analyze, cross-reference, and monitor these labels is a foundational requirement. The complexity of this task has grown exponentially as the volume of approved products increases, and as labeling itself becomes more data-dense—encompassing detailed pharmacogenomics, complex dosing regimens, and evolving safety profiles. Efficient labeling analysis is essential for identifying class-wide safety signals, ensuring manufacturer consistency, and informing public health decisions.

### 1.2 Traditional Approaches and Their Limitations
Historically, labeling analysis has relied on established platforms such as **DailyMed** (NIH) for public access and the **FDALabel** database for more structured, multi-parameter searching of Structured Product Labeling (SPL) data. While these tools are indispensable for retrieving individual labels or performing targeted keyword searches, they often fall short during complex, comparative, or high-volume reviews. Traditional workflows require significant manual labor to synthesize information across hundreds of labels, track historical changes, or map adverse event data to specific labeling sections. This manual synthesis is not only time-intensive but also susceptible to human error in data extraction and interpretation.

### 1.3 AI as a Catalyst for Regulatory Intelligence
The emergence of Large Language Models (LLMs) and agentic AI architectures presents a transformative opportunity for regulatory science. Beyond simple keyword matching, AI can now perform "semantic reasoning"—understanding the clinical context of a query, identifying nuances in warning language, and automating the extraction of structured data from unstructured text. AI-augmented systems can process thousands of documents in seconds, cross-reference them with external safety databases like FAERS, and provide evidence-based summaries with precise citations. This shift from "search-and-read" to "query-and-synthesize" promises to significantly enhance the agility and depth of regulatory reviews.

### 1.4 The askFDALabel-Suite: A Unified Solution
In response to these challenges and opportunities, we developed the **askFDALabel-Suite**. This integrated platform bridges high-fidelity SPL data with state-of-the-art LLM orchestration to provide a comprehensive regulatory intelligence environment. The suite consolidates disparate tasks—such as safety signal detection, toxicity monitoring (askDrugTox), genomic biomarker analysis (PGx Agent), and structural label comparison (LabelComp)—into a single, project-based dashboard. By employing an "agentic" architecture, the suite moves beyond traditional retrieval, providing clinicians and scientists with a powerful assistant capable of performing complex reasoning and delivering actionable regulatory insights.

---

## 2. System Overview & Modular Architecture
The suite is built on a modular, decoupled architecture consisting of a unified Flask backend and a modern Next.js 15 frontend. This separation allows for high-performance data processing on the server while maintaining a responsive, real-time user interface.

### 2.1 Core Infrastructure
- **Unified App Entry:** The system integrates multiple specialized modules (Blueprints) into a single API surface, handling everything from authentication to background task orchestration.
- **Database Layer:** Supports both local SQLite for rapid prototyping and persistent project storage, and internal FDA Oracle databases for high-fidelity production data.

### 2.2 Trivial but Critical Functions
- **LocalQuery:** A high-speed interface for searching local SPL metadata. It allows users to query by Brand Name, Generic Name, SetID, or Application Number and export results directly into Excel formats compatible with the primary Dashboard.
- **WebTest:** A specialized diagnostic tool for validating FDALabel UI and API endpoints across DEV, TEST, and PROD environments. It features automated template-based probing, response time tracking, and historical trend analysis to ensure system reliability.

---

## 3. AI Assistant (AFL Agent)

### 3.1 The Evolution from v1 to v2
The development of the AI Assistant followed an iterative path, driven by the increasing complexity of regulatory queries.

- **v1 (Single-Pass Metadata Search):** The initial version was designed for rapid metadata retrieval. It employed a "Text-to-SQL" approach where a single LLM call generated a SQL query based on the user's input, executed it against the database, and summarized the results. While effective for simple "find me this drug" questions, v1 was limited to metadata only (Brand, Generic, Manufacturer) and lacked the ability to reason about label content or handle search failures gracefully.
- **v2 (Multi-Step Agentic Reasoning):** To overcome these limitations, we transitioned to the **AFL (AskFDALabel) Agent v2**. This version introduces a state-machine-driven "agentic" architecture that breaks the analysis into distinct, specialized phases. It can navigate between metadata and full-label content, perform comparative analysis, and execute sophisticated "fallback" loops when initial retrieval fails.

### 3.2 The v2 AFL Agent Logic: Step-by-Step
The v2 agent operates through a centralized **Controller** that manages a state object across multiple specialized sub-agents:

1. **The Planner Agent:**
   - **Intent Classification:** Analyzes the user query and chat history to classify the intent (e.g., `search`, `qa`, `compare`, `aggregate`).
   - **Heuristic Overrides:** Automatically detects identifiers like SetIDs, NDC codes, or UUIDs in the query to bypass LLM planning and use high-precision deterministic templates.
   - **Plan Generation:** Determines the `plan_type` (Metadata vs. Content) and selects the appropriate `sql_template_hint`.

2. **The DB Executor (Dialect-Aware):**
   - **Dialect Detection:** Dynamically detects whether the backend is connected to **Oracle** or **SQLite** and selects the correct SQL dialect.
   - **Template Resolution:** Uses the planner's hint to fetch a pre-optimized SQL template and binds parameters (e.g., search terms, filters, limits) to prevent SQL injection.
   - **Execution:** Retrieves raw data, including metadata or section-level pointers.

3. **The Postprocess Agent (The Brain of the Loop):**
   - **Ingredient Fallback Logic:** If a "Brand Name" search returns zero results, the Postprocess agent identifies this failure and automatically triggers a fallback loop. It re-plans the search using "Active Ingredient" templates, allowing the system to find generic alternatives when a specific brand is not in the local database.
   - **Plan Upgrading:** Analyzes the query to see if it requires clinical details (e.g., "What are the side effects?"). If detected, it "upgrades" the plan from metadata-only to `section_content` and forces an evidence-fetch step.

4. **The Evidence Fetcher:**
   - **Content Retrieval:** If the plan requires evidence, this agent fetches the full XML sections (based on LOINC codes) for the top retrieved results.
   - **Snippet Extraction:** It extracts relevant text snippets to provide the LLM with the raw evidence needed for a factual answer.

### 3.3 Current Bottlenecks and Future Limitations
Despite the significant advancements in v2, the AFL Agent still faces several architectural and operational bottlenecks that define the current frontier of the system's development:

1. **Absence of Native Semantic Search:**
   The current retrieval loop relies exclusively on structured SQL queries (metadata) and keyword-in-context (KWIC) searches for label sections. We have deliberately omitted a vector-based semantic search (embeddings) in the primary loop due to several factors:
   - **Precision Requirements:** Regulatory queries often require exact identifier matches (NDC, SetID) where semantic "similarity" can introduce hallucinations or irrelevant results.
   - **Infrastructure Constraints:** The internal Oracle and SQLite environments are currently optimized for relational performance rather than vector-store operations.
   - **Clinical Specificity:** Standard embedding models often struggle with the dense, specialized vocabulary of SPL XML, necessitating a custom-trained clinical embedding layer before semantic search can be safely integrated into the decision loop.

2. **The Planner as a "Fake Hub":**
   While the Planner agent successfully orchestrates the state machine, it currently functions as a relatively "shallow" hub. Its decision-making is heavily augmented by hard-coded heuristics and deterministic regex overrides (as seen in `heuristics.py`).
   - **Limited Tool Reasoning:** The planner does not yet possess the "true" agency required to dynamically discover and chain new tools; it instead selects from a pre-defined library of templates.
   - **Heuristic Reliance:** The system's robustness is currently tied to the manual maintenance of these heuristics. A more sophisticated planner would move toward a "ReAct" (Reasoning + Acting) pattern that can iteratively refine its search strategy based on partial results without relying on fixed overrides.

3. **Fixed LOINC Mapping and Topic Coverage:**
   The agent's ability to "understand" label sections is constrained by a fixed mapping of clinical topics to LOINC codes.
   - **Mapping Drift:** As new SPL sections are introduced or LOINC standards evolve, the static mapping in the codebase requires manual updates.
   - **Multi-Turn Reasoning Constraints:** While the agent tracks history, its ability to perform deep, multi-turn reasoning (e.g., "Now compare the side effects I just found with those of Drug Y") is still nascent. Complex comparative logic often requires a fresh "Compare" intent rather than a fluid continuation of a search session.
   - **Context Window Management:** For particularly large labels (some exceeding 500kb of XML), the current strategy of fetching "snippets" can sometimes miss context that is only apparent when viewing the label's full structural hierarchy.


---

## 4. Dashboard - Project Management
The Dashboard serves as the primary workspace for regulatory reviews, organized around the concept of **Projects**. These projects act as persistent, collaborative containers that allow users to manage related labelings and perform aggregate clinical analysis.

### 4.1 Project Overview and Workspace Management
The Project Overview function provides the structural framework for organizing regulatory tasks:
- **Project Containers:** Users can create up to 100 specialized projects (e.g., "SGLT2 Inhibitors Review" or "2026 Labeling Updates"). Each project maintains its own isolated set of labels, comparisons, and annotations, allowing for focused analysis of specific therapeutic classes or safety signals.
- **FDALabel Integration & Batch Importing:** The suite is designed to be fully compatible with FDALabel workflows. We acknowledge that the **FDALabel** database's native search function remains the current "gold standard" for fetching accurate, high-precision labeling results, particularly when a user has a clearly defined set of criteria (e.g., specific market categories, complex therapeutic classes, or regulatory statuses). The askFDALabel-Suite is designed to complement, rather than replace, this search capability by allowing users to export their curated results from FDALabel and import them directly into our project environment via CSV or Excel files.
- **Automated Metadata Ingestion:** Upon import, the system automatically parses the FDALabel export to extract critical identifiers, including SetIDs and NDC codes. It then performs a background "hydration" process, fetching the corresponding SPL XML content and hydrating the project with full clinical metadata.
- **Automated Data Hygiene:** The system includes internal "cleanup" logic that automatically detects and removes duplicate SetIDs within an import, ensuring that subsequent comparative analyses are performed on a unique and clean set of products.

### 4.2 Adverse Event (AE) Profile Reports
One of the most powerful project-level functions is the generation of **AE Profile Reports**. These reports allow users to analyze a specific MedDRA Preferred Term (PT) across every drug within a project. The process is orchestrated as a high-priority background task via a two-phase execution model:

1. **Phase 1: Deep Labeling Scan (The "Labeled" Check):**
   - The system performs a full-text search across the XML content of every label in the project.
   - It specifically targets critical safety sections (Boxed Warnings, Contraindications, Warnings and Precautions, Adverse Reactions) to identify mentions of the target MedDRA PT.
   - **Similarity Clustering:** For all identified mentions, the system uses a similarity grouping algorithm (threshold 0.80) to cluster near-identical phrasing, allowing scientists to see how different manufacturers describe the same risk.

2. **Phase 2: openFDA Integration (The "Reported" Check):**
   - The system automatically triggers parallel queries to the **openFDA FAERS API** for every drug in the project.
   - It retrieves quantitative report counts for the target PT across three time horizons: **All-time**, **Last 5 Years**, and **Last 1 Year**.
   - **Evidence Correlation:** The final report correlates labeling presence (Phase 1) with real-world reporting counts (Phase 2), highlighting drugs that may have high reporting rates but lack corresponding warnings in their labeling—a critical step in signal detection.

---

## 5. Dashboard - Label View & Analysis
The **Label View** provides a deep-dive into individual product labels, extracting structured insights from raw SPL XML.

- **Automated Metadata Extraction:** Instantly identifies NDC codes, SetIDs, Application Numbers, and Market Status.
- **Interactive Section Highlighting:** Powered by DailyMed integration, users can jump to specific sections (e.g., Boxed Warnings, Adverse Reactions) with automatic text highlighting.
- **Ingredient Role Breakdown:** A specialized service that distinguishes between active ingredients and complex inactive excipient roles across multiple products in a project.

---

## 6. Dashboard - AE Profiles & FAERS Integration
The suite automates the generation of safety profiles by integrating with the **FDA Adverse Event Reporting System (FAERS)** via openFDA.

- **Two-Phase Reporting:** 
    - *Phase 1:* Generates high-level summary trends, including demographic distributions, reporting years, and time-to-onset analysis.
    - *Phase 2:* Performs deep-dives into specific MedDRA Preferred Terms (PTs), calculating reporting counts and mapping them to the MedDRA hierarchy (SOC -> HLT -> PT).
- **Safety Signal Detection:** AI agents analyze these profiles to identify disproportionate reporting patterns and compare them against known labeled adverse reactions.

---

## 7. Dashboard - Tox Agents (askDrugTox)
The **askDrugTox** module is a specialized toxicology intelligence agent focused on critical safety endpoints like Drug-Induced Liver Injury (DILI).

- **Curated Toxicity Database:** Accesses a specialized database of toxicity classifications and manufacturer-specific labeling.
- **Discrepancy Analysis:** Identifies "severity gaps" where different manufacturers of the same generic drug have inconsistent toxicity warnings.
- **Historical Monitoring:** Tracks how toxicity labeling has evolved over time for specific products or manufacturers.

---

## 8. Dashboard - PGx Agent
The **Pharmacogenomics (PGx) Agent** assists in the identification and analysis of genomic biomarkers within product labels.

- **Biomarker Identification:** Scans labels for MedDRA-mapped biomarker names and genomic variants.
- **Labeling Status Mapping:** Categorizes labeling into regulatory levels (e.g., Genetic Testing Required, Recommended, or Informational).
- **PGx Summary Generation:** Provides concise summaries of how genetic variations impact drug safety and efficacy based on labeling.

---

## 9. LabelComp (Label Comparison)
**LabelComp** is a structural and semantic diffing tool designed for comparing multiple product labels (e.g., Brand vs. Generic or Class-wide comparisons).

- **Multi-Level Comparison:** Performs structural comparison for PLR (Physician Labeling Rule) formatted labels and semantic word-level diffs for non-PLR labels.
- **Visual Diffing:** Highlights additions and deletions in label text using a specialized "nuanced word diff" algorithm.
- **AI-Generated Comparison Summaries:** Automatically synthesizes the differences between two or more labels into a executive summary, focusing on clinical changes in safety and dosing.

---

## 10. Elsa Addons
The suite extends its capabilities beyond its own interface through **Elsa Addons**. "Elsa" is an internal FDA AI chat platform.

- **Bookmarklet Ecosystem:** A suite of JavaScript bookmarklets that allow users to "launch" FDALabel data into the Elsa chat interface.
- **Semantic Highlighting:** Injects logic into the Elsa UI to automatically tag and highlight clinical terms, ingredients, and safety signals identified by the askFDALabel backend.
- **Seamless Integration:** Allows regulatory scientists to stay within their preferred internal chat workflows while benefiting from the deep data retrieval capabilities of the askFDALabel-Suite.
