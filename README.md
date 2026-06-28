<div align="center">

# ◈ QueryMind

**Your AI business analyst. Ask questions in English. Get charts, insights, and decisions.**

[![Live Demo](https://img.shields.io/badge/LIVE_DEMO-querymind--ten.vercel.app-F5A623?style=for-the-badge&logo=vercel&logoColor=black)](https://querymind-ten.vercel.app)

[![Python](https://img.shields.io/badge/Python-3.11-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

</div>

---

## What is QueryMind?

Most people who work with data are not SQL writers. They know what question they want answered — *"Why did revenue drop last month?"*, *"Who are my best customers?"*, *"Is product X actually profitable?"* — they just can't express it as a query.

QueryMind is an AI analyst for founders, operators, and business owners. You drop in your SQL schema. You ask your question in plain English. QueryMind writes the SQL, interprets the results, and tells you what the data means for your business — the same quality you'd expect from a senior analyst, on demand.

> It is not a chatbot. It behaves like a senior analyst who happens to have read every table in your database.

---

## How it works

```
You ask a question in plain English
          ↓
Schema + Prompt
          ↓
LLM (Claude / Groq / OpenAI)
          ↓
Generated SQL  ──► Safety validation (SELECT only)
          ↓
Execution Engine
          ↓
Metrics + Results
          ↓
Analyst Narrative
          ↓
Dashboard
```

QueryMind only ever runs `SELECT` and `WITH` queries. It will never `INSERT`, `UPDATE`, `DELETE`, `DROP`, or modify your data in any way.

---

## Safe execution

QueryMind enforces read-only access at the backend level, regardless of what the LLM generates:

```python
ALLOWED     = ("SELECT", "WITH", "EXPLAIN")
BLOCKED     = ("INSERT", "UPDATE", "DELETE", "DROP", "ALTER",
               "TRUNCATE", "CREATE", "REPLACE", "MERGE")

if not sql.upper().startswith(ALLOWED):
    raise Exception("Only read queries permitted")

for kw in BLOCKED:
    if re.search(rf"\b{kw}\b", sql.upper()):
        raise Exception(f"Blocked keyword: {kw}")
```

Every SQL string from the LLM is validated before execution. Queries without a `LIMIT` clause have one added automatically (default 500 rows).

---

## Repository layout

```
querymind/
│
├── product/                        ← deployable product
│   ├── frontend/                   → Vite + React  →  Vercel (free)
│   │   ├── src/QueryMind.jsx       → full UI: landing, auth, connect, analyst, dashboard
│   │   ├── src/main.jsx
│   │   ├── index.html
│   │   ├── package.json
│   │   ├── vite.config.js
│   │   └── vercel.json
│   │
│   ├── backend/                    → FastAPI  →  Render (free tier)
│   │   ├── main.py                 → auth, LLM routing, SQL safety, dashboard
│   │   ├── requirements.txt
│   │   ├── Procfile
│   │   ├── render.yaml             → pins Python 3.11, free plan
│   │   ├── railway.json
│   │   └── .env.example
│   │
│   └── DEPLOY.md                   → step-by-step deployment guide
│
├── backend/                        ← original prototype (MySQL + Gemini, hardcoded)
├── frontend/                       ← original Streamlit frontend
├── dataspeak/                      ← earlier component iterations
├── data_loader.py
├── LICENSE
└── README.md
```

---

## Features

### Analyst Chat
Ask any business question in plain English. QueryMind responds with:
- **Headline** — the single most important finding, stated directly
- **Key metrics** — 2–4 numbers that matter most, pulled from the data
- **Chart** — auto-selected visualization (area for trends, bar for rankings, pie for composition, table for detail)
- **Narrative** — 4–6 sentences written like a senior analyst briefing a founder: main finding → business implication → caveats
- **SQL** — the generated query, collapsible, so technical users can verify

### Dashboard Generation
One click generates a complete 4–6 panel business overview from your schema. Each panel covers a different angle — revenue, volume, trends, customer segments, product performance. Panels are laid out in a responsive grid.

### SQL Safety Layer
Every query is validated server-side before execution. Only `SELECT` and `WITH` are permitted. Write operations are blocked regardless of what the LLM generates.

### Multi-Provider AI
Bring your own API key, or upgrade to Pro and use QueryMind's key:

| Provider | Free tier | Best model |
|---|---|---|
| **Groq** | Yes — [console.groq.com](https://console.groq.com) | Llama 3.3 70B |
| **Claude** | No — [console.anthropic.com](https://console.anthropic.com) | Claude Sonnet 4.6 |
| **OpenAI** | No — [platform.openai.com](https://platform.openai.com) | GPT-4o |

---

## Pricing tiers

| | Free | Pro |
|---|---|---|
| **Price** | $0 | $19/month |
| **API key** | Bring your own | QueryMind's key |
| **All providers** | ✓ | ✓ |
| **Dashboard generation** | ✓ | ✓ |
| **SQL safety layer** | ✓ | ✓ |
| **Setup friction** | Pick provider + paste key | Sign up, done |

---

## Deploying (10 minutes)

See [`product/DEPLOY.md`](product/DEPLOY.md) for the full guide. Short version:

### Backend → Render (free)

1. [render.com](https://render.com) → New Web Service → connect this repo
2. Root directory: `product/backend`
3. Build: `pip install -r requirements.txt`
4. **Start: `uvicorn main:app --host 0.0.0.0 --port $PORT`**
5. Plan: Free → Deploy
6. Copy the Render URL

### Frontend → Vercel (free)

1. [vercel.com](https://vercel.com) → New Project → import this repo
2. Root directory: `product/frontend`
3. Env var: `VITE_BACKEND_URL` = your Render URL
4. Deploy

---

## Running locally

```bash
# Backend
cd product/backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend
cd product/frontend
npm install
echo "VITE_BACKEND_URL=http://localhost:8000" > .env.local
npm run dev
# → http://localhost:3000
```

---

## Backend API

| Endpoint | Method | Description |
|---|---|---|
| `/` | GET | Health check |
| `/auth/signup` | POST | Create account |
| `/auth/login` | POST | Login, returns JWT |
| `/auth/me` | GET | Current user + pro status |
| `/query/schema` | POST | Ask a question (schema-only mode) |
| `/query/live` | POST | Ask a question (live DB execution) |
| `/dashboard` | POST | Generate full multi-panel dashboard |
| `/introspect` | POST | Auto-detect schema from connection string |
| `/billing/checkout` | POST | Stripe checkout session |
| `/billing/stripe-webhook` | POST | Stripe events (payment, cancellation) |
| `/billing/portal` | POST | Stripe customer portal |

---

## Environment variables (Render)

| Variable | Description |
|---|---|
| `SECRET_KEY` | JWT secret — `python -c "import secrets; print(secrets.token_hex(32))"` |
| `QM_PROVIDER` | `groq` (recommended for cost) |
| `QM_API_KEY` | Your Groq/Claude/OpenAI key for Pro users |
| `QM_MODEL` | `llama-3.3-70b-versatile` |
| `FRONTEND_URL` | Your Vercel URL (used for CORS + Stripe redirects) |
| `STRIPE_SECRET_KEY` | From Stripe dashboard |
| `STRIPE_WEBHOOK_SECRET` | From Stripe → Webhooks |
| `STRIPE_PRICE_ID` | Your $19/mo recurring price ID |

---

## Roadmap

- [ ] Live database connections via UI (currently schema-paste only)
- [ ] Multi-turn conversation with memory of previous results
- [ ] Scheduled reports via email / Slack
- [ ] Query history and saved analyses
- [ ] CSV / PDF export
- [ ] Startup ($79/mo) and Team ($299/mo) tiers
- [ ] Tenant isolation for multi-workspace Pro accounts
- [ ] Observability: query logging, error tracking, usage metrics

---

## Contributing

Open source under MIT. PRs welcome.

Most valuable contributions right now:
1. **Live DB connector** — wire the Connect page to `/query/live` with a real connection string
2. **SQL retry** — if execution fails, re-prompt the LLM with the error and retry once
3. **Export** — PDF/CSV download of dashboard panels and analysis results

Open an issue before large PRs.

---

## License

MIT — use it, fork it, build on it.

---

<div align="center">

Built by **[Henry Dibie](https://linkedin.com/in/kinghenrymorgan)**

[GitHub](https://github.com/HenryMorganDibie) · [LinkedIn](https://linkedin.com/in/kinghenrymorgan)

</div>
