import { useState, useEffect } from 'react'
import { getHistory, getHistoryItem } from '../lib/api'

const ClockIcon = ({ size = 14, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={style}>
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
)

const ChevronDownIcon = ({ size = 13, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={style}>
    <polyline points="6 9 12 15 18 9"/>
  </svg>
)

function timeAgo(iso) {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso + 'Z').getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)   return 'just now'
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

/**
 * Compact history panel for module pages.
 * Props:
 *   module  — DB module name (e.g. "summarisation", "inspection_report")
 *   onLoad  — callback(jobData) called when user clicks Load
 *             jobData = { job_id, module, doc_type, filename, result, created_at }
 */
export default function HistoryPanel({ module, onLoad }) {
  const [open, setOpen] = useState(false)
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadingId, setLoadingId] = useState(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    getHistory(module, 8)
      .then(({ jobs: j }) => setJobs((j || []).filter(x => x.has_result)))
      .catch(() => setJobs([]))
      .finally(() => setLoading(false))
  }, [open, module])

  const handleLoad = async (job_id) => {
    setLoadingId(job_id)
    try {
      const data = await getHistoryItem(job_id)
      if (data.result && onLoad) onLoad(data)
    } finally {
      setLoadingId(null)
    }
  }

  return (
    <div className="card" style={{ marginBottom: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          color: 'var(--text-heading)', fontSize: 13, fontWeight: 600,
        }}
      >
        <ClockIcon style={{ color: 'var(--text-dim)' }} />
        Recent Documents
        <ChevronDownIcon style={{
          marginLeft: 'auto', color: 'var(--text-dim)',
          transform: open ? 'rotate(180deg)' : 'rotate(0)',
          transition: 'transform 0.2s',
        }} />
      </button>

      {open && (
        <div style={{ marginTop: 12 }}>
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
              <div className="spinner" />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading…</span>
            </div>
          )}

          {!loading && jobs.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 0' }}>
              No history yet. Process a document to see it here.
            </p>
          )}

          {!loading && jobs.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {jobs.map(job => (
                <div
                  key={job.job_id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '7px 10px', background: 'var(--bg-input)',
                    borderRadius: 6, border: '1px solid var(--border)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-heading)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {job.filename || `Document ${job.job_id.slice(0,8)}`}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                      {job.doc_type && <span>{job.doc_type} · </span>}
                      {timeAgo(job.created_at)}
                    </div>
                  </div>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '3px 10px', fontSize: 11, flexShrink: 0 }}
                    disabled={loadingId === job.job_id}
                    onClick={() => handleLoad(job.job_id)}
                  >
                    {loadingId === job.job_id ? <><div className="spinner" style={{ width: 10, height: 10 }} />Loading</> : 'Load'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
