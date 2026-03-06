import csv
import argparse
import sys
from pg_utils import PGUtils

def import_csv(file_path, table_name, schema='public', delimiter=',', on_conflict=None):
    """Imports a CSV file into a PostgreSQL table."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            reader = csv.reader(f, delimiter=delimiter)
            columns = next(reader)
            data = [tuple(row) for row in reader]
            
            print(f"Importing {len(data)} rows into {schema}.{table_name}...")
            PGUtils.bulk_insert(table_name, columns, data, schema=schema, on_conflict=on_conflict)
            print("Import successful.")
    except Exception as e:
        print(f"Error during import: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generic CSV to PostgreSQL Importer")
    parser.add_argument("file", help="Path to the CSV file")
    parser.add_argument("table", help="Target table name")
    parser.add_argument("--schema", default="public", help="Target schema (default: public)")
    parser.add_argument("--delimiter", default=",", help="CSV delimiter (default: ,)")
    parser.add_argument("--on-conflict", help="Conflict resolution clause (e.g., 'DO NOTHING')")
    
    args = parser.parse_args()
    import_csv(args.file, args.table, args.schema, args.delimiter, args.on_conflict)
