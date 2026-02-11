# AskFDALabel - Intelligent Drug Label Analyzer

AskFDALabel is a sophisticated web application designed to help healthcare professionals and researchers analyze and compare official drug labeling documents from the openFDA and DailyMed databases. It transforms complex SPL (Structured Product Labeling) XML into a clean, interactive, and actionable interface.

## Key Features

- **Advanced Drug Search:** 
    - **Smart Search Bar:** Automatically detects and searches by Brand Name, Set ID (UUID), NDC Code, or UNII.
    - **Batch Processing:** Upload a list of Set IDs (.txt) to instantly retrieve and analyze multiple labels at once.
    - **Quick Results:** Find drug labels with paginated results and toggle between Table and Panel views.
    - **Quick Favorites:** Save labels directly from search results with a single click.
- **Dynamic Label Comparison:** 
    - **Flexible Entry:** Start a comparison from a single label view or select multiple from search results.
    - **Dynamic Modification:** Add or remove labels directly on the comparison page without restarting your workflow.
    - **Contextual History:** Re-add recently removed labels or choose from your favorite list via an integrated modal.
    - **Smart Validation:** Automatically prevents mixing incompatible label formats (PLR vs non-PLR) with user-friendly error handling.
    - **Cross-Format Support:** Compare both PLR and older non-PLR labels.
    - **Numeric Mapping:** Automatically aligns subsections (e.g., "5.1" to "5.1") even if titles vary.
    - **Visual Diffing:** Side-by-side highlighting of additions, deletions, and changes with semantic status badges (SAME/CHANGED).
- **Personalization & Bulk Management:**
    - **Favorites Manager:** Dedicated dashboard for saved labels and saved comparisons.
    - **Bulk Actions:** Select multiple favorites using checkboxes for batch deletion.
    - **Import/Export:** Import lists of Set IDs from text or Excel files to quickly populate your favorites.
- **AI-Powered Insights:**
    - **Section-Wise Summaries:** AI-driven summaries of differences between labels using state-of-the-art AI.
    - **Executive Summary:** Critical discrepancies overview identifying clinically significant differences.
    - **Interactive Chat Assistant:** Natural language Q&A for any label with direct document citations.
- **Real-World Safety Surveillance:**
    - **FAERS Dashboard:** Side-by-side visualization of adverse event data from openFDA.
    - **Adverse Reaction Analytics:** Charts for top reactions, seriousness outcomes, and 5-year report trends.
    - **Label Coverage Analysis:** Cross-references top FAERS reports against label text to find documentation gaps.
- **Modern, Responsive UI:**
    - **Collapsible Navigation:** Collapsible Table of Contents sidebar for maximum reading space.
    - **Adaptive Layout:** Mobile-first design that adjusts layouts and stacks data visualizations.
    - **Resizable Columns:** Drag-and-drop column resizing in comparison views.

## Roadmap

Future planned improvements include:
- **AI-Powered Semantic Mapping:** Using state-of-the-art AI to map FAERS MedDRA terms to natural language synonyms in labels.
- **Multi-Drug Interaction Dashboard:** Simultaneous AI analysis of interaction sections for multiple drugs.
- **Demographic Deep-Dives:** Age and sex filtering for adverse event data.

See [FUTURE_IDEAS.md](./FUTURE_IDEAS.md) for more details.

## How to Run

### Prerequisites

- Python 3.x
- `pip` for package management

### 1. Set up the Environment

First, clone or download the project files to your local machine.

Navigate to the project directory in your terminal and create a Python virtual environment. This will keep the project's dependencies isolated.

```bash
# For Windows
python -m venv venv
venv\Scripts\activate

# For macOS/Linux
python3 -m venv venv
source venv/bin/activate
```

### 2. Install Dependencies

Install all the required Python packages using the `requirements.txt` file:

```bash
pip install -r requirements.txt
```

### 3. Set up your API Key

This project uses the state-of-the-art AI API for its AI chat and summarization functionality. You will need to get an API key from [Google AI Studio](https://aistudio.google.com/app/apikey).

Once you have your key, create a new file named `.env` in the root of the project directory and add your key to it:

```
GEMINI_API_KEY=YOUR_API_KEY_HERE
```

### 4. Run the Application

Now you can run the Flask web application:

```bash
python app.py
```

### 5. Populate MedDRA Data (Optional but Recommended)

To enable advanced safety analytics (System Organ Class and High Level Term details in FAERS reports), you should populate the MedDRA dictionary. Ensure you have the MedDRA `.asc` files in `./data/downloads/MedDRA_28_0_ENglish/MedAscii/` and run:

```bash
python populate_meddra.py
```

The application will start, and you can access it by opening your web browser and navigating to:

[http://127.0.0.1:5001](http://127.0.0.1:5001)