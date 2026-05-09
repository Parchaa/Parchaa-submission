import { useState, useEffect, useCallback } from 'react'
import { getHistory, getHistoryItem } from '../lib/api'
import { FileTextIcon } from '../components/Icons'

const HistoryIcon = ({ size = 16, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={style}>
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
)

const FilterIcon = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
  </svg>
)

const MODULE_LABELS = {
  summarisation:     'Summarisation',
  inspection_report: 'Inspection Report',
  classification:    'SAE Classification',
  completeness:      'Completeness',
  anonymisation:     'Anonymisation',
  comparison:        'Comparison',
}

const MODULE_COLORS = {
  summarisation:     { badge: 'badge-blue',   color: 'var(--accent)' },
  inspection_report: { badge: 'badge-yellow', color: 'var(--warning)' },
  classification:    { badge: 'badge-red',    color: 'var(--danger)' },
  completeness:      { badge: 'badge-green',  color: 'var(--success)' },
  anonymisation:     { badge: 'badge-purple', color: 'var(--purple)' },
  comparison:        { badge: 'badge-blue',   color: 'var(--accent)' },
}

function timeAgo(iso) {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso + 'Z').getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)   return 'just now'
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function ResultPreview({ module, docType, result }) {
  if (!result) return <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No result data available.</div>

  const s = (label, value) => value ? (
    <div key={label} style={{ marginBottom: 6 }}>
      <span style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600 }}>{label}: </span>
      <span style={{ fontSize: 12, color: 'var(--text)' }}>{value}</span>
    </div>
  ) : null

  if (module === 'summarisation') {
    if (docType === 'SUGAM Application') return (
      <div>
        {s('Application', result.application_type)}
        {s('Applicant', result.applicant)}
        {s('Product', result.product)}
        {s('Recommendation', result.recommendation)}
        {result.missing_information?.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <span style={{ fontSize: 10, color: 'var(--danger)', fontWeight: 600 }}>MISSING: </span>
            <span style={{ fontSize: 12, color: 'var(--text)' }}>{result.missing_information.slice(0,2).join('; ')}{result.missing_information.length > 2 ? '…' : ''}</span>
          </div>
        )}
      </div>
    )
    if (docType === 'SAE Case Narration') return (
      <div>
        {s('Case ID', result.case_id)}
        {s('Suspect Drug', result.suspect_drug)}
        {s('Causality', result.causality)}
        {s('Outcome', result.outcome)}
        {s('Reporting', result.reporting_timeline)}
      </div>
    )
    return (
      <div>
        {s('Meeting Type', result.meeting_type)}
        {s('Date', result.meeting_date)}
        <div style={{ fontSize: 12, color: 'var(--text)', marginTop: 4 }}>{(result.executive_summary || '').slice(0, 200)}{result.executive_summary?.length > 200 ? '…' : ''}</div>
      </div>
    )
  }

  if (module === 'inspection_report') {
    const h = result.report_header || {}
    return (
      <div>
        {s('Facility', h.facility_name)}
        {s('Compliance', result.gmp_compliance)}
        <div style={{ fontSize: 12, color: 'var(--text)', marginTop: 4 }}>
          {result.critical_findings_count || 0} Critical · {result.major_findings_count || 0} Major · {result.minor_findings_count || 0} Minor
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{(result.executive_summary || '').slice(0, 180)}{result.executive_summary?.length > 180 ? '…' : ''}</div>
      </div>
    )
  }

  if (module === 'classification') return (
    <div>
      {s('Case ID', result.case_id)}
      {s('Severity', result.severity_class)}
      {s('Priority', result.priority)}
      {s('Suspect Drug', result.drug_suspect)}
      {s('Causality', result.causality_assessment)}
    </div>
  )

  if (module === 'completeness') {
    const pct = result.overall_completeness_pct ?? Math.round((result.score ?? 0) * 100)
    return (
      <div>
        {s('Checklist', result.checklist_type)}
        {s('Score', `${pct}%`)}
        {s('Status', result.status)}
        {result.critical_missing?.length > 0 && (
          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--danger)' }}>
            {result.critical_missing.length} critical item{result.critical_missing.length !== 1 ? 's' : ''} missing
          </div>
        )}
      </div>
    )
  }

  if (module === 'anonymisation') return (
    <div>
      {s('Entities Redacted', String(result.total_entities || 0))}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'monospace' }}>
        {(result.anonymized_text || '').slice(0, 200)}{result.anonymized_text?.length > 200 ? '…' : ''}
      </div>
    </div>
  )

  return <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Result stored. Download to view full output.</div>
}

export default function HistoryPage() {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [moduleFilter, setModuleFilter] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [expandedResult, setExpandedResult] = useState(null)
  const [loadingResult, setLoadingResult] = useState(false)
  const [downloading, setDownloading] = useState({})

  const fetchHistory = useCallback(async () => {
    setLoading(true)
    try {
      const { jobs: j } = await getHistory(moduleFilter, 100)
      setJobs(j || [])
    } catch {
      setJobs([])
    } finally {
      setLoading(false)
    }
  }, [moduleFilter])

  useEffect(() => { fetchHistory() }, [fetchHistory])

  const toggleExpand = async (job_id) => {
    if (expanded === job_id) {
      setExpanded(null)
      setExpandedResult(null)
      return
    }
    setExpanded(job_id)
    setExpandedResult(null)
    setLoadingResult(true)
    try {
      const data = await getHistoryItem(job_id)
      setExpandedResult(data)
    } catch {
      setExpandedResult(null)
    } finally {
      setLoadingResult(false)
    }
  }

  const handleDownload = async (job_id, format, filename, e) => {
    e.stopPropagation()
    const key = `${job_id}_${format}`
    setDownloading(d => ({ ...d, [key]: true }))
    try {
      const url = `/api/history/${job_id}/download/${format}`
      const a = document.createElement('a')
      a.href = url
      a.download = `CDSCO_${job_id}.${format}`
      a.click()
    } finally {
      setTimeout(() => setDownloading(d => { const n = {...d}; delete n[key]; return n }), 1000)
    }
  }

  const ALL_MODULES = Object.keys(MODULE_LABELS)

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Document History</h1>
        <p className="page-subtitle">
          All processed documents and their results — download TXT or PDF, or load any result back into its module
        </p>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <FilterIcon />
        <button
          className={`tab-btn${moduleFilter === '' ? ' active' : ''}`}
          onClick={() => setModuleFilter('')}
          style={{ fontSize: 12 }}
        >All</button>
        {ALL_MODULES.map(m => (
          <button
            key={m}
            className={`tab-btn${moduleFilter === m ? ' active' : ''}`}
            onClick={() => setModuleFilter(m)}
            style={{ fontSize: 12 }}
          >{MODULE_LABELS[m]}</button>
        ))}
        <button
          className="btn btn-secondary btn-sm"
          onClick={fetchHistory}
          style={{ marginLeft: 'auto' }}
        >Refresh</button>
      </div>

      {loading && (
        <div className="card loading-center" style={{ minHeight: 200 }}>
          <div className="spinner spinner-lg" />
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading history…</span>
        </div>
      )}

      {!loading && jobs.length === 0 && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 200, gap: 12 }}>
          <HistoryIcon size={40} style={{ color: 'var(--text-dim)' }} />
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No documents processed yet{moduleFilter ? ` in ${MODULE_LABELS[moduleFilter]}` : ''}.</p>
        </div>
      )}

      {!loading && jobs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Header row */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1.5fr 1fr auto', gap: 12, padding: '6px 14px', fontSize: 10, color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            <span>Filename / Document</span>
            <span>Module</span>
            <span>Type</span>
            <span>Date</span>
            <span>Downloads</span>
          </div>

          {jobs.map(job => {
            const mc = MODULE_COLORS[job.module] || { badge: 'badge-blue' }
            const isExp = expanded === job.job_id
            const dlKey_txt = `${job.job_id}_txt`
            const dlKey_pdf = `${job.job_id}_pdf`
            return (
              <div key={job.job_id}>
                <div
                  onClick={() => toggleExpand(job.job_id)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1.2fr 1.5fr 1fr auto',
                    gap: 12,
                    padding: '10px 14px',
                    background: isExp ? 'var(--bg-hover)' : 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderBottom: isExp ? 'none' : '1px solid var(--border)',
                    borderRadius: isExp ? '8px 8px 0 0' : 8,
                    cursor: 'pointer',
                    alignItems: 'center',
                    transition: 'background 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <FileTextIcon size={14} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: 'var(--text-heading)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {job.filename || `Document ${job.job_id.slice(0,8)}`}
                    </span>
                  </div>
                  <span className={`badge ${mc.badge}`} style={{ fontSize: 10, justifySelf: 'start' }}>
                    {MODULE_LABELS[job.module] || job.module}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {job.doc_type || '—'}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{timeAgo(job.created_at)}</span>
                  <div style={{ display: 'flex', gap: 5 }} onClick={e => e.stopPropagation()}>
                    {job.has_result && (
                      <>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '3px 8px', fontSize: 11 }}
                          disabled={downloading[dlKey_txt]}
                          onClick={(e) => handleDownload(job.job_id, 'txt', job.filename, e)}
                        >TXT</button>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '3px 8px', fontSize: 11 }}
                          disabled={downloading[dlKey_pdf]}
                          onClick={(e) => handleDownload(job.job_id, 'pdf', job.filename, e)}
                        >PDF</button>
                      </>
                    )}
                  </div>
                </div>

                {isExp && (
                  <div style={{
                    padding: '14px 16px',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border)',
                    borderTop: 'none',
                    borderRadius: '0 0 8px 8px',
                    marginBottom: 0,
                  }}>
                    <div style={{ display: 'flex', gap: 10, marginBottom: 10, fontSize: 11, color: 'var(--text-dim)' }}>
                      <span>Job: <code style={{ fontSize: 10 }}>{job.job_id}</code></span>
                      <span>·</span>
                      <span>{job.created_at ? new Date(job.created_at + 'Z').toLocaleString() : '—'}</span>
                      {job.duration_ms > 0 && <><span>·</span><span>{(job.duration_ms/1000).toFixed(1)}s</span></>}
                    </div>
                    {loadingResult ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="spinner" /><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading result…</span>
                      </div>
                    ) : (
                      <ResultPreview
                        module={job.module}
                        docType={job.doc_type}
                        result={expandedResult?.result}
                      />
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
