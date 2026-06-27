# Deploying QueryMind

Two services. Both free tiers available.

```
product/
├── backend/    → Railway
└── frontend/   → Vercel
```

---

## Step 1 — Deploy the backend to Railway

Railway auto-detects Python and runs the Procfile.

### 1.1 Push to GitHub (already done)

The `product/backend/` folder is in this repo.

### 1.2 Create a Railway project

1. Go to [railway.app](https://railway.app) → **New Project**
2. Choose **Deploy from GitHub repo**
3. Select this repo (`intelligent-analytics-assistant`)
4. Railway will ask which folder — set the **Root Directory** to `product/backend`
5. Click **Deploy**

Railway auto-detects Python via `requirements.txt` and uses the `Procfile` to start.

### 1.3 Get your Railway URL

Once deployed, go to your service → **Settings** → **Networking** → **Generate Domain**.

You'll get something like: `https://querymind-backend-production.up.railway.app`

**Copy this URL — you need it for Vercel.**

### 1.4 No environment variables needed

Users supply their own API keys through the UI. Railway just needs to run the server.

---

## Step 2 — Deploy the frontend to Vercel

### 2.1 Import the repo

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import this GitHub repo
3. Set **Root Directory** to `product/frontend`
4. Vercel auto-detects Vite

### 2.2 Set environment variable

In Vercel → Project Settings → Environment Variables, add:

| Name | Value |
|------|-------|
| `VITE_BACKEND_URL` | `https://your-railway-url.up.railway.app` |

### 2.3 Deploy

Click **Deploy**. Vercel builds the Vite app and gives you a URL like:
`https://querymind.vercel.app`

---

## Testing it end to end

1. Open your Vercel URL
2. Click **Try free**
3. Pick a provider (try **Groq** — it has a free tier, get a key at console.groq.com in 30 seconds)
4. Paste your key, click **Test key** — should say "Connection successful"
5. Click **Continue**, pick a schema template or paste your own
6. Ask a question

You should get a full analysis response with SQL, chart, and English narrative.

---

## Running locally

```bash
# Terminal 1 — backend
cd product/backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Terminal 2 — frontend
cd product/frontend
npm install
echo "VITE_BACKEND_URL=http://localhost:8000" > .env.local
npm run dev
```

Open http://localhost:3000

---

## Architecture

```
Browser (Vercel)
    │
    │  POST /query/schema
    │  { question, schema_ddl, provider, api_key, model }
    ▼
Railway (FastAPI)
    │
    ├── Calls LLM API (Claude / Groq / OpenAI) with user's key
    │   → generates SQL + mock data + narrative
    │
    └── (live DB mode) executes real SQL, narrates real results
    │
    ▼
Browser renders headline + metrics + chart + SQL
```

The user's API key travels: Browser → Railway → LLM provider.
It is never stored. Railway logs are under your control.

---

## Live database connections (advanced)

Once a user has a live PostgreSQL or MySQL database accessible from the internet,
they can use `/query/live` instead of `/query/schema`.

Update `ConnectPage` in `QueryMind.jsx` to send the connection string and use
the `/query/live` endpoint. The backend will auto-introspect the schema,
generate SQL, execute it against real data, and narrate actual results.

**Supported databases:**
- PostgreSQL (`postgresql://user:pass@host:5432/db`)
- MySQL (`mysql+pymysql://user:pass@host:3306/db`)
- SQLite (`sqlite:///path/to/file.db`) — for local testing only
