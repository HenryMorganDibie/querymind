import streamlit as st
import requests
import pandas as pd
import json

# --- 1. CONFIGURATION ---

# The URL of your FastAPI backend (where uvicorn is running)
BACKEND_URL = "http://localhost:8000/query"

st.set_page_config(
    page_title="Intelligent Analytics Assistant",
    layout="wide",
    initial_sidebar_state="expanded",
)

# --- 2. STREAMLIT UI COMPONENTS ---

def display_error(title, message):
    """Utility function to display formatted errors."""
    st.error(f"**{title}**\n\n{message}")

st.title("💡 Intelligent Analytics Assistant")
st.markdown("Ask a question about your Orders, Order Items, or Customer Meetings data.")

# Initialize chat history
if "messages" not in st.session_state:
    st.session_state.messages = []

# --- 3. CORE LOGIC ---

def process_query(question):
    """
    Sends the user's question to the FastAPI backend and handles the response.
    """
    # 1. Add user message to chat history
    st.session_state.messages.append({"role": "user", "content": question})
    
    # 2. Prepare and send request to backend
    try:
        response = requests.post(BACKEND_URL, json={"question": question})
        response.raise_for_status() # Raise exception for bad status codes (4xx or 5xx)
        
        # 3. Parse successful response
        data = response.json()
        
        # 4. Format assistant response
        assistant_response = {
            "role": "assistant",
            "sql_query": data.get("sql_query", "N/A"),
            "data": data.get("data", []),
            "row_count": data.get("row_count", 0),
        }
        st.session_state.messages.append(assistant_response)

    except requests.exceptions.ConnectionError:
        error_msg = f"Could not connect to the backend server at `{BACKEND_URL}`. Please ensure the FastAPI backend is running with `uvicorn backend.main:app --reload`."
        st.session_state.messages.append({"role": "assistant", "content": error_msg, "error": True})
    
    except requests.exceptions.HTTPError as e:
        try:
            # Try to get the specific error detail from the backend JSON response
            error_data = e.response.json()
            error_msg = error_data.get('detail', 'An unknown error occurred on the backend.')
        except json.JSONDecodeError:
            error_msg = f"Backend returned a non-JSON error: {e.response.text}"

        st.session_state.messages.append({"role": "assistant", "content": f"**Query Failed:** {error_msg}", "error": True})

    except Exception as e:
        error_msg = f"An unexpected error occurred: {e}"
        st.session_state.messages.append({"role": "assistant", "content": error_msg, "error": True})


# --- 4. DISPLAY CHAT INTERFACE ---

# Display existing messages
for message in st.session_state.messages:
    with st.chat_message(message["role"]):
        if message["role"] == "user":
            st.markdown(message["content"])
        
        elif message["role"] == "assistant":
            if message.get("error"):
                display_error("System Error", message["content"])
                continue

            # Display SQL and Data
            st.code(message["sql_query"], language="sql")
            
            data_list = message["data"]
            row_count = message["row_count"]
            
            if data_list:
                df = pd.DataFrame(data_list)
                
                # Dynamic Display: Show data table and chart
                st.markdown(f"**Result: {row_count} rows**")
                
                # Use Streamlit's data element to display both a table and allow charting
                st.dataframe(df, use_container_width=True)
                
                # FIX: Commented out the bar chart to resolve the TypeError/compatibility bug
                # if len(df.columns) < 5 and row_count < 20:
                #    st.bar_chart(df.set_index(df.columns[0]))
            else:
                st.markdown("✅ **Query executed successfully, but returned no results.**")


# --- 5. CHAT INPUT ---

if prompt := st.chat_input("Ask your analytics question..."):
    with st.spinner("Analyzing question, generating SQL, and executing query..."):
        process_query(prompt)
    st.rerun() 

# --- 6. SIDEBAR FOR SYSTEM INFO ---

st.sidebar.header("System Status")
st.sidebar.markdown(f"**Backend Endpoint:** `{BACKEND_URL}`")

st.sidebar.info(
    "1. **Backend Running?** Ensure Uvicorn is active.\n"
    "2. **Ollama Running?** Ensure Ollama is running and the model is pulled."
)

if st.sidebar.button("Clear Chat History"):
    st.session_state.messages = []
    st.rerun()