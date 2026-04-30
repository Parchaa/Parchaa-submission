import time
import streamlit as st
import pandas as pd
from utils.file_handler import extract_text_from_file, truncate
from modules.anonymizer import run_anonymisation


def render(require_ai):
    st.markdown('<div class="page-title">PII / PHI Anonymisation</div>', unsafe_allow_html=True)
    st.markdown('<div class="page-sub">Three-layer hybrid pipeline: Regex → Presidio NER → Gemini AI &nbsp;|&nbsp; DPDP Act 2023 compliant</div>', unsafe_allow_html=True)

    # ── Input ──────────────────────────────────────────────────────────────
    col_input, col_options = st.columns([3, 1])

    with col_options:
        st.markdown("**Mode**")
        mode = st.radio(
            "",
            ["Pseudonymise", "Full Anonymisation"],
            label_visibility="collapsed",
            help="Pseudonymise = reversible tokens stored in DB. Full = irreversible, safe for public release.",
        )
        mode_key = "pseudonymise" if mode == "Pseudonymise" else "full"

        st.markdown("**Input type**")
        input_type = st.radio("", ["Upload file", "Paste text"], label_visibility="collapsed")

    with col_input:
        input_text = ""
        filename = "input.txt"

        if input_type == "Upload file":
            uploaded = st.file_uploader(
                "Upload document",
                type=["pdf", "docx", "txt", "csv", "xlsx"],
                label_visibility="collapsed",
            )
            if uploaded:
                with st.spinner("Extracting text…"):
                    input_text = extract_text_from_file(uploaded)
                filename = uploaded.name
                st.caption(f"Extracted {len(input_text):,} characters from **{uploaded.name}**")
        else:
            input_text = st.text_area(
                "Paste document text",
                height=220,
                placeholder="Patient Name: Rajesh Kumar, DOB: 15/04/1985, Aadhaar: 2345 6789 0123…",
                label_visibility="collapsed",
            )

    # ── Run ────────────────────────────────────────────────────────────────
    run = st.button("Run Anonymisation", type="primary", disabled=not input_text)

    if run:
        client, model_name = require_ai()
        t0 = time.time()
        with st.spinner("Running pipeline…"):
            result = run_anonymisation(truncate(input_text), client, model_name, mode_key)
        duration_ms = int((time.time() - t0) * 1000)

        # Persist
        job_id = None
        if st.session_state.get("db_ok"):
            from database import log_job, save_tokens, save_result
            job_id = log_job("anonymisation", mode_key, filename, len(input_text), duration_ms=duration_ms)
            save_tokens(job_id, result["rule_matches"])
            save_result(job_id, "anonymisation", {"entity_counts": {
                "regex": len(result["rule_matches"]),
                "presidio": len(result["layer2_result"].get("entities_found", [])),
                "gemini": len(result["layer3_matches"]),
            }})

        if st.session_state.get("s3_connected") and job_id:
            from storage import S3Client, store_job_artifacts
            from database import save_s3_artifact
            s3 = S3Client(st.session_state["s3_bucket"], st.session_state["aws_key"],
                          st.session_state["aws_secret"], st.session_state.get("s3_region", "ap-south-1"))
            keys = store_job_artifacts(s3, job_id, "anonymisation",
                                       input_text=input_text, report_text=result["final_text"], filename=filename)
            for atype, key in keys.items():
                save_s3_artifact(job_id, st.session_state["s3_bucket"], key, atype)

        st.markdown("---")

        # ── Metrics ────────────────────────────────────────────────────────
        all_entities = result.get("all_entities", [])
        l1 = sum(1 for e in all_entities if "Regex" in e["layer"])
        l2 = sum(1 for e in all_entities if "Presidio" in e["layer"])
        l3 = sum(1 for e in all_entities if "Gemini" in e["layer"])

        c1, c2, c3, c4, c5 = st.columns(5)
        c1.metric("Layer 1 — Regex", l1)
        c2.metric("Layer 2 — Presidio NER", l2)
        c3.metric("Layer 3 — Gemini AI", l3)
        c4.metric("Total entities", l1 + l2 + l3)
        c5.metric("Processing time", f"{duration_ms} ms")

        # ── Side-by-side ────────────────────────────────────────────────────
        st.markdown("#### Before / After")
        ca, cb = st.columns(2)
        with ca:
            st.markdown("**Original**")
            st.text_area("", input_text[:3000], height=260, label_visibility="collapsed", key="orig_txt")
        with cb:
            st.markdown("**Anonymised**")
            st.text_area("", result["final_text"][:3000], height=260, label_visibility="collapsed", key="anon_txt")

        st.download_button("⬇️ Download anonymised text", result["final_text"],
                           file_name="anonymised.txt", mime="text/plain")

        # ── Entity table ────────────────────────────────────────────────────
        if all_entities:
            st.markdown("#### Detected entities")
            df = pd.DataFrame(all_entities)[["layer", "category", "value", "confidence"]]
            layer_colors = {
                "1 — Regex": "background-color:#eff6ff",
                "2 — Presidio/NER": "background-color:#faf5ff",
                "3 — Gemini AI": "background-color:#f0fdf4",
            }
            st.dataframe(
                df.style.map(lambda v: layer_colors.get(v, ""), subset=["layer"]),
                use_container_width=True, hide_index=True,
            )
