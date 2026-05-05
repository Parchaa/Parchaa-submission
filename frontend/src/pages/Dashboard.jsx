import { useState, useEffect } from 'react'
import { healthCheck } from '../lib/api'
import axios from 'axios'
import {
  ShieldIcon, FileTextIcon, CheckSquareIcon, TagIcon, ClipboardIcon,
  ActivityIcon, GridIcon, LayersIcon, FileIcon, ZapIcon, GitMergeIcon,
} from '../components/Icons'

const features = [
  {
    icon: <ShieldIcon />,
    color: 'var(--accent)',
    bg: 'var(--accent-bg)',
    title: 'PII / PHI Anonymisation',
    desc: '3-layer hybrid pipeline: regex rules → Presidio NER → AI contextual detection. Supports reversible pseudonymisation and irreversible redaction.',
    tags: ['Regex', 'NER', 'AI', 'DPDP Act'],
  },
  {
    icon: <FileTextIcon />,
    color: 'var(--success)',
    bg: 'var(--success-bg)',
    title: 'Document Summarisation',
    desc: 'Structured AI summaries for SUGAM applications, SAE narrations, and clinical meeting transcripts — key findings extracted in seconds.',
    tags: ['SUGAM', 'SAE', 'Transcripts'],
  },
  {
    icon: <CheckSquareIcon />,
    color: 'var(--warning)',
    bg: 'var(--warning-bg)',
    title: 'Completeness Assessment',
    desc: 'Validate regulatory submissions against CDSCO checklists for CT, NDA, and SAE applications. Surfaces missing items and critical gaps instantly.',
    tags: ['CT', 'NDA', 'SAE', 'Schedule Y'],
  },
  {
    icon: <GitMergeIcon />,
    color: 'var(--purple)',
    bg: 'var(--purple-bg)',
    title: 'Document Comparison',
    desc: 'Semantic diff of regulatory document versions — identifies substantive amendments with impact classification and regulatory significance.',
    tags: ['Protocol', 'Amendment', 'Semantic Diff'],
  },
  {
    icon: <TagIcon />,
    color: 'var(--danger)',
    bg: 'var(--danger-bg)',
    title: 'SAE Classification',
    desc: 'ICH E2A severity grading, WHO-UMC causality assessment, TF-IDF + AI duplicate detection, and automated batch prioritisation.',
    tags: ['ICH E2A', 'WHO-UMC', 'Duplicates', 'Batch'],
  },
  {
    icon: <ClipboardIcon />,
    color: '#e879f9',
    bg: 'rgba(232,121,249,0.1)',
    title: 'Inspection Report',
    desc: 'Convert raw GMP / GCP / GDP field notes into structured CDSCO-format reports with findings, risk classification, and CAPA recommendations.',
    tags: ['GMP', 'GCP', 'CAPA', 'Schedule M'],
  },
]

const MODULE_COLOR = {
  anonymisation:     { color: 'var(--accent)',   bg: 'var(--accent-bg)',   label: 'Anonymisation' },
  summarisation:     { color: 'var(--success)',  bg: 'var(--success-bg)',  label: 'Summarisation' },
  completeness:      { color: 'var(--warning)',  bg: 'var(--warning-bg)', label: 'Completeness' },
  classification:    { color: 'var(--purple)',   bg: 'var(--purple-bg)',  label: 'Classification' },
  inspection_report: { color: '#e879f9',         bg: 'rgba(232,121,249,0.1)', label: 'Inspection' },
  duplicate:         { color: 'var(--purple)',   bg: 'var(--purple-bg)',  label: 'Duplicate Check' },
  comparison:        { color: 'var(--warning)',  bg: 'var(--warning-bg)', label: 'Comparison' },
}

export default function Dashboard() {
  const [jobs, setJobs] = useState([])
  const [health, setHealth] = useState(null)

  useEffect(() => {
    healthCheck().then(setHealth).catch(() => {})
    axios.get('/api/jobs?limit=8').then(r => setJobs(r.data.jobs || [])).catch(() => {})
  }, [])

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">CDSCO RegAI Platform</h1>
        <p className="page-subtitle">AI-driven regulatory workflow automation — India-AI Health Innovation Hackathon 2026</p>
      </div>

      <div className="stats-grid">
        {[
          { label: 'AI Modules',       value: '6',   color: 'var(--accent)',   bg: 'var(--accent-bg)',   icon: <GridIcon /> },
          { label: 'Detection Layers', value: '3',   color: 'var(--success)',  bg: 'var(--success-bg)',  icon: <LayersIcon /> },
          { label: 'PII Types Caught', value: '15+', color: 'var(--warning)',  bg: 'var(--warning-bg)', icon: <ShieldIcon /> },
          { label: 'File Formats',     value: 'PDF · DOCX · TXT', color: 'var(--purple)', bg: 'var(--purple-bg)', icon: <FileIcon /> },
        ].map(s => (
          <div className="stat-card" key={s.label}>
            <div className="stat-card-icon" style={{ background: s.bg, color: s.color }}>{s.icon}</div>
            <div className="stat-value" style={{ color: s.color, fontSize: s.value.length > 3 ? 15 : undefined }}>{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: '24px' }}>
        <div className="card-title"><GridIcon />Available Modules</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '14px' }}>
          {features.map(f => (
            <div key={f.title} style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: f.bg, color: f.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {f.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-heading)', fontSize: 13, marginBottom: 4 }}>{f.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 8 }}>{f.desc}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {f.tags.map(t => (
                      <span key={t} style={{ fontSize: 10, padding: '2px 7px', background: f.bg, color: f.color, borderRadius: 100, fontWeight: 500 }}>{t}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16 }}>
        <div className="card">
          <div className="card-title"><ActivityIcon />Recent Activity</div>
          {jobs.length === 0 ? (
            <div style={{ color: 'var(--text-dim)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
              No jobs yet — process a document to see activity here.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {jobs.map((job, i) => {
                const m = MODULE_COLOR[job.module] || { color: 'var(--text-muted)', bg: 'var(--bg-input)', label: job.module }
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', background: 'var(--bg-input)', borderRadius: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 100, background: m.bg, color: m.color, flexShrink: 0 }}>
                      {m.label}
                    </span>
                    {job.doc_type && (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {job.doc_type}
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>
                      {job.duration_ms ? `${(job.duration_ms / 1000).toFixed(1)}s` : '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title"><ZapIcon />System Status</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'API',      value: health ? 'Online' : 'Connecting…', ok: !!health },
              { label: 'Database', value: health?.db ?? '—',                 ok: health?.db === 'connected' },
              { label: 'AI Model', value: health ? 'Active' : '—', ok: !!health },
              { label: 'Storage',  value: health?.s3 ?? '—',                 ok: health?.s3 === 'configured' },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-input)', borderRadius: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{row.label}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: row.ok ? 'var(--success)' : 'var(--text-dim)' }}>
                  {row.ok ? '● ' : '○ '}{row.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
