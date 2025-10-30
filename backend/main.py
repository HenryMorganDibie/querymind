import os
import json
import urllib.parse
import requests 
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sqlalchemy import create_engine, text
from google import genai
from google.genai.errors import APIError

# --- 1. CONFIGURATION AND DATABASE SETUP ---

# Load environment variables
load_dotenv()

# Get database credentials
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASS = os.getenv("DB_PASS")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")

# --- LLM CONFIG ---
# Set USE_GEMINI to True in .env if you want to use Gemini
USE_GEMINI = os.getenv("USE_GEMINI", "False").lower() == "true" 
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL") # e.g., gemini-2.5-flash

# Ollama Config (used if USE_GEMINI is False)
OLLAMA_HOST = os.getenv("OLLAMA_HOST")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL") # e.g., tinyllama

# Initialize Gemini Client if needed
gemini_client = None
if USE_GEMINI and GEMINI_API_KEY:
    try:
        gemini_client = genai.Client(api_key=GEMINI_API_KEY)
        print("✅ Gemini Client initialized.")
    except Exception as e:
        print(f"❌ Failed to initialize Gemini Client: {e}")

# Database Setup
ENCODED_PASS = urllib.parse.quote_plus(DB_PASS)
DATABASE_URL = f"mysql+mysqlconnector://{DB_USER}:{ENCODED_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

try:
    engine = create_engine(DATABASE_URL)
    print(f"✅ Database Engine created for {DB_NAME}")
except Exception as e:
    print(f"❌ Failed to create database engine: {e}")

# Initialize FastAPI app
app = FastAPI()

# Pydantic model for incoming request data
class QueryRequest(BaseModel):
    question: str

# --- 2. DATABASE SCHEMA DEFINITION for LLM (FINAL WORKING PROMPT) ---
DATABASE_SCHEMA = f"""
-- MySQL Database Schema: analytics_db
-- Tables are: orders, order_items, customer_meetings
-- Column structures are:
-- orders(order_id, total_qty, total_price, city_name, customer_id, delivered_date)
-- order_items(order_id, product_name, category_name)
-- customer_meetings(customer_id, meetingid, meetingdate, meetingreason, meetingstatus)
-- RULES:
-- 1. Use customer_id to join orders and customer_meetings.
-- 2. Use order_id to join orders and order_items.
-- 3. For ranking or sequence analysis, use a Common Table Expression (CTE) with the LAG() function.
--
-- Example CTE for LAG():
-- WITH RankedMeetings AS (
--     SELECT
--         customer_id,
--         meetingdate,
--         LAG(meetingdate) OVER (PARTITION BY customer_id ORDER BY meetingdate) AS previous_meeting_date
--     FROM customer_meetings
-- )
-- SELECT
--     customer_id,
--     meetingdate,
--     previous_meeting_date,
--     DATEDIFF(meetingdate, previous_meeting_date) AS days_between_meetings
-- FROM RankedMeetings
-- WHERE previous_meeting_date IS NOT NULL;
"""

# --- 3. LLM INTERACTION FUNCTIONS ---

def generate_prompt(question: str) -> str:
    """Creates the standard prompt used for both LLM engines."""
    return f"""
    You are an expert MySQL query generator.
    Your goal is to convert a user's natural language question into a single, valid MySQL query.
    
    1. Only use the tables and columns provided in the schema below.
    2. Do NOT include the triple backticks (```) or any explanatory text in your response. Just the raw SQL query.
    3. Ensure the SQL query is syntactically perfect MySQL.
    4. For percentage calculations, do the math directly in the query.
    5. Always use aliasing (AS) for complex calculated columns.
    
    DATABASE SCHEMA:
    {DATABASE_SCHEMA}
    
    USER QUESTION: "{question}"
    
    SQL Query:
    """

def get_sql_from_gemini(question: str) -> str:
    """Generates SQL using the Google Gemini API."""
    if not gemini_client:
        raise HTTPException(status_code=500, detail="Gemini Client is not initialized. Check API Key.")
        
    prompt = generate_prompt(question)

    try:
        response = gemini_client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config={"temperature": 0.0}
        )
        
        sql_query = response.text.strip().replace('```sql', '').replace('```', '').strip()
        return sql_query
    
    except APIError as e:
        raise HTTPException(status_code=503, detail=f"Gemini API Call Failed. Check API Key/billing. Error: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating SQL from Gemini: {e}")

def get_sql_from_ollama(question: str) -> str:
    """Generates SQL using the local Ollama service."""
    if not OLLAMA_HOST or not OLLAMA_MODEL:
          raise HTTPException(status_code=500, detail="Ollama settings not found. Check OLLAMA_HOST and OLLAMA_MODEL in .env.")
          
    prompt = generate_prompt(question)
    
    # Ollama API payload (generate endpoint format)
    payload = {
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0.0}
    }
    
    try:
        response = requests.post(
            f"{OLLAMA_HOST}/api/generate",
            json=payload
        )
        response.raise_for_status()
        
        # Ollama returns a single JSON response for stream=False
        data = response.json()
        sql_query = data.get("response", "").strip().replace('```sql', '').replace('```', '').strip()

        if not sql_query:
              raise Exception("Ollama returned an empty or malformed response.")

        return sql_query
    
    except requests.exceptions.ConnectionError:
        raise HTTPException(
            status_code=503,
            detail=f"Could not connect to Ollama at {OLLAMA_HOST}. Is the Ollama service running?"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ollama SQL generation failed: {e}")

# --- 4. API ENDPOINTS ---

@app.get("/")
def read_root():
    """Simple status check for the backend."""
    llm_status = "Gemini" if USE_GEMINI else "Ollama"
    return {"status": "ok", "message": f"Intelligent Analytics Core is running, using {llm_status}."}

@app.post("/query")
def execute_query(request: QueryRequest):
    """
    Main endpoint to receive a question, generate SQL, execute it, and return results.
    """
    
    # 1. Generate SQL Query using the selected engine
    try:
        if USE_GEMINI:
            sql_query = get_sql_from_gemini(request.question)
        else:
            sql_query = get_sql_from_ollama(request.question)
            
        print(f"\n[Generated SQL]: {sql_query}")
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate SQL: {e}")

    # 2. Execute SQL Query
    try:
        with engine.connect() as connection:
            result = connection.execute(text(sql_query)) 
            
            # 3. Format Results
            columns = result.keys()
            data = [dict(zip(columns, row)) for row in result.fetchall()]
            
            return {
                "question": request.question,
                "sql_query": sql_query,
                "data": data,
                "row_count": len(data)
            }
            
    except Exception as e:
        error_detail = str(e).split('\n')[0]
        print(f"[SQL Execution Error]: {e}")
        raise HTTPException(
            status_code=400,
            detail=f"SQL Execution Failed. The generated query was invalid. Error: {error_detail}"
        )