import streamlit as st
from config import GEMINI_API_KEY, DATABASE_URL, S3_BUCKET


def render():
    st.markdown('<div class="page-title">Regulatory Workflow Automation</div>', unsafe_allow_html=True)
    st.markdown('<div class="page-sub">AI-powered platform for CDSCO document processing, anonymisation, and regulatory review</div>', unsafe_allow_html=True)

    # ── System status ──────────────────────────────────────────────────────
    db_ok = st.session_state.get("db_ok", False)
    s3_ok = st.session_state.get("s3_ok", False)
    ai_ok = bool(GEMINI_API_KEY)

    c1, c2, c3, c4 = st.columns(4)
    with c1:
        st.metric("AI Model", "Gemini 2.0 Flash", "Ready" if ai_ok else "Not configured")
    with c2:
        st.metric("Database", "PostgreSQL", "Connected" if db_ok else "Offline")
    with c3:
        st.metric("Object Storage", "AWS S3", "Connected" if s3_ok else "Not configured")
    with c4:
        st.metric("Compliance", "4 Standards", "DPDP · NDHM · ICMR · CDSCO")

    st.markdown("---")

    # ── Module cards ───────────────────────────────────────────────────────
    st.markdown("#### Modules")

    row1 = st.columns(3)
    row2 = st.columns(2)

    modules = [
        {
            "icon": "🔒",
            "title": "PII / PHI Anonymisation",
            "desc": "Three-layer detection pipeline: regex → Presidio NER → Gemini AI. Two-step pseudonymisation then irreversible anonymisation per DPDP Act 2023.",
            "tags": ["Aadhaar · PAN · Phone", "spaCy NER names & orgs", "Gemini contextual PHI"],
        },
        {
            "icon": "📄",
            "title": "Document Summarisation",
            "desc": "Extracts structured summaries from SUGAM applications, SAE case narrations, and meeting transcripts into standardised reviewer formats.",
            "tags": ["SUGAM applications", "SAE narrations", "Meeting transcripts"],
        },
        {
            "icon": "✅",
            "title": "Completeness Assessment",
            "desc": "Validates documents against CDSCO regulatory checklists, flags missing fields, and performs AI-powered version comparison with visual diff.",
            "tags": ["CT / NDA / SAE checklists", "Missing field detection", "Document version diff"],
        },
        {
            "icon": "🔬",
            "title": "SAE Classification",
            "desc": "Classifies adverse events by ICH E2A severity, assesses causality, detects duplicates, and generates a prioritised review queue.",
            "tags": ["Death · Hospitalisation · Disability", "Duplicate detection", "Batch processing"],
        },
        {
            "icon": "📋",
            "title": "Inspection Report Generation",
            "desc": "Converts unstructured field notes and handwritten observations into formal CDSCO inspection reports with Critical / Major / Minor findings.",
            "tags": ["GMP · GCP compliance", "CAPA recommendations", "CDSCO template output"],
        },
    ]

    cells = [row1[0], row1[1], row1[2], row2[0], row2[1]]
    for cell, m in zip(cells, modules):
        with cell:
            tags_html = " &nbsp;·&nbsp; ".join(
                f'<span style="background:#f1f5f9;color:#475569;padding:2px 8px;border-radius:4px;font-size:0.75rem">{t}</span>'
                for t in m["tags"]
            )
            st.markdown(f"""
<div class="card">
  <div style="font-size:1.4rem;margin-bottom:0.4rem">{m['icon']}</div>
  <div class="card-title">{m['title']}</div>
  <p style="font-size:0.85rem;color:#64748b;margin:0.4rem 0 0.8rem">{m['desc']}</p>
  <div style="line-height:2">{tags_html}</div>
</div>
""", unsafe_allow_html=True)

    st.markdown("---")

    # ── Compliance ─────────────────────────────────────────────────────────
    st.markdown("#### Regulatory Compliance")
    cc = st.columns(4)
    standards = [
        ("DPDP Act 2023", "Digital Personal Data Protection Act — primary Indian data privacy law"),
        ("NDHM / ABDM", "National Digital Health Mission Health Data Management Policy"),
        ("ICMR Guidelines", "Ethical Guidelines for Biomedical & Health Research"),
        ("CDSCO / Schedule Y", "Central Drugs Standard Control Organisation standards"),
    ]
    for col, (name, desc) in zip(cc, standards):
        with col:
            st.markdown(f"""
<div class="card" style="border-left:3px solid #3b82f6">
  <div class="card-title" style="color:#1d4ed8">{name}</div>
  <p style="font-size:0.82rem;color:#64748b;margin:0.3rem 0 0">{desc}</p>
</div>
""", unsafe_allow_html=True)
