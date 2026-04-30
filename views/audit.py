import streamlit as st
import pandas as pd


def render():
    st.markdown('<div class="page-title">Audit Log</div>', unsafe_allow_html=True)
    st.markdown('<div class="page-sub">Processing history stored in PostgreSQL</div>', unsafe_allow_html=True)

    db_ok = st.session_state.get("db_ok", False)
    s3_ok = st.session_state.get("s3_ok", False)

    # ── Infrastructure status ──────────────────────────────────────────────
    c1, c2, c3 = st.columns(3)
    with c1:
        from config import DATABASE_URL
        status = "Connected" if db_ok else "Offline"
        color  = "#dcfce7" if db_ok else "#fee2e2"
        tcolor = "#166534" if db_ok else "#991b1b"
        st.markdown(f"""
<div class="card" style="border-left:3px solid {'#22c55e' if db_ok else '#ef4444'}">
  <div class="card-title">🗄️ PostgreSQL</div>
  <div style="background:{color};color:{tcolor};padding:2px 8px;border-radius:4px;display:inline-block;font-size:0.8rem;font-weight:600">{status}</div>
  <p style="font-size:0.8rem;color:#64748b;margin:0.4rem 0 0;word-break:break-all">{DATABASE_URL}</p>
</div>""", unsafe_allow_html=True)

    with c2:
        from config import S3_BUCKET, AWS_REGION
        s3_status = "Connected" if s3_ok else "Not configured"
        s3_color  = "#dcfce7" if s3_ok else "#f1f5f9"
        s3_tcolor = "#166534" if s3_ok else "#374151"
        st.markdown(f"""
<div class="card" style="border-left:3px solid {'#22c55e' if s3_ok else '#94a3b8'}">
  <div class="card-title">☁️ AWS S3</div>
  <div style="background:{s3_color};color:{s3_tcolor};padding:2px 8px;border-radius:4px;display:inline-block;font-size:0.8rem;font-weight:600">{s3_status}</div>
  <p style="font-size:0.8rem;color:#64748b;margin:0.4rem 0 0">{S3_BUCKET or '—'} · {AWS_REGION}</p>
</div>""", unsafe_allow_html=True)

    with c3:
        from config import GEMINI_API_KEY, GEMINI_MODEL
        ai_ok = bool(GEMINI_API_KEY)
        st.markdown(f"""
<div class="card" style="border-left:3px solid {'#22c55e' if ai_ok else '#ef4444'}">
  <div class="card-title">🤖 Gemini AI</div>
  <div style="background:{'#dcfce7' if ai_ok else '#fee2e2'};color:{'#166534' if ai_ok else '#991b1b'};padding:2px 8px;border-radius:4px;display:inline-block;font-size:0.8rem;font-weight:600">{'Ready' if ai_ok else 'API key missing in .env'}</div>
  <p style="font-size:0.8rem;color:#64748b;margin:0.4rem 0 0">{GEMINI_MODEL}</p>
</div>""", unsafe_allow_html=True)

    st.markdown("---")

    # ── Audit table ────────────────────────────────────────────────────────
    if not db_ok:
        st.info("PostgreSQL is offline. Add `DATABASE_URL` to your `.env` file — the Docker command is in docker-compose.yml.")
        return

    from database import recent_jobs
    jobs = recent_jobs(100)

    if not jobs:
        st.info("No processing jobs yet. Run a module to see records here.")
        return

    st.markdown(f"#### Recent jobs &nbsp; <span style='font-size:0.85rem;color:#64748b'>({len(jobs)} records)</span>", unsafe_allow_html=True)

    df = pd.DataFrame(jobs)

    # Module filter
    modules = ["All"] + sorted(df["module"].unique().tolist())
    selected = st.selectbox("Filter by module", modules, label_visibility="visible")
    if selected != "All":
        df = df[df["module"] == selected]

    st.dataframe(
        df.style.map(
            lambda v: "color:#166534;font-weight:600" if v == "completed" else "color:#991b1b",
            subset=["status"],
        ),
        use_container_width=True,
        hide_index=True,
    )

    st.download_button(
        "⬇️ Export audit log (CSV)",
        df.to_csv(index=False),
        file_name="audit_log.csv",
        mime="text/csv",
    )
