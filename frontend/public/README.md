# Drug Snippet Bookmarklet

Drug Snippet is a browser-based tool that automatically identifies drug names in AI chat interfaces (Gemini, ChatGPT, Claude, etc.) and provides quick-access links to FDA labeling data.

## Installation

1. Make sure your local server is running on `http://localhost:8845`.
2. Create a new bookmark in your browser.
3. Name it "Drug Snippet".
4. Copy and paste the following code into the URL field:

```javascript
javascript:(function(){var s1=document.createElement('script');s1.src='http://localhost:8845/drug-snippet/trie_data.js';document.head.appendChild(s1);s1.onload=function(){var s2=document.createElement('script');s2.src='http://localhost:8845/drug-snippet/main.js';document.head.appendChild(s2);};})();
```

## Features

- **Auto-Highlighting**: Scans AI responses for known drug names and highlights them. Clicking a highlighted name opens the corresponding FDA search result.
- **Selection Pop-up**: Highlight any text on the page to see a "🔍 FDA Snippet" button that searches the FDA database for the selected term.
- **Cross-Platform**: Works on Gemini, ChatGPT, Claude, and your own AskFDALabel instance.

## Data Generation

To update the list of drugs from the database, run the generation script:

```bash
cd backend
venv\Scripts\python.exe scripts\drug_snippet	rie_gen.py
```

*Note: Ensure your `.env` file in the `backend` directory has valid database credentials.*
