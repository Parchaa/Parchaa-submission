import json
import time
import streamlit as st
import pandas as pd
from utils.file_handler import extract_text_from_file, truncate
from modules.classifier import classify_single, classify_batch

SEVERITY_COLORS = {
    "Death":                             "#7f1d1d",
    "Life-Threatening":                  "#991b1b",
    "Hospitalisation Required":          "#c2410c",
    "Persistent Disability/Incapacity":  "#b45309",
    "Congenital Anomaly/Birth Defect":   "#7e22ce",
    "Medically Important Event":         "#1e40af",
    "Other Non-Serious":                 "#166534",
}
PRIORITY_COLOR = {"URGENT":"#fee2e2","HIGH":"#ffedd5","MEDIUM":"#fef9c3","LOW":"#dcfce7"}
PRIORITY_TEXT  = {"URGENT":"#991b1b","HIGH":"#9a3412","MEDIUM":"#92400e","LOW":"#166534"}


def render(require_ai):
    st.markdown('<div class="page-title">SAE Classification</div>', unsafe_allow_html=True)
    st.markdown('<div class="page-sub">ICH E2A severity classification · causality assessment · duplicate detection · priority queue</div>', unsafe_allow_html=True)

    mode = st.segmented_control("Mode", ["Single case", "Batch"], default="Single case")

    # ── Single ─────────────────────────────────────────────────────────────
    if mode == "Single case":
        col_in, col_opt = st.columns([3, 1])
        with col_opt:
            input_method = st.radio("Input", ["Upload file", "Paste text"], label_visibility="visible", key="cls_method")

        with col_in:
            case_text = ""
            if input_method == "Upload file":
                f = st.file_uploader("Upload SAE report", type=["pdf","docx","txt"], label_visibility="collapsed", key="cls_file")
                if f:
                    case_text = extract_text_from_file(f)
                    st.caption(f"Loaded {len(case_text):,} chars from **{f.name}**")
            else:
                case_text = st.text_area("Paste case text", height=220, label_visibility="collapsed",
                                         placeholder="Patient: 45-year-old male. Drug X 500mg. On Day 3 developed…")

        if st.button("Classify Case", type="primary", disabled=not case_text, key="cls_run"):
            client, model_name = require_ai()
            t0 = time.time()
            with st.spinner("Classifying…"):
                result = classify_single(truncate(case_text), client, model_name)
            duration_ms = int((time.time() - t0) * 1000)

            if "error" in result:
                st.error(result["error"]); return

            if st.session_state.get("db_ok"):
                from database import log_job, save_result
                job_id = log_job("classification", "single_sae", duration_ms=duration_ms, file_size=len(case_text))
                save_result(job_id, "classification", result)

            st.markdown("---")
            severity = result.get("severity_class","Unknown")
            priority = result.get("priority","MEDIUM")
            sev_col  = SEVERITY_COLORS.get(severity, "#374151")
            pri_bg   = PRIORITY_COLOR.get(priority, "#f3f4f6")
            pri_txt  = PRIORITY_TEXT.get(priority, "#374151")

            c1, c2, c3, c4 = st.columns(4)
            with c1:
                st.markdown(f"""<div style="background:{sev_col};color:white;padding:0.8rem;border-radius:8px;text-align:center"><div style="font-size:0.75rem;opacity:0.8">SEVERITY</div><div style="font-weight:700;font-size:0.95rem;margin-top:2px">{severity}</div></div>""", unsafe_allow_html=True)
            with c2:
                st.markdown(f"""<div style="background:{pri_bg};color:{pri_txt};padding:0.8rem;border-radius:8px;text-align:center"><div style="font-size:0.75rem">PRIORITY</div><div style="font-weight:700;font-size:0.95rem;margin-top:2px">{priority}</div></div>""", unsafe_allow_html=True)
            with c3:
                st.metric("Severity score", f"{result.get('severity_score',0)} / 10")
            with c4:
                st.metric("Outcome", result.get("outcome","—"))

            ca, cb = st.columns(2)
            with ca:
                st.markdown(f"**Case ID:** {result.get('case_id','—')}")
                st.markdown(f"**Suspect drug:** {result.get('drug_suspect','—')}")
                st.markdown(f"**Event (PT):** {result.get('event_pt','—')}")
                st.markdown(f"**Causality:** {result.get('causality_assessment','—')}")
                criteria = result.get("seriousness_criteria", [])
                if criteria:
                    st.markdown("**ICH E2A criteria:** " + " · ".join(criteria))
            with cb:
                dup_risk = result.get("duplicate_risk","Low")
                dup_color = {"High":"#fee2e2","Medium":"#fef9c3","Low":"#dcfce7"}.get(dup_risk,"#f3f4f6")
                dup_text  = {"High":"#991b1b","Medium":"#92400e","Low":"#166534"}.get(dup_risk,"#374151")
                st.markdown(f"""<div style="background:{dup_color};color:{dup_text};padding:0.5rem 0.8rem;border-radius:6px;display:inline-block;font-weight:600;font-size:0.85rem">Duplicate risk: {dup_risk}</div>""", unsafe_allow_html=True)
                for d in result.get("duplicate_indicators", []):
                    st.markdown(f"<span style='font-size:0.85rem'>• {d}</span>", unsafe_allow_html=True)
                for flag in result.get("flags", []):
                    st.warning(f"🚩 {flag}")

            st.info(result.get("reviewer_priority_notes",""))

            st.download_button("⬇️ Download classification (JSON)", json.dumps(result, indent=2),
                               file_name="sae_classification.json", mime="application/json")

    # ── Batch ───────────────────────────────────────────────────────────────
    else:
        st.markdown("Upload multiple files or paste cases separated by `---`")
        col_a, col_b = st.columns(2)
        with col_a:
            batch_files = st.file_uploader("Upload reports", type=["pdf","docx","txt"],
                                           accept_multiple_files=True, label_visibility="collapsed")
        with col_b:
            batch_paste = st.text_area("Paste cases (--- as separator)", height=180, label_visibility="collapsed")

        reports = []
        if batch_files:
            reports = [extract_text_from_file(f) for f in batch_files]
            st.caption(f"{len(reports)} reports loaded from files")
        elif batch_paste:
            reports = [r.strip() for r in batch_paste.split("---") if r.strip()]
            st.caption(f"{len(reports)} cases detected")

        if st.button("Classify All", type="primary", disabled=not reports):
            client, model_name = require_ai()
            with st.spinner(f"Classifying {len(reports)} cases…"):
                results = classify_batch([truncate(r, 3000) for r in reports], client, model_name)

            if not results or (isinstance(results, list) and "error" in results[0]):
                st.error("Classification failed."); return

            if st.session_state.get("db_ok"):
                from database import log_job, save_result
                job_id = log_job("classification", "batch_sae", file_size=len(reports))
                save_result(job_id, "classification_batch", {"count": len(results), "results": results})

            st.markdown("---")
            st.markdown("#### Results")
            st.dataframe(pd.DataFrame(results), use_container_width=True, hide_index=True)

            urgent = [r for r in results if r.get("priority") == "URGENT"]
            if urgent:
                st.markdown("#### Urgent cases")
                for r in urgent:
                    st.error(f"Case {r.get('case_id', r.get('index','?'))} — {r.get('severity_class')} — {r.get('outcome')}")

            dups = [r for r in results if r.get("potential_duplicate_of")]
            if dups:
                st.markdown("#### Potential duplicates")
                for r in dups:
                    st.warning(f"Case {r.get('index')} ↔ cases {r.get('potential_duplicate_of')} — confidence: {r.get('duplicate_confidence')}")

            st.download_button("⬇️ Download batch results (JSON)", json.dumps(results, indent=2),
                               file_name="batch_classification.json", mime="application/json")
