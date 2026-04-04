# Idea: Dashboard Label "Deep Research" (or "Deep Dive") Panel

## Overview
The goal is to provide a specialized panel in the dashboard label view that performs an automated, AI-driven comparison of the current label against its peers. 

## Key Objectives
- **Section-Level Analysis:** Instead of a general summary, focus on specific labeling sections (e.g., Warnings & Precautions, Adverse Reactions, Indications).
- **Intra-Drug Comparison:** Compare the current label with other labels for the same drug (generic name) but different manufacturers or versions.
- **Class-Level Comparison:** Compare the label with other drugs in the same Established Pharmacologic Class (EPC).
- **Trend/Difference Identification:** Highlight unique warnings or omissions compared to the class or drug group.

## Proposed Name
- **Label Deep Research**
- **Label Deep Dive** (Common industry term)
- **Class & Peer Analysis**
- **Labeling Intelligence**

## Functional Workflow (Conceptual)
1.  **Metadata Extraction:** The system identifies the `generic_name` and `epc` of the current label.
2.  **Peer Discovery:** 
    -   Queries the database for other labels with the same `generic_name` (excluding current SetID).
    -   Queries the database for other labels with the same `epc` (different generic names).
3.  **Sectional Comparison:**
    -   The system picks a target section (e.g., Boxed Warning).
    -   It aggregates text from peers for the same section.
    -   AI (Gemini/Llama) analyzes the target label's section against the aggregated "class standard" or "peer average."
4.  **Reporting:**
    -   "What's Unique": Warnings present in this label but rare in the class.
    -   "What's Missing": Warnings common in the class but missing here.
    -   "Manufacturer Variations": Specific phrasing differences for the same generic drug.

## Technical Considerations
- **Token Limits:** Comparing many labels directly would exceed token limits. We might need a two-stage approach:
    1.  Summarize peers first.
    2.  Compare target to the summary.
- **EPC Granularity:** Some EPCs are very broad. We might need to filter for the top 5-10 most "representative" or "recent" labels in the class.
- **Section Matching:** Ensure we match sections correctly using LOINC codes (e.g., `34071-1` for Warnings and Precautions).

## Discussion Points
- Which sections are most valuable for this "Deep Dive"?
- Should we allow the user to select specific peers to compare against, or should it be fully automated?
- Is "Deep Research" the right name, or does it sound too much like the existing "Search" agent?
