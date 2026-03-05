import sqlite3
import os
import sys

# Add backend to path so we can import our modules
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from search.scripts.search_v2_core.sql import SQL_TEMPLATES, SQLManager
from search.scripts.search_v2_core.config import LOCAL_LABEL_DB_PATH

def test_sqlite_search():
    print(f"Testing SQLite Search using {LOCAL_LABEL_DB_PATH}...")
    
    if not os.path.exists(LOCAL_LABEL_DB_PATH):
        print(f"Error: {LOCAL_LABEL_DB_PATH} not found.")
        return

    conn = sqlite3.connect(LOCAL_LABEL_DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # Test Cases
    tests = [
        {
            "name": "Metadata Search (Brand Name)",
            "template": "metadata_search",
            "binds": {"limit": 5},
            "format_args": {"name_clause": "AND product_names LIKE '%Abacavir%'", "filters": ""}
        },
        {
            "name": "Content Search (FTS5 MATCH)",
            "template": "content_search",
            "binds": {"content_query": "HIV", "limit": 5},
            "format_args": {"name_clause": "", "filters": "", "section_clause": ""}
        },
        {
            "name": "Active Ingredient Search",
            "template": "search_by_active_ingredient",
            "binds": {"substance": "%TAMOXIFEN%", "limit": 5},
            "format_args": {"filters": ""}
        },
        {
            "name": "Search by Set ID",
            "template": "search_by_set_id",
            "binds": {"set_id": "01e46f58-8bda-4ff3-ab21-57d5b540d440"},
            "format_args": {}
        }
    ]

    for test in tests:
        print(f"\n--- Running: {test['name']} ---")
        try:
            raw_sql = SQL_TEMPLATES[test['template']]
            formatted_sql = raw_sql.format(**test['format_args'])
            
            # Print a snippet of the generated SQL for verification
            print(f"SQL Dialect: SQLite")
            # We need to handle the fact that our SQLManager might use :name 
            # and sqlite3.execute supports :name dict binds
            
            cursor.execute(formatted_sql, test['binds'])
            results = cursor.fetchall()
            print(f"Found {len(results)} results.")
            
            if results:
                # Print first result key fields
                res = results[0]
                print(f"Sample Result: {res['PRODUCT_NAMES']} (ID: {res['SPL_ID']})")
                if 'SECTION_TITLE' in res.keys():
                    print(f"Matched Section: {res['SECTION_TITLE']}")
        except Exception as e:
            print(f"FAILED: {e}")
            # print(f"SQL was: {formatted_sql}")

    conn.close()

if __name__ == "__main__":
    # Ensure DB_TYPE is forced to sqlite for this test if not detected
    import search.scripts.search_v2_core.config as config
    config.DB_TYPE = "sqlite"
    
    test_sqlite_search()
