"""CDSCO RegAI — main entry point."""
import importlib
import streamlit as st
from config import APP_TITLE, APP_ICON, get_client, get_model, GEMINI_API_KEY

st.set_page_config(
    page_title=APP_TITLE,
    page_icon=APP_ICON,
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── Dark theme replicating india-ai-2026 React design ─────────────────────
st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

/* ── Root variables ── */
:root {
    --bg-base:    #0a0d14;
    --bg-surface: #111520;
    --bg-card:    #161b2e;
    --bg-hover:   #1e2540;
    --accent:     #4f8ef7;
    --accent-dim: #2563eb22;
    --text-pri:   #e8eaf0;
    --text-sec:   #8892a4;
    --text-muted: #4a5568;
    --green:  #22c55e; --green-dim:  #22c55e22;
    --yellow: #f59e0b; --yellow-dim: #f59e0b22;
    --red:    #ef4444; --red-dim:    #ef444422;
    --purple: #a855f7; --purple-dim: #a855f722;
    --border: #1e2a45;
    --radius: 12px;
    --radius-sm: 8px;
}

/* ── Global ── */
html, body, [data-testid="stAppViewContainer"] {
    background: var(--bg-base) !important;
    color: var(--text-pri) !important;
    font-family: 'Inter', sans-serif !important;
}
[data-testid="stMain"] {
    background: var(--bg-base) !important;
}
.block-container {
    padding: 1.5rem 2rem !important;
    max-width: 1200px !important;
}

/* ── Sidebar ── */
[data-testid="stSidebar"] {
    background: #0d1117 !important;
    border-right: 1px solid var(--border) !important;
    min-width: 240px !important;
    max-width: 240px !important;
}
[data-testid="stSidebar"] > div { padding: 1.2rem 0.8rem !important; }
[data-testid="stSidebar"] * { color: var(--text-sec) !important; font-family: 'Inter', sans-serif !important; }
[data-testid="stSidebar"] h1,
[data-testid="stSidebar"] h2,
[data-testid="stSidebar"] h3 { color: var(--text-pri) !important; }
[data-testid="stSidebar"] .stRadio label {
    color: var(--text-sec) !important;
    font-size: 0.9rem !important;
    padding: 0.45rem 0.8rem !important;
    border-radius: var(--radius-sm) !important;
    display: block !important;
    transition: all 0.15s !important;
}
[data-testid="stSidebar"] .stRadio label:hover {
    color: var(--text-pri) !important;
    background: var(--bg-hover) !important;
}
/* Selected radio item */
[data-testid="stSidebar"] .stRadio [data-checked="true"] + label,
[data-testid="stSidebar"] .stRadio label[data-checked="true"] {
    color: var(--accent) !important;
    background: var(--accent-dim) !important;
}
[data-testid="stSidebar"] hr { border-color: var(--border) !important; }

/* ── Headings ── */
h1, h2, h3, h4 { color: var(--text-pri) !important; font-family: 'Inter', sans-serif !important; }
p, span, li, td, th { color: var(--text-sec) !important; }

/* ── Page title ── */
.page-title { font-size: 1.5rem; font-weight: 700; color: var(--text-pri) !important; margin-bottom: 0.2rem; }
.page-sub   { font-size: 0.9rem;  color: var(--text-muted) !important; margin-bottom: 1.4rem; }

/* ── Cards ── */
.card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1.2rem 1.4rem;
    margin-bottom: 0.8rem;
}
.card-title { font-size: 0.95rem; font-weight: 600; color: var(--text-pri) !important; margin-bottom: 0.3rem; }

/* ── Metrics ── */
[data-testid="stMetric"] {
    background: var(--bg-card) !important;
    border: 1px solid var(--border) !important;
    border-radius: var(--radius) !important;
    padding: 1rem !important;
}
[data-testid="stMetricLabel"] { color: var(--text-muted) !important; font-size: 0.78rem !important; }
[data-testid="stMetricValue"] { color: var(--text-pri) !important; font-size: 1.4rem !important; font-weight: 700 !important; }
[data-testid="stMetricDelta"] { font-size: 0.78rem !important; }

/* ── Buttons ── */
.stButton > button {
    background: var(--accent) !important;
    color: #fff !important;
    border: none !important;
    border-radius: var(--radius-sm) !important;
    font-weight: 600 !important;
    font-family: 'Inter', sans-serif !important;
    padding: 0.5rem 1.2rem !important;
    transition: opacity 0.15s !important;
}
.stButton > button:hover { opacity: 0.85 !important; }
.stButton > button[disabled] { opacity: 0.4 !important; background: var(--text-muted) !important; }
[data-testid="stDownloadButton"] > button {
    background: var(--bg-card) !important;
    border: 1px solid var(--border) !important;
    color: var(--text-pri) !important;
}

/* ── Inputs / textareas ── */
.stTextArea textarea, .stTextInput input {
    background: var(--bg-surface) !important;
    border: 1px solid var(--border) !important;
    color: var(--text-pri) !important;
    border-radius: var(--radius-sm) !important;
    font-family: 'Inter', sans-serif !important;
}
.stTextArea textarea:focus, .stTextInput input:focus {
    border-color: var(--accent) !important;
    box-shadow: 0 0 0 2px var(--accent-dim) !important;
}

/* ── Selectbox / radio ── */
[data-testid="stSelectbox"] > div > div {
    background: var(--bg-surface) !important;
    border: 1px solid var(--border) !important;
    color: var(--text-pri) !important;
    border-radius: var(--radius-sm) !important;
}
.stRadio label { color: var(--text-sec) !important; }

/* ── File uploader ── */
[data-testid="stFileUploader"] {
    background: var(--bg-surface) !important;
    border: 1px dashed var(--border) !important;
    border-radius: var(--radius) !important;
}
[data-testid="stFileUploader"] * { color: var(--text-sec) !important; }

/* ── Tabs ── */
[data-testid="stTabs"] [role="tablist"] {
    background: var(--bg-surface) !important;
    border-radius: var(--radius-sm) !important;
    padding: 3px !important;
    gap: 2px !important;
    border: 1px solid var(--border) !important;
}
[data-testid="stTabs"] button[role="tab"] {
    background: transparent !important;
    color: var(--text-muted) !important;
    border-radius: 6px !important;
    font-size: 0.85rem !important;
    font-weight: 500 !important;
    border: none !important;
    padding: 0.35rem 0.9rem !important;
}
[data-testid="stTabs"] button[role="tab"][aria-selected="true"] {
    background: var(--accent) !important;
    color: #fff !important;
}

/* ── DataFrames ── */
[data-testid="stDataFrame"] {
    border: 1px solid var(--border) !important;
    border-radius: var(--radius) !important;
    overflow: hidden !important;
}
[data-testid="stDataFrame"] * { color: var(--text-pri) !important; background: transparent; }

/* ── Alerts ── */
[data-testid="stAlert"] {
    background: var(--bg-card) !important;
    border-radius: var(--radius-sm) !important;
    border-left-width: 3px !important;
}
.stSuccess  { border-color: var(--green)  !important; }
.stWarning  { border-color: var(--yellow) !important; }
.stError    { border-color: var(--red)    !important; }
.stInfo     { border-color: var(--accent) !important; }
[data-testid="stAlert"] * { color: var(--text-pri) !important; }

/* ── Progress ── */
[data-testid="stProgressBar"] > div > div {
    background: var(--accent) !important;
    border-radius: 99px !important;
}
[data-testid="stProgressBar"] > div {
    background: var(--bg-card) !important;
    border-radius: 99px !important;
}

/* ── Expander ── */
[data-testid="stExpander"] {
    background: var(--bg-card) !important;
    border: 1px solid var(--border) !important;
    border-radius: var(--radius) !important;
}
[data-testid="stExpander"] summary { color: var(--text-pri) !important; }

/* ── Code blocks ── */
code, pre { background: var(--bg-surface) !important; color: #a5d6ff !important; border-radius: var(--radius-sm) !important; }

/* ── Divider ── */
hr { border-color: var(--border) !important; }

/* ── Spinner ── */
[data-testid="stSpinner"] * { color: var(--accent) !important; }

/* ── Status pills ── */
.pill { padding: 2px 10px; border-radius: 99px; font-size: 0.75rem; font-weight: 600; display: inline-block; }
.pill-ok  { background: var(--green-dim);  color: var(--green);  }
.pill-err { background: var(--red-dim);    color: var(--red);    }
.pill-na  { background: var(--bg-card);    color: var(--text-muted); border: 1px solid var(--border); }

/* ── Segmented control ── */
[data-testid="stSegmentedControl"] button {
    background: var(--bg-surface) !important;
    color: var(--text-sec) !important;
    border: 1px solid var(--border) !important;
}
[data-testid="stSegmentedControl"] button[aria-checked="true"] {
    background: var(--accent) !important;
    color: #fff !important;
    border-color: var(--accent) !important;
}

/* ── Caption / small text ── */
[data-testid="stCaptionContainer"], .stCaption { color: var(--text-muted) !important; font-size: 0.78rem !important; }

/* ── Scrollbar ── */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: var(--bg-base); }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 99px; }
</style>
""", unsafe_allow_html=True)


# ── Bootstrap infrastructure once per session ─────────────────────────────
if not st.session_state.get("_booted"):
    st.session_state["_booted"] = True
    from database import init_db
    from config import DATABASE_URL, S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
    st.session_state["db_ok"] = init_db(DATABASE_URL)
    st.session_state["s3_ok"] = False
    if S3_BUCKET and AWS_ACCESS_KEY_ID:
        from storage import S3Client
        ok, _ = S3Client(S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION).test_connection()
        st.session_state["s3_ok"] = ok
        if ok:
            st.session_state.update({
                "s3_bucket": S3_BUCKET, "s3_region": AWS_REGION,
                "aws_key": AWS_ACCESS_KEY_ID, "aws_secret": AWS_SECRET_ACCESS_KEY,
                "s3_connected": True,
            })


# ── Sidebar ───────────────────────────────────────────────────────────────
with st.sidebar:
    st.markdown("""
<div style="padding:0.3rem 0.4rem 1rem">
  <div style="font-size:1.1rem;font-weight:700;color:#e8eaf0;letter-spacing:-0.3px">RegulAI</div>
  <div style="font-size:0.72rem;color:#4a5568;margin-top:1px">CDSCO Regulatory Platform</div>
</div>
""", unsafe_allow_html=True)

    page = st.radio(
        "Navigation",
        options=[
            "🏠  Overview",
            "🔒  Anonymisation",
            "📄  Summarisation",
            "✅  Completeness Check",
            "🔬  SAE Classification",
            "📋  Inspection Reports",
            "📊  Audit Log",
        ],
        label_visibility="collapsed",
    )

    st.markdown("<div style='margin-top:auto'></div>", unsafe_allow_html=True)
    st.divider()

    db_pill = '<span class="pill pill-ok">Connected</span>'   if st.session_state.get("db_ok") else '<span class="pill pill-err">Offline</span>'
    s3_pill = '<span class="pill pill-ok">Connected</span>'   if st.session_state.get("s3_ok") else '<span class="pill pill-na">Not set</span>'
    ai_pill = '<span class="pill pill-ok">Ready</span>'       if GEMINI_API_KEY                 else '<span class="pill pill-err">No key</span>'

    st.markdown(f"""
<div style="font-size:0.78rem;line-height:2.4;padding:0 0.4rem">
  <div>🗄 PostgreSQL &nbsp;{db_pill}</div>
  <div>☁️ S3 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{s3_pill}</div>
  <div>🤖 Gemini &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{ai_pill}</div>
</div>
<div style="font-size:0.7rem;color:#2d3748;margin-top:1rem;padding:0 0.4rem">
  Powered by Gemini 2.5 Flash
</div>
""", unsafe_allow_html=True)


# ── Guard ─────────────────────────────────────────────────────────────────
def require_ai():
    if not GEMINI_API_KEY:
        st.error("Set `GEMINI_API_KEY` in `.env` and restart.")
        st.stop()
    return get_client(), get_model()


# ── Route ─────────────────────────────────────────────────────────────────
ROUTES = {
    "🏠  Overview":           ("views.home",             False),
    "🔒  Anonymisation":      ("views.anonymization",    True),
    "📄  Summarisation":      ("views.summarization",    True),
    "✅  Completeness Check": ("views.completeness_page",True),
    "🔬  SAE Classification": ("views.classification",   True),
    "📋  Inspection Reports": ("views.inspection",       True),
    "📊  Audit Log":          ("views.audit",            False),
}

module_path, needs_ai = ROUTES[page]
mod = importlib.import_module(module_path)
mod.render(require_ai) if needs_ai else mod.render()
