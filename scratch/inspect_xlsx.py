import pandas as pd
import sys

def inspect_xlsx(file_path):
    try:
        # Load the Excel file
        xls = pd.ExcelFile(file_path)
        print(f"Sheets: {xls.sheet_names}")
        
        for sheet_name in xls.sheet_names:
            print(f"\n--- Sheet: {sheet_name} ---")
            df = pd.read_excel(file_path, sheet_name=sheet_name)
            print(f"Columns: {df.columns.tolist()}")
            print(f"First 5 rows:\n{df.head().to_string()}")
            
    except Exception as e:
        print(f"Error reading Excel file: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python inspect_xlsx.py <file_path>")
    else:
        inspect_xlsx(sys.argv[1])
