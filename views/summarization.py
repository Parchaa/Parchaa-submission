import json
import time
import streamlit as st
import pandas as pd
from utils.file_handler import extract_text_from_file, truncate
from modules.summarizer import summarise_document, PROMPTS

DOC_TYPES = list(PROMPTS.keys())

ICONS = {
    "SUGAM Application": "📋",
    "SAE Case Narration": "🏥",
    "Meeting Transcript / Audio Summary": "🎙️",
}


def _render_sugam(data):
    rec = data.get("recommendation", "")
    rec_color = {"Proceed": "#166534", "Request Additional Info": "#92400e", "Flag for Review": "#991b1b"}.get(rec, "#374151")
    rec_bg    = {"Proceed": "#dcfce7", "Request Additional Info": "#fef3c7", "Flag for Review": "#fee2e2"}.get(rec, "#f3f4f6")

    c1, c2 = st.columns([2, 1])
    with c1:
        st.markdown(f"**Application type:** {data.get('application_type','—')}")
        st.markdown(f"**Applicant:** {data.get('applicant','—')}")
        st.markdown(f"**Product:** {data.get('product','—')}")
    with c2:
        st.markdown(f"""<div style="background:{rec_bg};color:{rec_color};padding:0.7rem 1rem;border-radius:8px;font-weight:600;text-align:center">{rec}</div>""", unsafe_allow_html=True)

    st.markdown("**Key claims**")
    for c in data.get("key_claims", []):
        st.markdown(f"- {c}")

    ca, cb = st.columns(2)
    with ca:
        st.info(f"**Clinical data:** {data.get('clinical_data_summary','—')}")
    with cb:
        st.warning(f"**Safety profile:** {data.get('safety_profile','—')}")

    missing = data.get("missing_information", [])
    if missing:
        st.markdown("**Missing information**")
        for item in (missing if isinstance(missing, list) else [missing]):
            st.error(f"⚠️ {item}")

    st.markdown(f"> {data.get('reviewer_notes','')}")


def _render_sae(data):
    c1, c2, c3 = st.columns(3)
    c1.metric("Outcome", data.get("outcome", "—"))
    c2.metric("Causality", data.get("causality", "—"))
    c3.metric("Resolution", data.get("resolution_status", "—"))

    st.markdown(f"**Suspect drug:** {data.get('suspect_drug','—')}  |  **Event:** {data.get('event','—')}")
    criteria = data.get("seriousness_criteria", [])
    if criteria:
        st.markdown(f"**Seriousness criteria:** {', '.join(criteria)}")

    st.markdown("**Key findings**")
    for f in data.get("key_findings", []):
        st.markdown(f"- {f}")

    st.warning(f"**Action required:** {data.get('action_required','—')}")
    st.markdown(f"> {data.get('case_summary','')}")


def _render_meeting(data):
    st.markdown(f"**Date:** {data.get('meeting_date','—')}  |  **Attendees:** {', '.join(data.get('attendees', []))}")

    st.markdown("**Key decisions**")
    for d in data.get("key_decisions", []):
        st.success(f"✔  {d}")

    items = data.get("action_items", [])
    if items:
        st.markdown("**Action items**")
        st.dataframe(pd.DataFrame(items), use_container_width=True, hide_index=True)

    st.markdown("**Next steps**")
    for i, s in enumerate(data.get("next_steps", []), 1):
        st.markdown(f"{i}. {s}")

    for issue in data.get("unresolved_issues", []):
        st.error(f"⚠️  {issue}")

    st.info(data.get("executive_summary", ""))


RENDERERS = {
    "SUGAM Application": _render_sugam,
    "SAE Case Narration": _render_sae,
    "Meeting Transcript / Audio Summary": _render_meeting,
}


def render(require_ai):
    st.markdown('<div class="page-title">Document Summarisation</div>', unsafe_allow_html=True)
    st.markdown('<div class="page-sub">AI extraction of critical regulatory information into standardised reviewer formats</div>', unsafe_allow_html=True)

    col_left, col_right = st.columns([3, 1])

    with col_right:
        doc_type = st.radio("Document type", DOC_TYPES,
                            format_func=lambda x: f"{ICONS.get(x,'')} {x}",
                            label_visibility="visible")
        input_method = st.radio("Input", ["Upload file", "Paste text"], label_visibility="visible")

    with col_left:
        input_text = ""
        if input_method == "Upload file":
            f = st.file_uploader("Upload", type=["pdf", "docx", "txt"], label_visibility="collapsed")
            if f:
                with st.spinner("Extracting…"):
                    input_text = extract_text_from_file(f)
                st.caption(f"Loaded {len(input_text):,} characters from **{f.name}**")
        else:
            input_text = st.text_area("Paste text", height=240, label_visibility="collapsed",
                                      placeholder="Paste your document content here…")

    if st.button("Generate Summary", type="primary", disabled=not input_text):
        client, model_name = require_ai()
        t0 = time.time()
        with st.spinner("Analysing document…"):
            result = summarise_document(truncate(input_text), doc_type, client, model_name)
        duration_ms = int((time.time() - t0) * 1000)

        if st.session_state.get("db_ok"):
            from database import log_job, save_result
            job_id = log_job("summarisation", doc_type, duration_ms=duration_ms, file_size=len(input_text))
            save_result(job_id, "summarisation", result)

        st.markdown("---")
        st.markdown(f"#### {ICONS.get(doc_type,'')} {doc_type} — Summary")
        st.caption(f"Generated in {duration_ms} ms")

        if "error" in result:
            st.error(result["error"])
            with st.expander("Raw response"):
                st.text(result.get("raw_response", ""))
        else:
            RENDERERS.get(doc_type, lambda d: st.json(d))(result)
            st.download_button("⬇️ Download JSON", json.dumps(result, indent=2),
                               file_name="summary.json", mime="application/json")
