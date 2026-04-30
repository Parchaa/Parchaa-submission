import json
import time
import streamlit as st
import pandas as pd
from utils.file_handler import extract_text_from_file, truncate
from modules.completeness import assess_completeness, compare_documents, text_diff
from config import CHECKLIST_ITEMS

STATUS_COLORS = {
    "Present":        "background-color:#dcfce7",
    "Partial":        "background-color:#fef9c3",
    "Missing":        "background-color:#fee2e2",
    "Not Applicable": "background-color:#f1f5f9",
}


def render(require_ai):
    st.markdown('<div class="page-title">Completeness Assessment</div>', unsafe_allow_html=True)
    st.markdown('<div class="page-sub">Validate regulatory documents against CDSCO checklists and compare filing versions</div>', unsafe_allow_html=True)

    tab1, tab2 = st.tabs(["Completeness Check", "Document Comparison"])

    # ── Tab 1 ──────────────────────────────────────────────────────────────
    with tab1:
        col_opt, col_in = st.columns([1, 3])

        with col_opt:
            checklist_type = st.selectbox("Checklist", list(CHECKLIST_ITEMS.keys()))
            input_method = st.radio("Input", ["Upload file", "Paste text"], label_visibility="visible", key="cc_method")
            with st.expander("View checklist items"):
                for item in CHECKLIST_ITEMS[checklist_type]:
                    st.markdown(f"<span style='font-size:0.82rem'>• {item}</span>", unsafe_allow_html=True)

        with col_in:
            doc_text = ""
            if input_method == "Upload file":
                f = st.file_uploader("Upload document", type=["pdf", "docx", "txt"], label_visibility="collapsed", key="cc_upload")
                if f:
                    doc_text = extract_text_from_file(f)
                    st.caption(f"Loaded {len(doc_text):,} chars from **{f.name}**")
            else:
                doc_text = st.text_area("Paste text", height=220, label_visibility="collapsed", key="cc_paste")

        if st.button("Run Completeness Check", type="primary", disabled=not doc_text, key="cc_run"):
            client, model_name = require_ai()
            t0 = time.time()
            with st.spinner("Assessing document…"):
                result = assess_completeness(truncate(doc_text), checklist_type, client, model_name)
            duration_ms = int((time.time() - t0) * 1000)

            if "error" in result:
                st.error(result["error"]); return

            if st.session_state.get("db_ok"):
                from database import log_job, save_result
                job_id = log_job("completeness", checklist_type, duration_ms=duration_ms, file_size=len(doc_text))
                save_result(job_id, "completeness", result)

            st.markdown("---")
            pct    = result.get("overall_completeness_pct", 0)
            status = result.get("status", "Unknown")
            status_color = {"Complete":"#166534","Mostly Complete":"#92400e","Incomplete":"#9a3412","Critical Gaps":"#991b1b"}.get(status,"#374151")
            status_bg    = {"Complete":"#dcfce7","Mostly Complete":"#fef3c7","Incomplete":"#ffedd5","Critical Gaps":"#fee2e2"}.get(status,"#f3f4f6")

            c1, c2, c3, c4 = st.columns(4)
            c1.metric("Score", f"{pct}%")
            c2.metric("Missing items", sum(1 for i in result.get("items",[]) if i.get("status")=="Missing"))
            c3.metric("Partial items", sum(1 for i in result.get("items",[]) if i.get("status")=="Partial"))
            c4.metric("Time", f"{duration_ms} ms")

            st.markdown(f"""<div style="background:{status_bg};color:{status_color};padding:0.6rem 1rem;border-radius:8px;font-weight:600;margin:0.5rem 0">{status}</div>""", unsafe_allow_html=True)
            st.progress(pct / 100)

            items = result.get("items", [])
            if items:
                st.markdown("#### Checklist item status")
                df = pd.DataFrame(items)
                st.dataframe(
                    df.style.map(lambda v: STATUS_COLORS.get(v, ""), subset=["status"]),
                    use_container_width=True, hide_index=True,
                )

            critical = result.get("critical_missing", [])
            if critical:
                st.markdown("#### Critical missing items")
                for item in critical:
                    st.error(f"🔴  {item}")

            recs = result.get("recommendations", [])
            if recs:
                st.markdown("#### Recommendations")
                for i, r in enumerate(recs, 1):
                    st.markdown(f"{i}. {r}")

            action = result.get("reviewer_action", "")
            if action:
                st.warning(f"**Reviewer action:** {action}")

            st.download_button("⬇️ Download report (JSON)", json.dumps(result, indent=2),
                               file_name="completeness_report.json", mime="application/json")

    # ── Tab 2 ──────────────────────────────────────────────────────────────
    with tab2:
        st.markdown("Upload or paste two versions of the same filing to detect substantive changes.")

        cv1, cv2 = st.columns(2)
        text1, text2 = "", ""

        with cv1:
            st.markdown("**Version 1 — Original**")
            f1 = st.file_uploader("Upload V1", type=["pdf","docx","txt"], key="v1_file", label_visibility="collapsed")
            if f1: text1 = extract_text_from_file(f1); st.caption(f"{len(text1):,} chars")
            p1 = st.text_area("Paste V1", height=140, key="v1_paste", label_visibility="collapsed")
            if p1: text1 = p1

        with cv2:
            st.markdown("**Version 2 — Revised**")
            f2 = st.file_uploader("Upload V2", type=["pdf","docx","txt"], key="v2_file", label_visibility="collapsed")
            if f2: text2 = extract_text_from_file(f2); st.caption(f"{len(text2):,} chars")
            p2 = st.text_area("Paste V2", height=140, key="v2_paste", label_visibility="collapsed")
            if p2: text2 = p2

        if st.button("Compare Versions", type="primary", disabled=not (text1 and text2)):
            client, model_name = require_ai()
            with st.spinner("Comparing documents…"):
                result = compare_documents(truncate(text1), truncate(text2), client, model_name)

            if "error" in result:
                st.error(result["error"])
            else:
                st.markdown("---")
                impact = result.get("overall_impact","Unknown")
                impact_color = {"Major":"#fee2e2","Moderate":"#fef3c7","Minor":"#dcfce7"}.get(impact,"#f3f4f6")
                st.markdown(f"""<div style="background:{impact_color};padding:0.5rem 1rem;border-radius:8px;font-weight:600;margin-bottom:0.8rem">Overall impact: {impact}</div>""", unsafe_allow_html=True)
                st.info(result.get("change_summary",""))

                changes = result.get("significant_changes",[])
                if changes:
                    st.markdown("#### Significant changes")
                    st.dataframe(pd.DataFrame(changes), use_container_width=True, hide_index=True)

                nc, rc = st.columns(2)
                with nc:
                    for s in result.get("new_sections",[]):
                        st.success(f"+ {s}")
                with rc:
                    for s in result.get("removed_sections",[]):
                        st.error(f"− {s}")

                rec = result.get("recommendation","")
                if rec: st.warning(f"**Recommendation:** {rec}")

            st.markdown("#### Line diff")
            diff_lines = text_diff(text1[:5000], text2[:5000])
            if diff_lines:
                st.code("".join(diff_lines)[:8000], language="diff")
            else:
                st.success("No line-level differences detected.")
