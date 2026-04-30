import json
import time
import streamlit as st
from utils.file_handler import extract_text_from_file, truncate
from modules.inspection_report import generate_inspection_report, format_report_as_text

CAT_COLOR = {"Critical":"#fee2e2","Major":"#ffedd5","Minor":"#fef9c3","Observation":"#eff6ff"}
CAT_TEXT  = {"Critical":"#991b1b","Major":"#9a3412","Minor":"#92400e","Observation":"#1e40af"}
CAT_ICON  = {"Critical":"🔴","Major":"🟠","Minor":"🟡","Observation":"🔵"}


def render(require_ai):
    st.markdown('<div class="page-title">Inspection Report Generator</div>', unsafe_allow_html=True)
    st.markdown('<div class="page-sub">Convert unstructured field notes into formal CDSCO inspection reports with Critical / Major / Minor findings</div>', unsafe_allow_html=True)

    col_in, col_opt = st.columns([3, 1])

    with col_opt:
        insp_type = st.selectbox("Inspection type", [
            "GMP Inspection", "GCP Inspection", "Clinical Site Inspection",
            "Import License Inspection", "Market Authorisation Inspection", "Other",
        ])
        input_method = st.radio("Input", ["Paste text", "Upload file"], label_visibility="visible")

    with col_in:
        raw_text = ""
        if input_method == "Upload file":
            f = st.file_uploader("Upload observations", type=["txt","docx","pdf"], label_visibility="collapsed")
            if f:
                raw_text = extract_text_from_file(f)
                st.caption(f"Loaded {len(raw_text):,} chars from **{f.name}**")
        else:
            raw_text = st.text_area(
                "Paste raw field observations",
                height=260,
                label_visibility="collapsed",
                placeholder="""Visited ABC Pharma, Mumbai. Date: 22 April 2026.
- Raw material storage area dirty, temp log not maintained since Jan
- Batch record #4521 has overwritten entries without proper correction
- SOP for cleaning validation last updated 2018, not current
- Lab equipment calibration overdue for 3 instruments
- Two operators failed to demonstrate aseptic technique
- No deviation raised for equipment breakdown last month""",
            )

    if st.button("Generate Report", type="primary", disabled=not raw_text):
        client, model_name = require_ai()
        t0 = time.time()
        text_to_process = f"[Inspection Type: {insp_type}]\n\n{raw_text}"
        with st.spinner("Generating report…"):
            result = generate_inspection_report(truncate(text_to_process), client, model_name)
        duration_ms = int((time.time() - t0) * 1000)

        if "error" in result:
            st.error(result["error"]); return

        if st.session_state.get("db_ok"):
            from database import log_job, save_result
            job_id = log_job("inspection", insp_type, duration_ms=duration_ms, file_size=len(raw_text))
            save_result(job_id, "inspection", result)

        st.markdown("---")
        header = result.get("report_header", {})
        compliance = result.get("gmp_compliance", "N/A")
        comp_color = {"Compliant":"#166534","Conditionally Compliant":"#92400e","Non-Compliant":"#991b1b"}.get(compliance,"#374151")
        comp_bg    = {"Compliant":"#dcfce7","Conditionally Compliant":"#fef3c7","Non-Compliant":"#fee2e2"}.get(compliance,"#f3f4f6")

        c1, c2, c3, c4, c5 = st.columns(5)
        c1.metric("Critical", result.get("critical_findings_count", 0))
        c2.metric("Major",    result.get("major_findings_count",    0))
        c3.metric("Minor",    result.get("minor_findings_count",    0))
        c4.metric("Time", f"{duration_ms} ms")
        with c5:
            st.markdown(f"""<div style="background:{comp_bg};color:{comp_color};padding:0.7rem;border-radius:8px;font-weight:600;text-align:center;font-size:0.85rem">{compliance}</div>""", unsafe_allow_html=True)

        st.markdown(
            f"**Facility:** {header.get('facility_name','—')} &nbsp;|&nbsp; "
            f"**Date:** {header.get('inspection_date','—')} &nbsp;|&nbsp; "
            f"**Inspectors:** {', '.join(header.get('inspectors', [])) or '—'}"
        )
        st.info(result.get("executive_summary", ""))

        findings = result.get("findings", [])
        if findings:
            st.markdown("#### Findings")
            for f in findings:
                cat  = f.get("category","Observation")
                icon = CAT_ICON.get(cat,"⚪")
                bg   = CAT_COLOR.get(cat,"#f3f4f6")
                txt  = CAT_TEXT.get(cat,"#374151")
                with st.expander(f"{icon} [{f.get('finding_id','')}] {f.get('description','')[:90]}"):
                    ca, cb = st.columns(2)
                    with ca:
                        st.markdown(f"""<span style="background:{bg};color:{txt};padding:2px 8px;border-radius:4px;font-size:0.8rem;font-weight:600">{cat}</span>""", unsafe_allow_html=True)
                        st.markdown(f"**Risk:** {f.get('risk_level','—')}")
                        st.markdown(f"**Regulatory ref:** {f.get('regulatory_reference','—')}")
                    with cb:
                        if f.get("corrective_action_required"):
                            st.warning(f"**CAPA:** {f.get('proposed_capa','')}")
                        else:
                            st.success("No CAPA required")
                    st.markdown(f.get("description",""))

        recs = result.get("recommendations", [])
        if recs:
            st.markdown("#### Recommendations")
            for i, r in enumerate(recs, 1):
                st.markdown(f"{i}. {r}")

        if result.get("overall_assessment"):
            st.markdown("#### Overall assessment")
            st.markdown(result["overall_assessment"])

        if result.get("follow_up_required"):
            st.warning(f"⏰ **Follow-up required:** {result.get('follow_up_timeline','')}")

        st.markdown("---")
        formatted = format_report_as_text(result)
        cd1, cd2 = st.columns(2)
        with cd1:
            st.download_button("⬇️ Download report (TXT)", formatted,
                               file_name="inspection_report.txt", mime="text/plain")
        with cd2:
            st.download_button("⬇️ Download data (JSON)", json.dumps(result, indent=2),
                               file_name="inspection_report.json", mime="application/json")

        with st.expander("Preview formal report"):
            st.code(formatted, language=None)
