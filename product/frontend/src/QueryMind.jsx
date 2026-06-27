import { useState, useRef, useEffect, useCallback } from "react";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
// Palette: charcoal #111318, warm-white #F7F6F3, amber #F5A623,
//          slate #3D4451, muted #8B92A5, surface #1A1D24, border #252830
// Type: Fraunces (display) + DM Sans (UI/body)
// Signature: report cards assemble section-by-section like a live analyst writing

const T = {
  bg: "#111318",
  surface: "#1A1D24",
  surfaceHover: "#1F222A",
  border: "#252830",
  borderLight: "#2E3240",
  amber: "#F5A623",
  amberDim: "#F5A62320",
  amberBorder: "#F5A62340",
  white: "#F7F6F3",
  slate: "#3D4451",
  muted: "#8B92A5",
  mutedDark: "#5A6072",
  green: "#2DD4BF",
  red: "#F87171",
  blue: "#60A5FA",
  purple: "#A78BFA",
};

const CHART_COLORS = [T.amber, T.green, T.blue, T.purple, "#F472B6", "#34D399"];

// ─── PROVIDER CONFIG ──────────────────────────────────────────────────────────
const PROVIDERS = {
  claude: {
    name: "Claude (Anthropic)",
    logo: "◈",
    logoColor: T.amber,
    placeholder: "sk-ant-api03-...",
    hint: "Get your key at console.anthropic.com",
    models: ["claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
    modelLabels: { "claude-sonnet-4-6": "Claude Sonnet 4.6 (recommended)", "claude-haiku-4-5-20251001": "Claude Haiku 4.5 (faster)" },
  },
  groq: {
    name: "Groq",
    logo: "⚡",
    logoColor: "#F97316",
    placeholder: "gsk_...",
    hint: "Get your key at console.groq.com — free tier available",
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
    modelLabels: { "llama-3.3-70b-versatile": "Llama 3.3 70B (best)", "llama-3.1-8b-instant": "Llama 3.1 8B (fastest)", "mixtral-8x7b-32768": "Mixtral 8x7B" },
  },
  openai: {
    name: "OpenAI (ChatGPT)",
    logo: "◎",
    logoColor: "#10B981",
    placeholder: "sk-proj-...",
    hint: "Get your key at platform.openai.com",
    models: ["gpt-4o", "gpt-4o-mini"],
    modelLabels: { "gpt-4o": "GPT-4o (recommended)", "gpt-4o-mini": "GPT-4o Mini (faster, cheaper)" },
  },
};

// ─── BACKEND URL (set via Vercel env var VITE_BACKEND_URL) ───────────────────
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

// ─── MULTI-PROVIDER LLM CALL (direct from browser, no backend needed) ────────
async function callLLM({ provider, apiKey, model, systemPrompt, userMessage }) {
  if (provider === "claude") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Claude API error ${res.status}`);
    }
    const data = await res.json();
    return data.content?.map(b => b.text || "").join("") || "";
  }

  if (provider === "groq") {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        temperature: 0,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Groq API error ${res.status}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  }

  if (provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        temperature: 0,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `OpenAI API error ${res.status}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  }

  throw new Error("Unknown provider");
}

const SAMPLE_SCHEMAS = {
  ecommerce: {
    label: "E-commerce store",
    icon: "🛍️",
    sql: `CREATE TABLE customers (
  customer_id INT PRIMARY KEY,
  name VARCHAR(100),
  email VARCHAR(100),
  country VARCHAR(50),
  signup_date DATE,
  tier VARCHAR(20)
);

CREATE TABLE orders (
  order_id INT PRIMARY KEY,
  customer_id INT,
  order_date DATE,
  status VARCHAR(20),
  total_amount DECIMAL(10,2),
  FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

CREATE TABLE order_items (
  item_id INT PRIMARY KEY,
  order_id INT,
  product_name VARCHAR(100),
  category VARCHAR(50),
  quantity INT,
  unit_price DECIMAL(10,2),
  FOREIGN KEY (order_id) REFERENCES orders(order_id)
);`,
    questions: [
      "Which country brings in the most revenue?",
      "What are my top 5 product categories by sales?",
      "Show me how orders have trended month by month",
      "What percentage of orders get cancelled?",
      "Who are my top 10 highest-spending customers?",
    ]
  },
  saas: {
    label: "SaaS / subscriptions",
    icon: "💻",
    sql: `CREATE TABLE users (
  user_id INT PRIMARY KEY,
  email VARCHAR(100),
  plan VARCHAR(20),
  signup_date DATE,
  country VARCHAR(50),
  churned BOOLEAN DEFAULT FALSE,
  churn_date DATE
);

CREATE TABLE subscriptions (
  sub_id INT PRIMARY KEY,
  user_id INT,
  plan VARCHAR(20),
  mrr DECIMAL(10,2),
  start_date DATE,
  end_date DATE,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE events (
  event_id INT PRIMARY KEY,
  user_id INT,
  event_type VARCHAR(50),
  event_date DATETIME,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);`,
    questions: [
      "What is our monthly recurring revenue?",
      "What is our churn rate this quarter?",
      "Which plan converts the best?",
      "Show me user signups over the past 6 months",
      "Which countries have the most paying users?",
    ]
  },
  restaurant: {
    label: "Restaurant / F&B",
    icon: "🍽️",
    sql: `CREATE TABLE menu_items (
  item_id INT PRIMARY KEY,
  name VARCHAR(100),
  category VARCHAR(50),
  price DECIMAL(8,2),
  cost DECIMAL(8,2),
  active BOOLEAN DEFAULT TRUE
);

CREATE TABLE orders (
  order_id INT PRIMARY KEY,
  order_date DATETIME,
  table_number INT,
  server_name VARCHAR(50),
  total_amount DECIMAL(10,2),
  payment_method VARCHAR(30)
);

CREATE TABLE order_lines (
  line_id INT PRIMARY KEY,
  order_id INT,
  item_id INT,
  quantity INT,
  FOREIGN KEY (order_id) REFERENCES orders(order_id),
  FOREIGN KEY (item_id) REFERENCES menu_items(item_id)
);`,
    questions: [
      "What are my most ordered dishes?",
      "Which day of the week do I make the most money?",
      "What is my best and worst performing category?",
      "Show me revenue by hour of day",
      "Which server generates the most sales?",
    ]
  }
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function detectViz(data, sql = "") {
  if (!data || data.length === 0) return "empty";
  const keys = Object.keys(data[0]);
  if (data.length === 1 && keys.length === 1) return "stat";
  if (data.length === 1 && keys.length <= 3) return "stats";
  const sl = sql.toLowerCase();
  const hasGroup = sl.includes("group by");
  const hasDate = keys.some(k => /date|month|year|week|day/i.test(k));
  const numCols = keys.filter(k => typeof data[0][k] === "number" || !isNaN(Number(data[0][k]))).length;
  if (hasDate && hasGroup) return "area";
  if (hasGroup && data.length <= 7 && numCols >= 1) return "pie";
  if (hasGroup && data.length > 0) return "bar";
  if (data.length > 10 && keys.length <= 3) return "bar";
  return "table";
}

function fmtVal(v) {
  if (v === null || v === undefined) return <span style={{ color: T.mutedDark }}>—</span>;
  const n = Number(v);
  if (!isNaN(n) && String(v).trim() !== "") {
    if (Math.abs(n) >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}K`;
    if (String(v).includes(".")) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return n.toLocaleString();
  }
  return String(v);
}

// ─── VIZ COMPONENTS ───────────────────────────────────────────────────────────
function StatCard({ data }) {
  const entries = Object.entries(data[0]);
  return (
    <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", padding: "8px 0" }}>
      {entries.map(([k, v]) => (
        <div key={k} style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: "12px", padding: "20px 28px", minWidth: "140px" }}>
          <div style={{ fontSize: "32px", fontWeight: 700, color: T.amber, fontFamily: "'Fraunces', Georgia, serif", lineHeight: 1 }}>{fmtVal(v)}</div>
          <div style={{ fontSize: "12px", color: T.muted, marginTop: "6px", textTransform: "uppercase", letterSpacing: "0.08em" }}>{k.replace(/_/g, " ")}</div>
        </div>
      ))}
    </div>
  );
}

function SmartViz({ data, vizType, sql }) {
  if (!data || data.length === 0) return null;
  const keys = Object.keys(data[0]);
  const labelKey = keys[0];
  const valueKey = keys.find((k, i) => i > 0 && !isNaN(Number(data[0][k]))) || keys[1];

  const tooltipStyle = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: "8px", fontSize: "13px" };

  if (vizType === "stat" || vizType === "stats") return <StatCard data={data} />;

  if (vizType === "pie") {
    return (
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie data={data} dataKey={valueKey} nameKey={labelKey} cx="50%" cy="50%" outerRadius={95} innerRadius={40} paddingAngle={3}>
            {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke="none" />)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmtVal(v)} />
          <Legend iconType="circle" iconSize={8} formatter={(v) => <span style={{ color: T.muted, fontSize: "12px" }}>{v}</span>} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (vizType === "area") {
    return (
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="amberGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={T.amber} stopOpacity={0.25} />
              <stop offset="95%" stopColor={T.amber} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
          <XAxis dataKey={labelKey} tick={{ fill: T.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: T.muted, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmtVal} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmtVal(v)} />
          <Area type="monotone" dataKey={valueKey} stroke={T.amber} strokeWidth={2.5} fill="url(#amberGrad)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  if (vizType === "bar") {
    return (
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barSize={data.length > 10 ? 8 : 22}>
          <CartesianGrid strokeDasharray="3 3" stroke={T.border} vertical={false} />
          <XAxis dataKey={labelKey} tick={{ fill: T.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: T.muted, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmtVal} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmtVal(v)} cursor={{ fill: T.amberDim }} />
          <Bar dataKey={valueKey} fill={T.amber} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // Table
  return (
    <div style={{ overflowX: "auto", maxHeight: "300px", overflowY: "auto", borderRadius: "8px", border: `1px solid ${T.border}` }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead>
          <tr style={{ position: "sticky", top: 0, background: T.bg }}>
            {keys.map(k => (
              <th key={k} style={{ padding: "10px 14px", textAlign: "left", color: T.mutedDark, fontWeight: 600, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap" }}>
                {k.replace(/_/g, " ")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 50).map((row, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : `${T.surface}80`, transition: "background 0.1s" }}>
              {keys.map(k => (
                <td key={k} style={{ padding: "9px 14px", color: T.white, borderBottom: `1px solid ${T.border}30`, whiteSpace: "nowrap" }}>
                  {fmtVal(row[k])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {data.length > 50 && (
        <div style={{ padding: "8px 14px", color: T.mutedDark, fontSize: "12px", borderTop: `1px solid ${T.border}` }}>
          Showing 50 of {data.length} rows
        </div>
      )}
    </div>
  );
}

// ─── ANALYST MESSAGE ──────────────────────────────────────────────────────────
function AnalystMessage({ msg }) {
  const [showSQL, setShowSQL] = useState(false);
  const [visible, setVisible] = useState({ headline: false, narrative: false, viz: false, sql: false });

  useEffect(() => {
    // Stagger sections appearing — the "analyst writing live" signature effect
    const t1 = setTimeout(() => setVisible(v => ({ ...v, headline: true })), 80);
    const t2 = setTimeout(() => setVisible(v => ({ ...v, narrative: true })), 320);
    const t3 = setTimeout(() => setVisible(v => ({ ...v, viz: true })), 600);
    return () => [t1, t2, t3].forEach(clearTimeout);
  }, []);

  if (msg.type === "error") {
    return (
      <div style={{ background: "#1A0B0B", border: `1px solid ${T.red}30`, borderRadius: "16px", padding: "16px 20px", color: T.red, fontSize: "14px" }}>
        {msg.text}
      </div>
    );
  }

  if (msg.type === "welcome") {
    return (
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: "16px", padding: "20px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
          <div style={{ width: "32px", height: "32px", background: T.amberDim, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", flexShrink: 0 }}>◈</div>
          <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: "16px", color: T.white, fontWeight: 600 }}>Your analyst is ready</span>
        </div>
        <p style={{ color: T.muted, fontSize: "14px", lineHeight: "1.7", margin: "0 0 16px" }}>{msg.text}</p>
        {msg.questions && (
          <>
            <div style={{ fontSize: "11px", color: T.mutedDark, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px" }}>Start with a question</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {msg.questions.map((q, i) => (
                <button key={i} onClick={() => msg.onAsk(q)}
                  style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: "20px", padding: "8px 16px", color: T.muted, fontSize: "13px", cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}
                  onMouseEnter={e => { e.target.style.borderColor = T.amberBorder; e.target.style.color = T.white; }}
                  onMouseLeave={e => { e.target.style.borderColor = T.border; e.target.style.color = T.muted; }}>
                  {q}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  const { headline, narrative, data, vizType, sql, confidence, keyMetrics } = msg;

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: "16px", overflow: "hidden" }}>
      {/* Analyst header */}
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{ width: "28px", height: "28px", background: T.amberDim, border: `1px solid ${T.amberBorder}`, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", flexShrink: 0 }}>◈</div>
        <span style={{ fontSize: "12px", color: T.amber, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>Analysis</span>
        {confidence && (
          <span style={{ marginLeft: "auto", fontSize: "11px", color: confidence === "high" ? T.green : confidence === "medium" ? T.amber : T.muted, background: `${confidence === "high" ? T.green : T.amber}15`, padding: "3px 10px", borderRadius: "20px" }}>
            {confidence === "high" ? "High confidence" : confidence === "medium" ? "Cross-check recommended" : "Estimate only"}
          </span>
        )}
      </div>

      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "18px" }}>
        {/* Headline */}
        {visible.headline && (
          <div style={{ animation: "slideIn 0.35s ease" }}>
            <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: "22px", fontWeight: 700, color: T.white, lineHeight: 1.3, letterSpacing: "-0.02em" }}>
              {headline}
            </div>
          </div>
        )}

        {/* Key metrics row */}
        {visible.narrative && keyMetrics && keyMetrics.length > 0 && (
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", animation: "slideIn 0.35s ease" }}>
            {keyMetrics.map((m, i) => (
              <div key={i} style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: "10px", padding: "12px 18px", minWidth: "100px" }}>
                <div style={{ fontSize: "22px", fontWeight: 700, color: T.amber, fontFamily: "'Fraunces', Georgia, serif" }}>{m.value}</div>
                <div style={{ fontSize: "11px", color: T.muted, marginTop: "4px" }}>{m.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Narrative */}
        {visible.narrative && (
          <div style={{ animation: "slideIn 0.35s ease" }}>
            <p style={{ color: "#C8CDD8", fontSize: "15px", lineHeight: "1.75", margin: 0 }}>{narrative}</p>
          </div>
        )}

        {/* Viz */}
        {visible.viz && data && data.length > 0 && (
          <div style={{ animation: "slideIn 0.35s ease" }}>
            <SmartViz data={data} vizType={vizType} sql={sql} />
          </div>
        )}
      </div>

      {/* SQL footer */}
      <div style={{ borderTop: `1px solid ${T.border}` }}>
        <button onClick={() => setShowSQL(s => !s)}
          style={{ width: "100%", padding: "12px 20px", background: "none", border: "none", color: T.mutedDark, fontSize: "12px", cursor: "pointer", fontFamily: "inherit", textAlign: "left", display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ color: T.blue, fontFamily: "monospace" }}>SQL</span>
          {showSQL ? "Hide query" : "Show generated query"}
          <span style={{ marginLeft: "auto" }}>{showSQL ? "↑" : "↓"}</span>
        </button>
        {showSQL && (
          <div style={{ padding: "0 20px 16px" }}>
            <pre style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: "8px", padding: "14px 16px", fontFamily: "monospace", fontSize: "12.5px", color: "#7DD3FC", lineHeight: 1.65, overflowX: "auto", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
              {sql}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── PAGES ────────────────────────────────────────────────────────────────────

// ─── API KEY PAGE ─────────────────────────────────────────────────────────────
function APIKeyPage({ onSaved, onBack }) {
  const [provider, setProvider] = useState("claude");
  const [model, setModel] = useState(PROVIDERS.claude.models[0]);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // null | "ok" | "error"
  const [testMsg, setTestMsg] = useState("");

  const p = PROVIDERS[provider];

  function switchProvider(key) {
    setProvider(key);
    setModel(PROVIDERS[key].models[0]);
    setApiKey("");
    setTestResult(null);
    setTestMsg("");
  }

  async function testKey() {
    if (!apiKey.trim()) return;
    setTesting(true);
    setTestResult(null);
    setTestMsg("");
    try {
      // Ping the backend with a trivial question — it will call the LLM and confirm the key works
      const res = await fetch(`${BACKEND_URL}/query/schema`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: "How many tables are in this schema?",
          schema_ddl: "CREATE TABLE test (id INT PRIMARY KEY);",
          provider,
          api_key: apiKey.trim(),
          model,
        }),
      });
      if (res.ok) {
        setTestResult("ok");
        setTestMsg("Connection successful — your key works.");
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Error ${res.status}`);
      }
    } catch (e) {
      setTestResult("error");
      setTestMsg(e.message || "Key test failed. Check your key and try again.");
    }
    setTesting(false);
  }

  const ready = apiKey.trim().length > 10;

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.white, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ padding: "20px 32px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: "12px" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: T.muted, fontSize: "14px", fontFamily: "inherit", cursor: "pointer" }}>← QueryMind</button>
        <span style={{ color: T.border }}>·</span>
        <span style={{ color: T.white, fontSize: "14px", fontWeight: 500 }}>Choose your AI provider</span>
      </div>

      <div style={{ maxWidth: "620px", margin: "0 auto", padding: "48px 24px" }}>
        <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: "34px", fontWeight: 800, letterSpacing: "-0.03em", marginBottom: "8px" }}>
          Which AI powers your analyst?
        </h1>
        <p style={{ color: T.muted, fontSize: "15px", marginBottom: "36px", lineHeight: "1.6" }}>
          Your API key stays in your browser only — it's never sent to our servers or stored anywhere except your session.
        </p>

        {/* Provider cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginBottom: "28px" }}>
          {Object.entries(PROVIDERS).map(([key, prov]) => (
            <button key={key} onClick={() => switchProvider(key)}
              style={{
                background: provider === key ? T.amberDim : T.surface,
                border: `1px solid ${provider === key ? T.amber : T.border}`,
                borderRadius: "12px", padding: "16px 12px", textAlign: "center",
                fontFamily: "inherit", cursor: "pointer", transition: "all 0.15s",
              }}
              onMouseEnter={e => { if (provider !== key) e.currentTarget.style.borderColor = T.borderLight; }}
              onMouseLeave={e => { if (provider !== key) e.currentTarget.style.borderColor = T.border; }}>
              <div style={{ fontSize: "22px", color: prov.logoColor, marginBottom: "6px", fontFamily: "'Fraunces', Georgia, serif", fontWeight: 700 }}>{prov.logo}</div>
              <div style={{ fontSize: "13px", fontWeight: provider === key ? 600 : 400, color: provider === key ? T.white : T.muted, lineHeight: 1.3 }}>{prov.name}</div>
            </button>
          ))}
        </div>

        {/* Model selector */}
        <div style={{ marginBottom: "20px" }}>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: T.mutedDark, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>Model</label>
          <select value={model} onChange={e => setModel(e.target.value)}
            style={{ width: "100%", background: T.surface, border: `1px solid ${T.border}`, borderRadius: "10px", padding: "12px 16px", color: T.white, fontSize: "14px", fontFamily: "inherit", cursor: "pointer", appearance: "none" }}>
            {p.models.map(m => <option key={m} value={m}>{p.modelLabels[m]}</option>)}
          </select>
        </div>

        {/* API key input */}
        <div style={{ marginBottom: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <label style={{ fontSize: "12px", fontWeight: 600, color: T.mutedDark, textTransform: "uppercase", letterSpacing: "0.08em" }}>API Key</label>
            <a href={p.hint.split(" at ")[1] ? `https://${p.hint.split(" at ")[1]}` : "#"} target="_blank" rel="noreferrer"
              style={{ fontSize: "12px", color: T.amber, textDecoration: "none" }}>{p.hint}</a>
          </div>
          <div style={{ position: "relative" }}>
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={e => { setApiKey(e.target.value); setTestResult(null); }}
              placeholder={p.placeholder}
              style={{ width: "100%", background: T.surface, border: `1px solid ${testResult === "ok" ? T.green : testResult === "error" ? T.red : apiKey.length > 5 ? T.amberBorder : T.border}`, borderRadius: "10px", padding: "13px 48px 13px 16px", color: T.white, fontSize: "14px", fontFamily: "monospace", transition: "border-color 0.2s", boxSizing: "border-box" }}
            />
            <button onClick={() => setShowKey(s => !s)}
              style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: T.muted, fontSize: "14px", cursor: "pointer", padding: "4px" }}>
              {showKey ? "🙈" : "👁️"}
            </button>
          </div>
          {/* Test result */}
          {testResult && (
            <div style={{ marginTop: "8px", fontSize: "13px", color: testResult === "ok" ? T.green : T.red, display: "flex", alignItems: "center", gap: "6px" }}>
              {testResult === "ok" ? "✓" : "✗"} {testMsg}
            </div>
          )}
        </div>

        {/* Security note */}
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: "10px", padding: "14px 16px", marginBottom: "24px", display: "flex", gap: "10px", alignItems: "flex-start" }}>
          <span style={{ fontSize: "16px", flexShrink: 0, marginTop: "1px" }}>🔒</span>
          <p style={{ color: T.muted, fontSize: "13px", lineHeight: "1.6", margin: 0 }}>
            Your API key is stored only in your browser's session memory. It's sent directly from your browser to {p.name} — QueryMind never sees or logs it. Closing this tab clears it entirely.
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          {/* Test button */}
          <button onClick={testKey} disabled={!ready || testing}
            style={{ flex: "0 0 auto", padding: "14px 20px", background: "none", border: `1px solid ${ready ? T.border : T.border}`, borderRadius: "12px", color: ready ? T.muted : T.mutedDark, fontSize: "14px", fontFamily: "inherit", cursor: ready ? "pointer" : "not-allowed", transition: "all 0.15s" }}
            onMouseEnter={e => { if (ready && !testing) e.currentTarget.style.borderColor = T.amberBorder; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; }}>
            {testing ? "Testing…" : "Test key"}
          </button>
          {/* Continue */}
          <button onClick={() => onSaved({ provider, model, apiKey: apiKey.trim() })} disabled={!ready}
            style={{ flex: 1, padding: "14px", background: ready ? T.amber : T.surface, border: "none", borderRadius: "12px", color: ready ? T.bg : T.mutedDark, fontSize: "15px", fontWeight: 700, fontFamily: "'Fraunces', Georgia, serif", letterSpacing: "-0.01em", cursor: ready ? "pointer" : "not-allowed", transition: "all 0.2s" }}>
            Continue with {p.name} →
          </button>
        </div>
      </div>
    </div>
  );
}

function LandingPage({ onStart }) {
  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.white, fontFamily: "'DM Sans', system-ui, sans-serif", display: "flex", flexDirection: "column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,600;0,700;0,900;1,400;1,700&family=DM+Sans:wght@400;500;600&display=swap');
        @keyframes slideIn { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
        @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
        @keyframes float { 0%,100% { transform:translateY(0) } 50% { transform:translateY(-6px) } }
        * { box-sizing:border-box; margin:0; padding:0; }
        ::-webkit-scrollbar { width:4px } ::-webkit-scrollbar-thumb { background:${T.slate}; border-radius:2px }
        button { cursor:pointer }
      `}</style>

      {/* Nav */}
      <nav style={{ padding: "20px 48px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "32px", height: "32px", background: T.amber, borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", color: T.bg, fontWeight: 900, fontSize: "16px" }}>Q</div>
          <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: "20px", fontWeight: 700, letterSpacing: "-0.02em" }}>QueryMind</span>
        </div>
        <div style={{ display: "flex", gap: "32px", alignItems: "center" }}>
          <a href="#how" style={{ color: T.muted, fontSize: "14px", textDecoration: "none" }} onClick={e => { e.preventDefault(); document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' }); }}>How it works</a>
          <button onClick={onStart}
            style={{ background: T.amber, color: T.bg, border: "none", borderRadius: "8px", padding: "10px 22px", fontSize: "14px", fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>
            Try free →
          </button>
        </div>
      </nav>

      {/* Hero */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px 60px", textAlign: "center", maxWidth: "800px", margin: "0 auto", animation: "fadeIn 0.6s ease" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: T.amberDim, border: `1px solid ${T.amberBorder}`, borderRadius: "20px", padding: "6px 16px", fontSize: "13px", color: T.amber, marginBottom: "32px" }}>
          <span style={{ width: "6px", height: "6px", background: T.amber, borderRadius: "50%", display: "inline-block" }} />
          Your senior data analyst, available 24/7
        </div>

        <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: "clamp(40px, 7vw, 72px)", fontWeight: 900, lineHeight: 1.05, letterSpacing: "-0.04em", marginBottom: "24px" }}>
          Ask your database<br />
          <em style={{ color: T.amber, fontStyle: "italic" }}>anything.</em>
        </h1>

        <p style={{ fontSize: "18px", color: T.muted, lineHeight: "1.7", maxWidth: "560px", marginBottom: "48px" }}>
          Drop in your SQL schema. Ask questions in plain English the same way you'd ask a data analyst. Get detailed, honest answers backed by your actual data.
        </p>

        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", justifyContent: "center" }}>
          <button onClick={onStart}
            style={{ background: T.amber, color: T.bg, border: "none", borderRadius: "12px", padding: "16px 36px", fontSize: "16px", fontWeight: 700, fontFamily: "'Fraunces', Georgia, serif", letterSpacing: "-0.01em" }}>
            Connect your database
          </button>
          <button onClick={() => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' })}
            style={{ background: "transparent", color: T.white, border: `1px solid ${T.border}`, borderRadius: "12px", padding: "16px 28px", fontSize: "15px", fontFamily: "inherit" }}>
            See how it works
          </button>
        </div>

        {/* Social proof */}
        <p style={{ marginTop: "32px", fontSize: "13px", color: T.mutedDark }}>Works with MySQL · PostgreSQL · SQLite · any SQL database</p>
      </div>

      {/* Mock chat preview */}
      <div style={{ padding: "0 24px 80px", maxWidth: "740px", margin: "0 auto", width: "100%", animation: "float 4s ease-in-out infinite" }}>
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: "20px", overflow: "hidden", boxShadow: "0 32px 80px #00000060" }}>
          <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", gap: "6px" }}>
            {["#F87171", "#FBBF24", "#34D399"].map(c => <div key={c} style={{ width: "10px", height: "10px", borderRadius: "50%", background: c }} />)}
          </div>
          <div style={{ padding: "24px" }}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
              <div style={{ background: T.amber, color: T.bg, borderRadius: "16px 16px 4px 16px", padding: "12px 18px", fontSize: "14px", fontWeight: 500, maxWidth: "75%" }}>
                Which product category makes me the most money, and is it actually profitable?
              </div>
            </div>
            <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: "16px 16px 16px 4px", padding: "18px 20px" }}>
              <div style={{ fontSize: "11px", color: T.amber, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>Analysis</div>
              <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: "17px", fontWeight: 700, color: T.white, marginBottom: "10px" }}>Electronics leads revenue but Apparel has the best margins</div>
              <p style={{ color: T.muted, fontSize: "13.5px", lineHeight: 1.7 }}>Electronics brings in 42% of total revenue but carries high return rates eating into margins. Apparel — your second-largest category — runs at 61% gross margin versus Electronics at 34%. If growth is the goal, scale Electronics. If you want profitability, double down on Apparel.</p>
            </div>
          </div>
        </div>
      </div>

      {/* How it works */}
      <div id="how" style={{ background: T.surface, borderTop: `1px solid ${T.border}`, padding: "80px 24px" }}>
        <div style={{ maxWidth: "900px", margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "60px" }}>
            <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: "40px", fontWeight: 800, letterSpacing: "-0.03em", marginBottom: "12px" }}>No SQL. No analyst. No waiting.</h2>
            <p style={{ color: T.muted, fontSize: "16px" }}>Three steps from zero to insight.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "24px" }}>
            {[
              { step: "01", title: "Paste your schema", body: "Copy the CREATE TABLE statements from your database. MySQL, PostgreSQL, SQLite — it all works. No data leaves your machine unless you connect a live DB." },
              { step: "02", title: "Ask your question", body: "Type exactly what you'd ask a data analyst. \"Why did revenue drop in March?\" \"Who are my best customers?\" \"Am I actually making money on product X?\"" },
              { step: "03", title: "Get a real answer", body: "QueryMind writes the SQL, runs it, then translates the results into plain English — with charts, key numbers, and honest context about what the data does and doesn't tell you." },
            ].map(({ step, title, body }) => (
              <div key={step} style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: "16px", padding: "28px" }}>
                <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: "48px", fontWeight: 900, color: T.amberDim, lineHeight: 1, marginBottom: "16px", letterSpacing: "-0.04em" }}>{step}</div>
                <h3 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "10px", color: T.white }}>{title}</h3>
                <p style={{ color: T.muted, fontSize: "14px", lineHeight: "1.7" }}>{body}</p>
              </div>
            ))}
          </div>
          <div style={{ textAlign: "center", marginTop: "48px" }}>
            <button onClick={onStart}
              style={{ background: T.amber, color: T.bg, border: "none", borderRadius: "12px", padding: "16px 40px", fontSize: "16px", fontWeight: 700, fontFamily: "'Fraunces', Georgia, serif" }}>
              Get started — it's free
            </button>
          </div>
        </div>
      </div>

      <footer style={{ padding: "24px 48px", borderTop: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: "16px", fontWeight: 700 }}>QueryMind</span>
        <span style={{ color: T.mutedDark, fontSize: "13px" }}>Built by <a href="https://linkedin.com/in/kinghenrymorgan" target="_blank" rel="noreferrer" style={{ color: T.muted, textDecoration: "none" }}>Henry Dibie</a></span>
      </footer>
    </div>
  );
}

function ConnectPage({ onConnected }) {
  const [mode, setMode] = useState("template"); // "template" | "paste" | "string"
  const [schema, setSchema] = useState("");
  const [dbName, setDbName] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);

  function handleFile(file) {
    const reader = new FileReader();
    reader.onload = e => {
      setSchema(e.target.result);
      setDbName(file.name.replace(/\.[^.]+$/, ""));
      setMode("paste");
    };
    reader.readAsText(file);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function selectTemplate(key) {
    const t = SAMPLE_SCHEMAS[key];
    setSchema(t.sql);
    setDbName(t.label);
    setSelectedTemplate(key);
    setMode("paste");
  }

  const ready = schema.trim().length > 30 && dbName.trim().length > 0;

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.white, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,600;0,700;0,900;1,400;1,700&family=DM+Sans:wght@400;500;600&display=swap');
        @keyframes slideIn { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
        @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
        * { box-sizing:border-box; margin:0; padding:0; }
        textarea:focus, input:focus { outline:none; }
        ::-webkit-scrollbar { width:4px } ::-webkit-scrollbar-thumb { background:${T.slate}; border-radius:2px }
      `}</style>

      {/* Header */}
      <div style={{ padding: "20px 32px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: "12px" }}>
        <button onClick={() => onConnected(null)}
          style={{ background: "none", border: "none", color: T.muted, fontSize: "14px", fontFamily: "inherit", padding: "4px 0" }}>
          ← QueryMind
        </button>
        <span style={{ color: T.border }}>·</span>
        <span style={{ color: T.white, fontSize: "14px", fontWeight: 500 }}>Connect your database</span>
      </div>

      <div style={{ maxWidth: "720px", margin: "0 auto", padding: "48px 24px", animation: "fadeIn 0.4s ease" }}>
        <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: "36px", fontWeight: 800, letterSpacing: "-0.03em", marginBottom: "8px" }}>
          What database are we working with?
        </h1>
        <p style={{ color: T.muted, fontSize: "15px", marginBottom: "40px" }}>
          Paste your schema, upload a .sql file, or start from a template. QueryMind never stores your data — it only reads your table structure.
        </p>

        {/* Tab switcher */}
        <div style={{ display: "flex", gap: "4px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: "10px", padding: "4px", marginBottom: "28px", width: "fit-content" }}>
          {[
            { key: "template", label: "Start from template" },
            { key: "paste", label: "Paste SQL schema" },
            { key: "string", label: "Connection string" },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setMode(key)}
              style={{ background: mode === key ? T.border : "none", color: mode === key ? T.white : T.muted, border: "none", borderRadius: "7px", padding: "8px 16px", fontSize: "13px", fontWeight: mode === key ? 600 : 400, fontFamily: "inherit", transition: "all 0.15s" }}>
              {label}
            </button>
          ))}
        </div>

        {/* Template picker */}
        {mode === "template" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px", animation: "slideIn 0.3s ease" }}>
            {Object.entries(SAMPLE_SCHEMAS).map(([key, t]) => (
              <button key={key} onClick={() => selectTemplate(key)}
                style={{ background: T.surface, border: `1px solid ${selectedTemplate === key ? T.amber : T.border}`, borderRadius: "12px", padding: "20px", textAlign: "left", fontFamily: "inherit", transition: "all 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.borderColor = T.amberBorder}
                onMouseLeave={e => e.currentTarget.style.borderColor = selectedTemplate === key ? T.amber : T.border}>
                <div style={{ fontSize: "28px", marginBottom: "10px" }}>{t.icon}</div>
                <div style={{ fontSize: "15px", fontWeight: 600, color: T.white, marginBottom: "4px" }}>{t.label}</div>
                <div style={{ fontSize: "12px", color: T.muted }}>Sample schema included</div>
              </button>
            ))}

            {/* Upload tile */}
            <button onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              style={{ background: dragging ? T.amberDim : T.surface, border: `2px dashed ${dragging ? T.amber : T.borderLight}`, borderRadius: "12px", padding: "20px", textAlign: "left", fontFamily: "inherit", transition: "all 0.15s" }}>
              <div style={{ fontSize: "28px", marginBottom: "10px" }}>📂</div>
              <div style={{ fontSize: "15px", fontWeight: 600, color: T.white, marginBottom: "4px" }}>Upload .sql file</div>
              <div style={{ fontSize: "12px", color: T.muted }}>Drag and drop or click</div>
            </button>
            <input ref={fileRef} type="file" accept=".sql,.txt" style={{ display: "none" }} onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
          </div>
        )}

        {/* Paste mode */}
        {mode === "paste" && (
          <div style={{ animation: "slideIn 0.3s ease" }}>
            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: T.mutedDark, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>Database name</label>
              <input value={dbName} onChange={e => setDbName(e.target.value)} placeholder="e.g. My Shopify Store"
                style={{ width: "100%", background: T.surface, border: `1px solid ${T.border}`, borderRadius: "10px", padding: "12px 16px", color: T.white, fontSize: "14px", fontFamily: "inherit" }} />
            </div>
            <div style={{ marginBottom: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <label style={{ fontSize: "12px", fontWeight: 600, color: T.mutedDark, textTransform: "uppercase", letterSpacing: "0.08em" }}>Schema (CREATE TABLE statements)</label>
                <button onClick={() => fileRef.current?.click()} style={{ background: "none", border: "none", color: T.amber, fontSize: "12px", fontFamily: "inherit" }}>Upload file instead</button>
                <input ref={fileRef} type="file" accept=".sql,.txt" style={{ display: "none" }} onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
              </div>
              <textarea value={schema} onChange={e => setSchema(e.target.value)} rows={14} placeholder={"CREATE TABLE customers (\n  id INT PRIMARY KEY,\n  name VARCHAR(100),\n  ...\n);"}
                style={{ width: "100%", background: T.surface, border: `1px solid ${schema.length > 30 ? T.amberBorder : T.border}`, borderRadius: "10px", padding: "16px", color: "#94A3B8", fontSize: "12.5px", fontFamily: "monospace", lineHeight: "1.7", resize: "vertical", transition: "border-color 0.2s" }} />
              <div style={{ fontSize: "12px", color: T.mutedDark, marginTop: "6px" }}>
                {schema.length > 30 ? `✓ Schema detected` : "Paste your DDL above"}
              </div>
            </div>
          </div>
        )}

        {/* Connection string mode */}
        {mode === "string" && (
          <div style={{ animation: "slideIn 0.3s ease" }}>
            <div style={{ background: T.surface, border: `1px solid ${T.amberBorder}`, borderRadius: "12px", padding: "20px", marginBottom: "20px" }}>
              <div style={{ color: T.amber, fontWeight: 600, fontSize: "14px", marginBottom: "8px" }}>Live connection coming soon</div>
              <p style={{ color: T.muted, fontSize: "14px", lineHeight: "1.6" }}>
                Direct database connections (MySQL, PostgreSQL, etc.) with real query execution are on the roadmap. For now, paste your CREATE TABLE statements — the SQL generation and interpretation works the same way.
              </p>
              <button onClick={() => setMode("paste")}
                style={{ marginTop: "12px", background: T.amberDim, border: `1px solid ${T.amberBorder}`, color: T.amber, borderRadius: "8px", padding: "8px 16px", fontSize: "13px", fontFamily: "inherit" }}>
                Paste schema instead →
              </button>
            </div>
          </div>
        )}

        {/* CTA */}
        {ready && (
          <button onClick={() => onConnected({ schema, dbName, questions: selectedTemplate ? SAMPLE_SCHEMAS[selectedTemplate].questions : [] })}
            style={{ width: "100%", padding: "16px", background: T.amber, border: "none", borderRadius: "12px", color: T.bg, fontSize: "16px", fontWeight: 700, fontFamily: "'Fraunces', Georgia, serif", letterSpacing: "-0.01em", marginTop: "8px", animation: "slideIn 0.3s ease" }}>
            Start analysing → {dbName}
          </button>
        )}
      </div>
    </div>
  );
}

function AnalystPage({ db, llmConfig, onBack }) {
  const [messages, setMessages] = useState([{
    id: 0, role: "assistant", type: "welcome",
    text: `I've read ${db.dbName}. I can see your table structure and I'm ready to answer questions about your business. Ask me anything — revenue, customers, trends, what's working, what isn't.`,
    questions: db.questions,
    onAsk: (q) => ask(q),
  }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const idRef = useRef(1);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const ask = useCallback(async (question) => {
    if (!question.trim() || loading) return;
    setInput("");
    setLoading(true);

    const userMsg = { id: idRef.current++, role: "user", text: question };
    setMessages(prev => [...prev, userMsg]);

    const phases = [
      "Reading your schema…",
      "Writing the query…",
      "Interpreting results…",
      "Drafting your answer…"
    ];
    let phase = 0;
    setLoadingText(phases[0]);
    const interval = setInterval(() => {
      phase = (phase + 1) % phases.length;
      setLoadingText(phases[phase]);
    }, 1800);

    try {
      // Call Railway backend — it handles LLM routing + SQL + narration
      const res = await fetch(`${BACKEND_URL}/query/schema`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          schema_ddl: db.schema,
          provider: llmConfig.provider,
          api_key: llmConfig.apiKey,
          model: llmConfig.model,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Server error ${res.status}`);
      }

      const parsed = await res.json();

      setMessages(prev => [...prev, {
        id: idRef.current++,
        role: "assistant",
        type: "result",
        ...parsed,
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        id: idRef.current++,
        role: "assistant",
        type: "error",
        text: err.message || "Something went wrong. Check your API key or try rephrasing your question.",
      }]);
    }

    clearInterval(interval);
    setLoading(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [loading, db.schema, llmConfig]);

  // Make welcome chips work after render
  useEffect(() => {
    setMessages(prev => prev.map(m =>
      m.type === "welcome" ? { ...m, onAsk: ask } : m
    ));
  }, [ask]);

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.white, fontFamily: "'DM Sans', system-ui, sans-serif", display: "flex", flexDirection: "column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,600;0,700;0,900;1,400;1,700&family=DM+Sans:wght@400;500;600&display=swap');
        @keyframes slideIn { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }
        @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
        @keyframes pulse { 0%,100% { opacity:0.3 } 50% { opacity:1 } }
        * { box-sizing:border-box; margin:0; padding:0; }
        textarea:focus { outline:none; }
        ::-webkit-scrollbar { width:4px } ::-webkit-scrollbar-thumb { background:${T.slate}; border-radius:2px }
      `}</style>

      {/* Top bar */}
      <div style={{ padding: "14px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: "12px", position: "sticky", top: 0, background: T.bg, zIndex: 10 }}>
        <button onClick={onBack}
          style={{ background: "none", border: "none", color: T.muted, fontSize: "13px", fontFamily: "inherit" }}>
          ← Back
        </button>
        <div style={{ width: "1px", height: "18px", background: T.border }} />
        <div style={{ width: "28px", height: "28px", background: T.amber, borderRadius: "7px", display: "flex", alignItems: "center", justifyContent: "center", color: T.bg, fontWeight: 900, fontSize: "13px", flexShrink: 0 }}>Q</div>
        <div>
          <div style={{ fontFamily: "'Fraunces', Georgia, serif", fontWeight: 700, fontSize: "14px", letterSpacing: "-0.02em" }}>{db.dbName}</div>
          <div style={{ fontSize: "11px", color: T.mutedDark }}>QueryMind Analyst</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "12px" }}>
          {/* Provider badge */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: "20px", padding: "5px 12px" }}>
            <span style={{ fontSize: "13px", color: PROVIDERS[llmConfig.provider].logoColor }}>{PROVIDERS[llmConfig.provider].logo}</span>
            <span style={{ fontSize: "12px", color: T.muted }}>{PROVIDERS[llmConfig.provider].name.split(" ")[0]}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: T.green }} />
            <span style={{ fontSize: "12px", color: T.mutedDark }}>Ready</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px", display: "flex", flexDirection: "column", gap: "20px", maxWidth: "860px", width: "100%", margin: "0 auto" }}>
        {messages.map(msg => (
          <div key={msg.id} style={{ display: "flex", flexDirection: "column", gap: "0", animation: "slideIn 0.35s ease" }}>
            {msg.role === "user" ? (
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <div style={{ background: T.amber, color: T.bg, borderRadius: "16px 16px 4px 16px", padding: "13px 20px", maxWidth: "78%", fontSize: "15px", fontWeight: 500, lineHeight: "1.5" }}>
                  {msg.text}
                </div>
              </div>
            ) : (
              <AnalystMessage msg={msg} />
            )}
          </div>
        ))}

        {/* Loading */}
        {loading && (
          <div style={{ animation: "slideIn 0.3s ease" }}>
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: "16px", padding: "20px 24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ display: "flex", gap: "5px" }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{ width: "6px", height: "6px", borderRadius: "50%", background: T.amber, animation: `pulse 1.4s ${i * 0.2}s ease-in-out infinite` }} />
                  ))}
                </div>
                <span style={{ fontSize: "13px", color: T.muted }}>{loadingText}</span>
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: "16px 20px 20px", borderTop: `1px solid ${T.border}`, background: T.bg, position: "sticky", bottom: 0 }}>
        <div style={{ maxWidth: "860px", margin: "0 auto" }}>
          <div style={{ display: "flex", gap: "10px", alignItems: "flex-end", background: T.surface, border: `1px solid ${input.length > 0 ? T.amberBorder : T.border}`, borderRadius: "14px", padding: "12px 14px", transition: "border-color 0.2s" }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input); } }}
              placeholder="Ask anything about your business data…"
              rows={1}
              style={{ flex: 1, background: "none", border: "none", color: T.white, fontSize: "15px", fontFamily: "inherit", resize: "none", lineHeight: "1.5", maxHeight: "120px", overflow: "auto" }}
            />
            <button onClick={() => ask(input)} disabled={!input.trim() || loading}
              style={{ width: "38px", height: "38px", borderRadius: "10px", background: input.trim() && !loading ? T.amber : T.border, border: "none", color: input.trim() && !loading ? T.bg : T.mutedDark, fontSize: "17px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s", fontWeight: 700 }}>
              ↑
            </button>
          </div>
          <div style={{ textAlign: "center", fontSize: "11px", color: T.mutedDark, marginTop: "8px" }}>
            QueryMind generates SQL queries and interprets results — verify critical decisions against your live database
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ROOT ──────────────────────────────────────────────────────────────────────
export default function QueryMind() {
  const [page, setPage] = useState("landing");
  const [db, setDb] = useState(null);
  const [llmConfig, setLlmConfig] = useState(null);

  if (page === "landing") return (
    <LandingPage onStart={() => setPage("apikey")} />
  );

  if (page === "apikey") return (
    <APIKeyPage
      onBack={() => setPage("landing")}
      onSaved={(config) => {
        setLlmConfig(config);
        setPage("connect");
      }}
    />
  );

  if (page === "connect") return (
    <ConnectPage
      onConnected={(data) => {
        if (!data) { setPage("apikey"); return; }
        setDb(data);
        setPage("analyst");
      }}
    />
  );

  if (page === "analyst") return (
    <AnalystPage
      db={db}
      llmConfig={llmConfig}
      onBack={() => setPage("connect")}
    />
  );

  return null;
}
