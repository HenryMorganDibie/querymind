import json
import re
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.exc import SQLAlchemyError

# ── App ───────────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    yield

app = FastAPI(title="QueryMind API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # tighten to your Vercel domain in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Models ────────────────────────────────────────────────────────────────────
class SchemaQueryRequest(BaseModel):
    question: str
    schema_ddl: str           # CREATE TABLE statements from the user
    provider: str             # "claude" | "groq" | "openai"
    api_key: str              # user's own LLM API key
    model: str                # e.g. "claude-sonnet-4-6"

class ConnectionQueryRequest(BaseModel):
    question: str
    connection_string: str    # e.g. postgresql://user:pass@host/db
    provider: str
    api_key: str
    model: str

class SchemaIntrospectRequest(BaseModel):
    connection_string: str

# ── LLM caller ────────────────────────────────────────────────────────────────
SYSTEM_PROMPT_TEMPLATE = """You are QueryMind — a senior data analyst, scientist, and business strategist.

The user has this database schema:
{schema}

For every question you MUST respond with valid JSON only (no markdown, no backticks):
{{
  "sql": "SELECT ...",
  "keyMetrics": [{{"label": "...", "value": "..."}}],
  "headline": "Direct one-sentence finding",
  "narrative": "4-6 sentence analyst-grade interpretation with business context and caveats",
  "confidence": "high" | "medium" | "low",
  "vizType": "bar" | "line" | "area" | "pie" | "table" | "stat" | "stats"
}}

Rules:
- SQL must be executable against the schema provided
- Be honest — if the schema lacks data to answer, say so in narrative and set confidence to "low"
- narrative should read like a senior analyst briefing a founder, not a chatbot
- vizType should match what best communicates the data shape"""

async def call_llm(provider: str, api_key: str, model: str, schema: str, question: str) -> dict:
    system = SYSTEM_PROMPT_TEMPLATE.format(schema=schema)

    async with httpx.AsyncClient(timeout=60.0) as client:
        if provider == "claude":
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "max_tokens": 1500,
                    "system": system,
                    "messages": [{"role": "user", "content": question}],
                },
            )
            resp.raise_for_status()
            data = resp.json()
            raw = "".join(b.get("text", "") for b in data.get("content", []))

        elif provider in ("groq", "openai"):
            url = (
                "https://api.groq.com/openai/v1/chat/completions"
                if provider == "groq"
                else "https://api.openai.com/v1/chat/completions"
            )
            resp = await client.post(
                url,
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": model,
                    "max_tokens": 1500,
                    "temperature": 0,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": question},
                    ],
                },
            )
            resp.raise_for_status()
            raw = resp.json()["choices"][0]["message"]["content"]

        else:
            raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}")

    # Parse JSON from LLM response
    clean = raw.strip().replace("```json", "").replace("```", "").strip()
    try:
        return json.loads(clean)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", clean)
        if match:
            return json.loads(match.group())
        raise HTTPException(status_code=502, detail="LLM returned malformed JSON")

# ── DB helpers ────────────────────────────────────────────────────────────────
def get_engine(connection_string: str):
    try:
        engine = create_engine(connection_string, pool_pre_ping=True)
        return engine
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid connection string: {e}")

def introspect_schema(engine) -> str:
    """Auto-generate DDL-style schema description from a live database."""
    inspector = inspect(engine)
    lines = []
    for table_name in inspector.get_table_names():
        cols = inspector.get_columns(table_name)
        fks = inspector.get_foreign_keys(table_name)
        col_defs = [f"  {c['name']} {str(c['type'])}" for c in cols]
        for fk in fks:
            ref = f"  -- FK: {', '.join(fk['constrained_columns'])} → {fk['referred_table']}.{', '.join(fk['referred_columns'])}"
            col_defs.append(ref)
        lines.append(f"CREATE TABLE {table_name} (\n" + ",\n".join(col_defs) + "\n);")
    return "\n\n".join(lines)

def execute_sql(engine, sql: str) -> list[dict]:
    with engine.connect() as conn:
        result = conn.execute(text(sql))
        cols = list(result.keys())
        rows = [dict(zip(cols, row)) for row in result.fetchall()]
        return rows

# ── Endpoints ─────────────────────────────────────────────────────────────────
@app.get("/")
def health():
    return {"status": "ok", "service": "QueryMind API"}

@app.post("/query/schema")
async def query_from_schema(req: SchemaQueryRequest):
    """
    Schema-only mode: user pastes DDL, LLM generates SQL + mock data + narrative.
    No real DB connection needed.
    """
    try:
        result = await call_llm(req.provider, req.api_key, req.model, req.schema_ddl, req.question)
        return {"mode": "schema", "question": req.question, **result}
    except httpx.HTTPStatusError as e:
        body = e.response.text
        raise HTTPException(status_code=e.response.status_code, detail=f"LLM API error: {body[:300]}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/query/live")
async def query_live_db(req: ConnectionQueryRequest):
    """
    Live DB mode: connects to real database, introspects schema,
    generates SQL via LLM, executes it, narrates the real results.
    """
    engine = get_engine(req.connection_string)

    # Step 1: introspect real schema
    try:
        schema_ddl = introspect_schema(engine)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Schema introspection failed: {e}")

    # Step 2: ask LLM to generate SQL + analysis plan
    try:
        llm_result = await call_llm(req.provider, req.api_key, req.model, schema_ddl, req.question)
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=f"LLM error: {e.response.text[:300]}")

    sql = llm_result.get("sql", "")
    if not sql:
        raise HTTPException(status_code=502, detail="LLM did not return a SQL query")

    # Step 3: execute real SQL
    try:
        real_data = execute_sql(engine, sql)
    except SQLAlchemyError as e:
        raise HTTPException(status_code=400, detail=f"SQL execution failed: {str(e)[:300]}")

    # Step 4: ask LLM to narrate the REAL results
    narration_prompt = f"""The SQL query returned these real results:
{json.dumps(real_data[:50], default=str)}

Original question: {req.question}

Write a JSON response with:
- keyMetrics: 2-4 most important numbers from this data
- headline: the single most important finding
- narrative: 4-6 sentences interpreting what this data means for the business
- confidence: "high" (data directly answers the question)
- vizType: best chart type for this data

JSON only, no markdown."""

    try:
        narration = await call_llm(req.provider, req.api_key, req.model, schema_ddl, narration_prompt)
    except Exception:
        # fallback — return data without narration
        narration = {"headline": "Query returned results", "narrative": "Results returned from your database.", "confidence": "high", "vizType": "table", "keyMetrics": []}

    return {
        "mode": "live",
        "question": req.question,
        "sql": sql,
        "data": real_data,
        "row_count": len(real_data),
        **{k: v for k, v in narration.items() if k != "sql"},
    }

@app.post("/introspect")
async def introspect(req: SchemaIntrospectRequest):
    """Returns the auto-detected schema DDL from a live database connection."""
    engine = get_engine(req.connection_string)
    try:
        schema = introspect_schema(engine)
        tables = inspect(engine).get_table_names()
        return {"schema_ddl": schema, "tables": tables, "table_count": len(tables)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
