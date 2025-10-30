# -*- coding: utf-8 -*-
# data_loader.py (FINALIZED: Chunked Loading for Large Meeting Data)

import os
import pandas as pd
from sqlalchemy import create_engine
from dotenv import load_dotenv
import urllib.parse 

# --- ENVIRONMENT CONFIGURATION ---
load_dotenv(dotenv_path=".env") 

DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASS = os.getenv("DB_PASS")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")

# URL-Encode the password to handle characters like @ and !
ENCODED_PASS = urllib.parse.quote_plus(DB_PASS)
DATABASE_URL = f"mysql+mysqlconnector://{DB_USER}:{ENCODED_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

# --- Data File Paths and Sheets (CONFIRMED ALL XLSX) ---
FILE_1_MEETINGS = os.path.join("data", "RetentionCaseStudy.xlsx")
SHEET_MEETINGS = "MeetingData"

FILE_2_ORDERS = os.path.join("data", "RetentionCaseStudy-Data2.xlsx") 
SHEET_ORDERS = "OrderData"

FILE_3_ITEMS = os.path.join("data", "RetentionCaseStudy-data3.xlsx") 
SHEET_ITEMS = "Sheet1"

def load_data_to_mysql():
    """Reads all three Excel sheets, cleans, and loads them into MySQL in chunks."""
    print("--- 1. READING DATA FILES ---")
    try:
        # Load MEETINGS (XLSX)
        df_meetings = pd.read_excel(FILE_1_MEETINGS, sheet_name=SHEET_MEETINGS)
        
        # Load ORDERS (XLSX)
        df_orders = pd.read_excel(FILE_2_ORDERS, sheet_name=SHEET_ORDERS)
        
        # Load ORDER_ITEMS (XLSX)
        df_items = pd.read_excel(FILE_3_ITEMS, sheet_name=SHEET_ITEMS)
        
        print("✅ All data files read successfully.")
    except Exception as e:
        print(f"❌ Error reading data: {e}. Check file names and ensure 'pip install openpyxl'.")
        return

    # --- 2. CLEANING AND RENAMING ---
    
    # 2.1. ORDERS (Table Name: orders)
    df_orders['cityname'] = df_orders['cityname'].fillna('Unknown')
    df_orders['TownName'] = df_orders['TownName'].fillna('Unknown')
    df_orders['OrderStatus'] = df_orders['OrderStatus'].fillna('Unknown')
    df_orders.columns = ['order_id', 'total_qty', 'total_price', 'city_name', 'warehouse_name', 
                         'town_name', 'customer_id', 'order_status', 'state_name', 'country', 'delivered_date']

    # 2.2. ORDER_ITEMS (Table Name: order_items)
    df_items.columns = ['order_id', 'quantity', 'price', 'unit_price', 'product_name', 'brand_name', 'category_name']
    
    # 2.3. CUSTOMER_MEETINGS (Table Name: customer_meetings)
    df_meetings['NoActivityReason'] = df_meetings['NoActivityReason'].fillna('Active')
    # Use inplace=True to modify the DataFrame and save memory before chunking
    df_meetings.dropna(subset=['meetingid'], inplace=True) 
    df_meetings.columns = [col.lower().replace(' ', '_') for col in df_meetings.columns]
    
    # --- 3. LOADING TO MYSQL ---
    try:
        engine = create_engine(DATABASE_URL)
        print(f"\n--- 3. LOADING DATA TO MYSQL: {DB_NAME} ---")

        # Load small/medium tables first
        df_orders.to_sql('orders', engine, if_exists='replace', index=False)
        print(f"✅ Loaded {len(df_orders)} rows into the 'orders' table.")

        df_items.to_sql('order_items', engine, if_exists='replace', index=False)
        print(f"✅ Loaded {len(df_items)} rows into the 'order_items' table.")

        # Load large table in chunks (chunksize=5000)
        print(f"⏳ Loading {len(df_meetings)} rows into 'customer_meetings' in chunks...")
        df_meetings.to_sql('customer_meetings', engine, if_exists='replace', index=False, chunksize=5000)
        print(f"✅ Loaded all {len(df_meetings)} rows into the 'customer_meetings' table.")

        print("\n--- ✅ ALL DATA LOADING COMPLETE! ---")

    except Exception as e:
        print(f"\n❌ An error occurred during MySQL loading: {e}")
        print("Please ensure your MySQL server is running and the 'analytics_db' database exists.")

if __name__ == "__main__":
    load_data_to_mysql()