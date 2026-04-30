import { useState, useEffect } from 'react'
import { healthCheck } from '../lib/api'
import axios from 'axios'

export default function Dashboard() {
  const [jobs, setJobs] = useState([])
  const [health, setHealth] = useState(null)

  useEffect(() => {
    healthCheck().then(setHealth).catch(() => {})
    axios.get('/api/jobs?limit=8').then(r => setJobs(r.data.jobs || [])).catch(() => {})
  }, [])

  const features = [
    {
      icon: <ShieldIcon />,
      color: 'var(--accent)',
      bg: 'var(--accent-bg)',
      title: 'PII / PHI Anonymisation',
      desc: '3-layer hybrid pipeline: regex rules → Presidio NER → AI contextual detection. Supports reversible pseudonymisation and full irreversible redaction.',
      tags: ['Regex', 'NER', 'AI'],
    },
    {
      icon: <FileTextIcon />,
      color: 'var(--success)',
      bg: 'var(--success-bg)',
      title: 'Document Summarisation',
      desc: 'AI-powered summaries for SUGAM applications, SAE narrations, and clinical meeting transcripts with key findings extraction.',
      tags: ['SUGAM', 'SAE', 'Transcripts'],
    },
    {
      icon: <CheckSquareIcon />,
      color: 'var(--warning)',
      bg: 'var(--warning-bg)',
      title: 'Completeness Assessment',
      desc: 'Validate regulatory submissions against CDSCO checklists for CT/NDA/SAE applications. Side-by-side document comparison with change tracking.',
      tags: ['CT', 'NDA', 'SAE'],
    },
    {
      icon: <TagIcon />,
      color: 'var(--purple)',
      bg: 'var(--purple-bg)',
      title: 'SAE Classification',
      desc: 'Automatic severity classification per ICH E2A, duplicate detection via TF-IDF + AI blended scoring, and batch prioritisation.',
      tags: ['ICH E2A', 'Duplicates', 'Batch'],
    },
    {
      icon: <ClipboardIcon />,
      color: 'var(--danger)',
      bg: 'var(--danger-bg)',
      title: 'Inspection Report',
      desc: 'Generate structured GMP/GCP/GDP inspection reports with findings, CAPA recommendations, and regulatory references from raw notes.',
      tags: ['GMP', 'GCP', 'CAPA'],
    },
  ]

  const MODULE_COLOR = {
    anonymisation:     { color: 'var(--accent)',   bg: 'var(--accent-bg)',   label: 'Anonymisation' },
    summarisation:     { color: 'var(--success)',  bg: 'var(--success-bg)',  label: 'Summarisation' },
    completeness:      { color: 'var(--warning)',  bg: 'var(--warning-bg)', label: 'Completeness' },
    classification:    { color: 'var(--purple)',   bg: 'var(--purple-bg)',  label: 'Classification' },
    inspection_report: { color: 'var(--danger)',   bg: 'var(--danger-bg)',  label: 'Inspection' },
    duplicate:         { color: 'var(--purple)',   bg: 'var(--purple-bg)',  label: 'Duplicate Check' },
    comparison:        { color: 'var(--warning)',  bg: 'var(--warning-bg)', label: 'Comparison' },
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">CDSCO RegAI Platform</h1>
        <p className="page-subtitle">AI-driven regulatory workflow automation — India-AI Health Innovation Hackathon 2026</p>
      </div>

      <div className="stats-grid">
        {[
          { label: 'AI Modules',        value: '5',   color: 'var(--accent)',   bg: 'var(--accent-bg)',   icon: <GridIcon /> },
          { label: 'Detection Layers',  value: '3',   color: 'var(--success)',  bg: 'var(--success-bg)',  icon: <LayersIcon /> },
          { label: 'PII Types Caught',  value: '15+', color: 'var(--warning)',  bg: 'var(--warning-bg)', icon: <ShieldIcon /> },
          { label: 'File Formats',      value: 'PDF · DOCX · TXT', color: 'var(--purple)', bg: 'var(--purple-bg)', icon: <FileIcon /> },
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

      {/* Live activity + system status */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16 }}>

        {/* Recent jobs */}
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

        {/* System status */}
        <div className="card">
          <div className="card-title"><ZapIcon />System Status</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              {
                label: 'API',
                value: health ? 'Online' : 'Connecting…',
                ok: !!health,
              },
              {
                label: 'Database',
                value: health?.db ?? '—',
                ok: health?.db === 'connected',
              },
              {
                label: 'AI Model',
                value: health ? 'Active' : '—',
                ok: !!health,
              },
              {
                label: 'Storage',
                value: health?.s3 ?? '—',
                ok: health?.s3 === 'configured',
              },
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

function ShieldIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> }
function FileTextIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> }
function CheckSquareIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> }
function TagIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg> }
function ClipboardIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg> }
function ActivityIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> }
function GridIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> }
function LayersIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg> }
function FileIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg> }
function ZapIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> }
