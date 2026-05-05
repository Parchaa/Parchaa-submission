import { useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { assessCompleteness, compareDocuments, uploadFile } from '../lib/api'
import {
  CheckIcon, CheckCircleIcon, XCircleIcon, AlertCircleIcon, MinusIcon,
  ZapIcon, AlertIcon, ListIcon, LightbulbIcon, GitIcon, DiffIcon, CodeIcon,
  DocAIcon, DocBIcon, CopyIcon, DownloadIcon,
} from '../components/Icons'

const CHECKLIST_TYPES = [
  'Clinical Trial Application',
  'New Drug Application',
  'SAE Report',
]

const STATUS_STYLE = {
  Present:          { badge: 'badge-green',  icon: <CheckCircleIcon /> },
  Partial:          { badge: 'badge-yellow', icon: <AlertCircleIcon /> },
  Missing:          { badge: 'badge-red',    icon: <XCircleIcon /> },
  'Not Applicable': { badge: 'badge-purple', icon: <MinusIcon /> },
}

function ScoreBar({ pct }) {
  const cls      = pct >= 80 ? 'high'       : pct >= 50 ? 'medium'          : 'low'
  const badgeCls = pct >= 80 ? 'badge-green' : pct >= 50 ? 'badge-yellow'   : 'badge-red'
  const label    = pct >= 80 ? 'Complete'    : pct >= 50 ? 'Mostly Complete' : 'Incomplete'
  return (
    <div className="score-meter">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 }}>
        <div className="score-value">{pct}%</div>
        <span className={`badge ${badgeCls}`}>{label}</span>
      </div>
      <div className="score-bar-bg">
        <div className={`score-bar-fill ${cls}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// Custom hook — wraps useDropzone with upload-on-drop behaviour
function useUploadDropzone(setter, setError) {
  return useDropzone({
    onDrop: async (files) => {
      if (!files[0]) return
      try {
        const { text } = await uploadFile(files[0])
        setter(text)
      } catch (e) {
        setError('Upload failed: ' + e.message)
      }
    },
    multiple: false,
  })
}

function formatResult(result) {
  const sep = '='.repeat(60)
  const sub = '-'.repeat(40)
  const lines = [sep, 'CDSCO RegAI — Completeness & Comparison', sep, '']

  if (result.type === 'completeness') {
    const d = result.data
    const pct = d.overall_completeness_pct ?? Math.round((d.score ?? 0) * 100)
    lines.push(`Checklist Type   : ${d.checklist_type || ''}`)
    lines.push(`Completeness     : ${pct}%`)
    if (d.status)          lines.push(`Status           : ${d.status}`)
    if (d.reviewer_action) lines.push(`Reviewer Action  : ${d.reviewer_action}`)
    lines.push('')
    if (d.items?.length) {
      lines.push('CHECKLIST ITEMS', sub)
      d.items.forEach(item => {
        const mark = item.status === 'Present' ? '✓' : item.status === 'Partial' ? '~' : item.status === 'Not Applicable' ? '-' : '✗'
        lines.push(`  [${mark}] ${item.item}${item.notes ? ` — ${item.notes}` : ''}  (${item.status})`)
      })
      lines.push('')
    }
    if (d.critical_missing?.length) {
      lines.push('CRITICAL — MUST FIX BEFORE APPROVAL', sub)
      d.critical_missing.forEach((m, i) => lines.push(`  ${i+1}. ${m}`))
      lines.push('')
    }
    if (d.recommendations?.length) {
      lines.push('RECOMMENDATIONS', sub)
      d.recommendations.forEach((r, i) => lines.push(`  ${i+1}. ${r}`))
      lines.push('')
    }
  } else {
    const d = result.data
    lines.push(`Overall Impact   : ${d.overall_impact || '—'}`)
    lines.push(`Recommendation   : ${d.recommendation || '—'}`)
    lines.push('')
    if (d.change_summary) { lines.push('CHANGE SUMMARY', sub, d.change_summary, '') }
    if (d.significant_changes?.length) {
      lines.push('SIGNIFICANT CHANGES', sub)
      d.significant_changes.forEach(c => {
        lines.push(`  [${c.section}] ${c.type} — ${c.impact} Impact`)
        lines.push(`    ${c.description}`)
        if (c.regulatory_significance) lines.push(`    Regulatory: ${c.regulatory_significance}`)
      })
      lines.push('')
    }
    if (d.new_sections?.length)     { lines.push('ADDED SECTIONS', sub); d.new_sections.forEach(s => lines.push(`  + ${s}`)); lines.push('') }
    if (d.removed_sections?.length) { lines.push('REMOVED SECTIONS', sub); d.removed_sections.forEach(s => lines.push(`  - ${s}`)); lines.push('') }
  }
  return lines.join('\n')
}

export default function CompletenessPage() {
  const [activeTab, setActiveTab] = useState('completeness')
  const [text, setText] = useState('')
  const [checklistType, setChecklistType] = useState('Clinical Trial Application')
  const [doc1, setDoc1] = useState('')
  const [doc2, setDoc2] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const dzText = useUploadDropzone(setText, setError)
  const dz1    = useUploadDropzone(setDoc1, setError)
  const dz2    = useUploadDropzone(setDoc2, setError)

  const copyResult = () => {
    if (!result) return
    navigator.clipboard.writeText(formatResult(result))
  }

  const downloadResult = () => {
    if (!result) return
    const content = formatResult(result)
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `CDSCO_${result.type === 'completeness' ? 'Completeness' : 'Comparison'}_${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const run = async () => {
    setLoading(true)
    setError('')
    setResult(null)
    try {
      if (activeTab === 'completeness') {
        const r = await assessCompleteness(text, checklistType)
        setResult({ type: 'completeness', data: r })
      } else {
        const r = await compareDocuments(doc1, doc2)
        setResult({ type: 'compare', data: r })
      }
    } catch (e) {
      setError(e.response?.data?.detail || e.message)
    } finally {
      setLoading(false)
    }
  }

  const canRun = activeTab === 'completeness'
    ? !!text.trim()
    : !!(doc1.trim() && doc2.trim())

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Completeness & Comparison</h1>
        <p className="page-subtitle">
          Validate submissions against CDSCO checklists · Compare document versions with intelligent diff
        </p>
      </div>

      <div className="tabs">
        <button className={`tab-btn${activeTab === 'completeness' ? ' active' : ''}`} onClick={() => { setActiveTab('completeness'); setResult(null) }}>
          Completeness Check
        </button>
        <button className={`tab-btn${activeTab === 'compare' ? ' active' : ''}`} onClick={() => { setActiveTab('compare'); setResult(null) }}>
          Document Comparison
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* ── Input section ── */}
        {activeTab === 'completeness' ? (
          <div className="card">
            <div className="card-title"><CheckIcon />Completeness Check</div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Checklist Type</label>
              <select className="form-select" value={checklistType} onChange={e => setChecklistType(e.target.value)}>
                {CHECKLIST_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div {...dzText.getRootProps()} className={`dropzone${dzText.isDragActive ? ' active' : ''}`} style={{ marginBottom: 10 }}>
              <input {...dzText.getInputProps()} />
              <div className="dropzone-text">Drop or <span>browse</span></div>
              <div className="dropzone-hint">PDF · DOCX · TXT</div>
            </div>
            <textarea
              className="form-textarea"
              style={{ minHeight: 200 }}
              placeholder="Paste the submission document text…"
              value={text}
              onChange={e => setText(e.target.value)}
            />
            {text.length > 150000 && (
              <div className="alert alert-warning" style={{ marginTop: 8 }}>
                <AlertIcon />Document exceeds 150,000 characters — content will be truncated before processing.
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="card">
              <div className="card-title"><DocAIcon />Version 1 (Original)</div>
              <div {...dz1.getRootProps()} className={`dropzone${dz1.isDragActive ? ' active' : ''}`} style={{ marginBottom: 10 }}>
                <input {...dz1.getInputProps()} />
                <div className="dropzone-text">Drop or <span>browse</span></div>
                <div className="dropzone-hint">PDF · DOCX · TXT</div>
              </div>
              <textarea className="form-textarea" style={{ minHeight: 180 }} placeholder="Paste original version…" value={doc1} onChange={e => setDoc1(e.target.value)} />
              {doc1.length > 150000 && (
                <div className="alert alert-warning" style={{ marginTop: 8 }}>
                  <AlertIcon />Version 1 exceeds 150,000 characters — will be truncated.
                </div>
              )}
            </div>
            <div className="card">
              <div className="card-title"><DocBIcon />Version 2 (Revised)</div>
              <div {...dz2.getRootProps()} className={`dropzone${dz2.isDragActive ? ' active' : ''}`} style={{ marginBottom: 10 }}>
                <input {...dz2.getInputProps()} />
                <div className="dropzone-text">Drop or <span>browse</span></div>
                <div className="dropzone-hint">PDF · DOCX · TXT</div>
              </div>
              <textarea className="form-textarea" style={{ minHeight: 180 }} placeholder="Paste revised version…" value={doc2} onChange={e => setDoc2(e.target.value)} />
              {doc2.length > 150000 && (
                <div className="alert alert-warning" style={{ marginTop: 8 }}>
                  <AlertIcon />Version 2 exceeds 150,000 characters — will be truncated.
                </div>
              )}
            </div>
          </>
        )}

        <button className="btn btn-primary btn-full" onClick={run} disabled={loading || !canRun}>
          {loading
            ? <><div className="spinner" />Analysing…</>
            : <><ZapIcon />{activeTab === 'completeness' ? 'Check Completeness' : 'Compare Versions'}</>
          }
        </button>
        {error && <div className="alert alert-error"><AlertIcon />{error}</div>}

        {/* ── Results section ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {result && !loading && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-secondary btn-sm" onClick={copyResult}><CopyIcon />Copy result</button>
              <button className="btn btn-secondary btn-sm" onClick={downloadResult}><DownloadIcon />Download .txt</button>
            </div>
          )}
          {loading && (
            <div className="card loading-center" style={{ minHeight: 200 }}>
              <div className="spinner spinner-lg" />
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Analysing document…</span>
            </div>
          )}

          {/* ── Completeness results ── */}
          {result?.type === 'completeness' && !loading && (() => {
            const d = result.data
            const pct = d.overall_completeness_pct ?? Math.round((d.score ?? 0) * 100)
            return (
              <>
                <div className="card">
                  <div className="card-title"><CheckIcon />Completeness Score — {checklistType}</div>
                  <ScoreBar pct={pct} />
                  {d.status && <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-muted)' }}>Status: <strong style={{ color: 'var(--text-heading)' }}>{d.status}</strong></div>}
                  {d.reviewer_action && <div style={{ marginTop: 8, padding: '8px 12px', background: 'var(--accent-bg)', borderRadius: 6, fontSize: 12, color: 'var(--accent)', borderLeft: '3px solid var(--accent)' }}>{d.reviewer_action}</div>}
                </div>

                {d.items?.length > 0 && (
                  <div className="card">
                    <div className="card-title"><ListIcon />Checklist — Item by Item</div>
                    <div className="checklist">
                      {d.items.map((item, i) => {
                        const style = STATUS_STYLE[item.status] || STATUS_STYLE['Missing']
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 12px', background: 'var(--bg-input)', borderRadius: 6, marginBottom: 4 }}>
                            <span style={{ color: item.status === 'Present' ? 'var(--success)' : item.status === 'Partial' ? 'var(--warning)' : item.status === 'Not Applicable' ? 'var(--text-dim)' : 'var(--danger)', flexShrink: 0, marginTop: 1 }}>
                              {style.icon}
                            </span>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, color: 'var(--text)' }}>{item.item}</div>
                              {item.notes && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{item.notes}</div>}
                            </div>
                            <span className={`badge ${style.badge}`} style={{ flexShrink: 0, fontSize: 10 }}>{item.status}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {d.critical_missing?.length > 0 && (
                  <div className="card">
                    <div className="card-title" style={{ color: 'var(--danger)' }}><XCircleIcon />Critical — Must Fix Before Approval</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {d.critical_missing.map((item, i) => (
                        <div key={i} style={{ padding: '8px 12px', background: 'var(--danger-bg)', borderRadius: 6, fontSize: 13, color: 'var(--danger)', borderLeft: '3px solid var(--danger)' }}>
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {d.recommendations?.length > 0 && (
                  <div className="card">
                    <div className="card-title"><LightbulbIcon />Recommendations</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {d.recommendations.map((r, i) => (
                        <div key={i} style={{ display: 'flex', gap: 10, padding: '7px 12px', background: 'var(--bg-input)', borderRadius: 6, fontSize: 13 }}>
                          <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{i + 1}.</span>
                          <span>{r}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )
          })()}

          {/* ── Comparison results ── */}
          {result?.type === 'compare' && !loading && (() => {
            const d = result.data
            return (
              <>
                <div className="card">
                  <div className="card-title"><GitIcon />Change Summary</div>
                  {d.overall_impact && (
                    <div style={{ marginBottom: 10 }}>
                      <span className={`badge ${d.overall_impact === 'Major' ? 'badge-red' : d.overall_impact === 'Moderate' ? 'badge-yellow' : 'badge-green'}`}>
                        {d.overall_impact} Changes
                      </span>
                    </div>
                  )}
                  <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>{d.change_summary}</p>
                  {d.recommendation && <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--accent-bg)', borderRadius: 6, fontSize: 12, color: 'var(--accent)' }}>{d.recommendation}</div>}
                </div>

                {d.significant_changes?.length > 0 && (
                  <div className="card">
                    <div className="card-title"><DiffIcon />Significant Changes</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {d.significant_changes.map((c, i) => (
                        <div key={i} style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>{c.section}</span>
                            <span className={`badge ${c.impact === 'High' ? 'badge-red' : c.impact === 'Medium' ? 'badge-yellow' : 'badge-green'}`}>{c.type}</span>
                            <span className={`badge ${c.impact === 'High' ? 'badge-red' : c.impact === 'Medium' ? 'badge-yellow' : 'badge-blue'}`}>{c.impact} Impact</span>
                          </div>
                          <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{c.description}</p>
                          {c.regulatory_significance && (
                            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>Regulatory: {c.regulatory_significance}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {result.data.diff_lines?.length > 0 && (
                  <div className="card">
                    <div className="card-title"><CodeIcon />Line Diff</div>
                    <div className="diff-container">
                      {result.data.diff_lines.slice(0, 80).map((line, i) => {
                        const cls = line.startsWith('+') ? 'diff-add' : line.startsWith('-') ? 'diff-remove' : 'diff-context'
                        return (
                          <div key={i} className={`diff-line ${cls}`}>
                            <span className="diff-line-num">{i + 1}</span>
                            <span style={{ whiteSpace: 'pre-wrap' }}>{line}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {(d.new_sections?.length > 0 || d.removed_sections?.length > 0) && (
                  <div className="card">
                    <div className="card-title"><ListIcon />Section Changes</div>
                    {d.new_sections?.length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600, marginBottom: 5, textTransform: 'uppercase' }}>Added Sections</div>
                        {d.new_sections.map((s, i) => <div key={i} style={{ fontSize: 12, color: 'var(--text)', padding: '4px 0', paddingLeft: 10, borderLeft: '2px solid var(--success)' }}>{s}</div>)}
                      </div>
                    )}
                    {d.removed_sections?.length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 600, marginBottom: 5, textTransform: 'uppercase' }}>Removed Sections</div>
                        {d.removed_sections.map((s, i) => <div key={i} style={{ fontSize: 12, color: 'var(--text)', padding: '4px 0', paddingLeft: 10, borderLeft: '2px solid var(--danger)' }}>{s}</div>)}
                      </div>
                    )}
                  </div>
                )}
              </>
            )
          })()}

          {!result && !loading && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 160, gap: 12 }}>
              <CheckIcon size={40} style={{ color: 'var(--text-dim)' }} />
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Results will appear here</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
