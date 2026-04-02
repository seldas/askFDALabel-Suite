To identify biomarkers in Structured Product Labeling (SPL) XML documents using the FDA Pharmacogenomics table, a reviewer should follow a structured strategy that accounts for nomenclature differences and targets specific sections of the labeling.

The following strategy summarizes how a reviewer can use the provided biomarker data  to analyze an SPL document:

### 1. Establish the Search Scope and Identifiers

The first step is to align the reference table with the specific SPL document being analyzed:

* 
**NDA/BLA Matching**: Use the **NDA/ANDA/BLA Number** column from the table to ensure you are referencing the correct drug product.


* 
**Version Control**: Compare the **Label Version Date** in the table with the `effectiveTime` in the SPL XML to ensure the biomarker information is current.



### 2. Map Section-Specific Searches

Biomarker information is often restricted to specific clinical contexts. The reviewer should target XML sections based on the **Labeling Sections** column in the table:

* 
**Safety and Dosing**: Prioritize sections like `Boxed Warning` (ID 34066-1), `Dosage and Administration` (ID 34068-7), and `Warnings and Precautions` (ID 43685-9) for actionable genomic information.


* 
**Mechanistic Data**: For metabolic information (e.g., CYP2D6 status), target the `Clinical Pharmacology` (ID 34090-1) and `Pharmacogenomics` (ID 42229-4) sections.


* 
**Efficacy Context**: Look in `Indications and Usage` (ID 34067-9) and `Clinical Studies` (ID 34092-7) for biomarkers used for treatment selection.



### 3. Handle Nomenclature Variations

A critical part of the strategy is recognizing that the biomarker name in the table may not match the labeling text:

* 
**HUGO Symbols vs. Common Names**: The table lists representative biomarkers using **HUGO symbols** (e.g., *ERBB2* for *HER2*), but labeling may use simplified descriptors or other conventions.


* 
**Nonspecific Terms**: If the table marks a biomarker as **"Nonspecific,"** the reviewer must look for molecular phenotypes or gene signatures rather than a single gene name.


* 
**Keyword Expansion**: The reviewer should search for both the HUGO symbol and the descriptive name found in the **Labeling Text** column of the table.



### 4. Verify Inclusion and Exclusion Criteria

To ensure the identified biomarker is pharmacogenomic rather than diagnostic, the reviewer must apply the table's specific criteria:

* 
**Inclusion**: Ensure the text refers to germline or somatic variants, functional deficiencies with genetic etiology, or chromosomal abnormalities.


* 
**Exclusion**: Disregard mentions of viral or bacterial genetic factors (e.g., viral load) and biomarkers used solely for disease diagnosis that do not influence dosing or treatment selection.



### 5. Strategy Summary for the Reviewer

| Reviewer Action | Implementation in SPL XML |
| --- | --- |
| **Filtered Extraction** | Parse only the XML nodes (`<section>`) that correspond to the "Labeling Sections" noted in the FDA table.

 |
| **Contextual Validation** | Use the "Labeling Text" column as a benchmark to verify that the identified XML text describes a functional impact on drug response.

 |
| **Phenotype Identification** | For "Nonspecific" biomarkers, search for keywords related to the clinical outcome (e.g., "slow acetylators" for *NAT2*).

 |
| **Version Sync** | Verify if "Blue Text" exists in the latest table, indicating recent additions or changes that must be checked against the latest labeling version.

 |