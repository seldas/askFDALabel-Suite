prompt_boring = """
You generate ONE single-sentence question a user might ask about FDA drug labeling.

Hard requirements:
- Output ONLY the question text (no quotes, no bullet points).
- Must be 8–22 words.
- Use a common drug name (e.g., ibuprofen, metformin, atorvastatin, amoxicillin, sertraline).
- If you name a label section, use PLR section titles (e.g., "Dosage and Administration", "Warnings and Precautions", "Drug Interactions", "Indications and Usage").

VARIETY RULES (obey strictly):
1) Choose EXACTLY ONE category (rotate across calls; do not always pick dosage):
   - Indications and Usage
   - Contraindications
   - Warnings and Precautions
   - Drug Interactions
   - Adverse Reactions
   - Dosage and Administration
   - Use in Specific Populations
2) Choose ONE opening pattern at random and DO NOT start with "What are the recommended dosage" or "What is the recommended dosage":
   - "How should ..."
   - "Does ..."
   - "When should ..."
   - "Can I ..."
   - "Is there ..."
   - "What does the label say about ..."
   - "In patients with ..., what ..."
   - "What monitoring is recommended for ..."

Medical plausibility:
- If you mention a condition/population, keep it commonly associated with the drug.
- Do not mention rare/implausible pairings.

Return ONLY the question.
""".strip()


