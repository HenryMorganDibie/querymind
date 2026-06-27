<div align="center">

# ◈ QueryMind

**Ask your database anything. Get answers in plain English.**

[![Live Demo](https://img.shields.io/badge/DEMO-Watch_on_Drive-red?style=for-the-badge&logo=googledrive)](https://drive.google.com/file/d/1YivR_t3VJO-8fq8rkfKJCjIIf5k0ctCw/view?usp=sharing)
![Python](https://img.shields.io/badge/Python-3.11-3776AB?style=flat-square&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=flat-square&logo=fastapi)
![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?style=flat-square&logo=vite&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

</div>

---

## What is QueryMind?

QueryMind is an AI-powered data analyst for business owners, founders, and operators who work with SQL databases but don't write SQL themselves.

You paste your database schema (the `CREATE TABLE` statements). You ask a question in plain English — *"Which product makes me the most money?"*, *"Why did revenue drop last month?"*, *"Who are my top 10 customers?"*. QueryMind writes the SQL, runs it, and comes back with a headline finding, a chart, key numbers, and a plain-English narrative that explains what the data actually means for your business.

It is not a chatbot. It behaves like a senior analyst who happens to have read every table in your database.

---

## How it works

```
You ask a question in plain English
        ↓
Backend reads your schema + question → asks your chosen LLM to write SQL
        ↓
SQL executes against your database (or generates realistic mock data in schema-only mode)
        ↓
LLM interprets the result rows → writes a business narrative
        ↓
Frontend renders: headline · key metrics · chart · narrative · SQL (collapsible)
```

You bring your own LLM API key — Claude, Groq, or OpenAI. QueryMind never stores it.

---

## Repository layout

```
intelligent-analytics-assistant/
│
├── product/                        ← deployable product (start here)
│   ├── frontend/                   → Vite + React → deploy to Vercel
│   │   ├── src/QueryMind.jsx       → full UI: landing, API key, connect, analyst chat
│   │   ├── src/main.jsx
│   │   ├── index.html
│   │   ├── package.json
│   │   ├── vite.config.js
│   │   └── vercel.json
│   │
│   ├── backend/                    → FastAPI → deploy to Render (free) or any server
│   │   ├── main.py                 → LLM routing, SQL execution, schema introspection
│   │   ├── requirements.txt
│   │   ├── Procfile
│   │   ├── render.yaml
│   │   └── railway.json
│   │
│   └── DEPLOY.md                   → step-by-step deployment guide
│
├── backend/                        ← original prototype (hardcoded MySQL + Gemini)
│   └── main.py
│
├── frontend/                       ← original Streamlit frontend
│   └── app.py
│
├── dataspeak/                      ← earlier standalone component iterations
│   ├── DataSpeak.jsx
│   └── QueryMind.jsx
│
├── data_loader.py                  ← one-time script: loads Excel data into MySQL
├── LICENSE
└── README.md
```

---

## Deploying (10 minutes)

Full instructions are in [`product/DEPLOY.md`](product/DEPLOY.md). Short version:

### Backend → Render (free tier)

1. [render.com](https://render.com) → **New Web Service** → connect this repo
2. Root directory: `product/backend`
3. Build command: `pip install -r requirements.txt`
4. **Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`**
5. Plan: **Free** → Deploy
6. Copy your Render URL once it's live

### Frontend → Vercel (free)

1. [vercel.com](https://vercel.com) → **New Project** → import this repo
2. Root directory: `product/frontend`
3. Environment variable: `VITE_BACKEND_URL` = your Render URL
4. Deploy

Open your Vercel URL. Done.

---

## Running locally

```bash
# Backend
cd product/backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend (separate terminal)
cd product/frontend
npm install
echo "VITE_BACKEND_URL=http://localhost:8000" > .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## User flow

```
Landing page
    ↓ "Try free"
Choose AI provider
    → Claude (Anthropic) — best reasoning
    → Groq — free tier, fastest (get key at console.groq.com, no card needed)
    → OpenAI (ChatGPT) — widely familiar
    ↓ Paste API key (masked) → Test key → Continue
Connect your database
    → Pick a template (e-commerce, SaaS, restaurant)
    → Paste your own CREATE TABLE statements
    → Upload a .sql file
    ↓
Analyst chat
    → Ask questions in plain English
    → Get: headline + key metrics + chart + narrative + SQL
    → Ask follow-ups
```

---

## Backend API

### `POST /query/schema`
Schema-only mode. No live database needed. LLM generates SQL and realistic mock data.

```json
{
  "question": "Which product category makes the most money?",
  "schema_ddl": "CREATE TABLE orders (...); CREATE TABLE order_items (...);",
  "provider": "groq",
  "api_key": "gsk_...",
  "model": "llama-3.3-70b-versatile"
}
```

Response includes: `sql`, `data`, `keyMetrics`, `headline`, `narrative`, `confidence`, `vizType`

### `POST /query/live`
Live database mode. Connects to a real database, executes the generated SQL, narrates real results.

```json
{
  "question": "What is my monthly revenue trend?",
  "connection_string": "postgresql://user:pass@host:5432/mydb",
  "provider": "claude",
  "api_key": "sk-ant-...",
  "model": "claude-sonnet-4-6"
}
```

### `POST /introspect`
Auto-detects schema from a live database connection string. Returns `schema_ddl` and table list.

### `GET /`
Health check. Returns `{"status": "ok"}`.

---

## Supported LLM providers

| Provider | Free tier | Models |
|---|---|---|
| **Groq** | Yes — [console.groq.com](https://console.groq.com) | Llama 3.3 70B, Llama 3.1 8B, Mixtral 8x7B |
| **Claude** | No — [console.anthropic.com](https://console.anthropic.com) | Claude Sonnet 4.6, Claude Haiku 4.5 |
| **OpenAI** | No — [platform.openai.com](https://platform.openai.com) | GPT-4o, GPT-4o Mini |

Groq is the easiest starting point — free tier, no credit card, key in 30 seconds.

---

## Supported databases (live mode)

| Database | Connection string format |
|---|---|
| PostgreSQL | `postgresql://user:pass@host:5432/dbname` |
| MySQL | `mysql+pymysql://user:pass@host:3306/dbname` |
| SQLite | `sqlite:///path/to/file.db` |

More can be added by installing the relevant SQLAlchemy dialect driver.

---

## Security

- API keys are entered by the user in the browser, sent to the backend for a single request, and never stored
- The backend holds a key only for the duration of one HTTP call
- No database credentials are stored — connection strings are passed per-request in live mode
- CORS is currently open (`*`) — before going to production, set `ALLOWED_ORIGIN` in your backend environment to your Vercel domain

---

## Roadmap

- [ ] Live database connection via UI (currently schema-paste only in frontend)
- [ ] Multi-turn conversation with memory of previous results
- [ ] Query history saved per session
- [ ] Export to CSV / PDF
- [ ] Auth + per-user workspaces
- [ ] Dialect selector (BigQuery, Snowflake, DuckDB)
- [ ] Confidence-based SQL retry on execution failure

---

## Original prototype

The `backend/` and `frontend/` folders at the root contain the original proof-of-concept: a Streamlit UI + FastAPI backend hardwired to a specific MySQL database with 1.3M rows, using Gemini or Ollama for SQL generation. Setup instructions for that version are in the original commit history.

The `product/` folder is the current, deployable version.

---

## Contributing

PRs welcome. Most useful contributions right now:

1. **Live DB UI** — wire the Connect page to send a real connection string and use `/query/live`
2. **SQL retry** — if execution fails, re-prompt the LLM with the error message and retry once
3. **Dialect support** — test SQL generation accuracy for PostgreSQL-specific syntax

Open an issue before large PRs.

---

## License

MIT — use it, fork it, build products with it.

---

<div align="center">

Built by **[Henry Dibie](https://linkedin.com/in/kinghenrymorgan)**

[GitHub](https://github.com/HenryMorganDibie) · [LinkedIn](https://linkedin.com/in/kinghenrymorgan)

</div>
