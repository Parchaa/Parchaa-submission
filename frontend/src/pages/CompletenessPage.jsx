import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { assessCompleteness, compareDocuments, uploadFile } from '../lib/api'

const CHECKLIST_TYPES = [
  'Clinical Trial Application',
  'New Drug Application',
  'SAE Report',
]

const STATUS_STYLE = {
  Present:        { badge: 'badge-green', icon: <CheckCircleIcon /> },
  Partial:        { badge: 'badge-yellow', icon: <AlertCircleIcon /> },
  Missing:        { badge: 'badge-red', icon: <XCircleIcon /> },
  'Not Applicable': { badge: 'badge-purple', icon: <MinusIcon /> },
}

function ScoreBar({ pct }) {
  const cls = pct >= 80 ? 'high' : pct >= 50 ? 'medium' : 'low'
  const badgeCls = pct >= 80 ? 'badge-green' : pct >= 50 ? 'badge-yellow' : 'badge-red'
  const label = pct >= 80 ? 'Complete' : pct >= 50 ? 'Mostly Complete' : 'Incomplete'
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

function makeUploadDropzone(setter, setError) {
  // Hook-free helper — caller must spread the props
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

export default function CompletenessPage() {
  const [activeTab, setActiveTab] = useState('completeness')
  const [text, setText] = useState('')
  const [checklistType, setChecklistType] = useState('Clinical Trial Application')
  const [doc1, setDoc1] = useState('')
  const [doc2, setDoc2] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const dzText = makeUploadDropzone(setText, setError)
  const dz1 = makeUploadDropzone(setDoc1, setError)
  const dz2 = makeUploadDropzone(setDoc2, setError)

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

      <div className="two-col">
        {/* ── Left ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
                <textarea className="form-textarea" style={{ minHeight: 200 }} placeholder="Paste original version…" value={doc1} onChange={e => setDoc1(e.target.value)} />
              </div>
              <div className="card">
                <div className="card-title"><DocBIcon />Version 2 (Revised)</div>
                <div {...dz2.getRootProps()} className={`dropzone${dz2.isDragActive ? ' active' : ''}`} style={{ marginBottom: 10 }}>
                  <input {...dz2.getInputProps()} />
                  <div className="dropzone-text">Drop or <span>browse</span></div>
                  <div className="dropzone-hint">PDF · DOCX · TXT</div>
                </div>
                <textarea className="form-textarea" style={{ minHeight: 200 }} placeholder="Paste revised version…" value={doc2} onChange={e => setDoc2(e.target.value)} />
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
        </div>

        {/* ── Right ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {loading && (
            <div className="card loading-center" style={{ minHeight: 200 }}>
              <div className="spinner spinner-lg" />
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Analysing document…</span>
            </div>
          )}

          {/* ── Completeness results ── */}
          {result?.type === 'completeness' && !loading && (() => {
            const d = result.data
            // backend returns overall_completeness_pct (0-100 integer)
            const pct = d.overall_completeness_pct ?? Math.round((d.score ?? 0) * 100)
            return (
              <>
                <div className="card">
                  <div className="card-title"><CheckIcon />Completeness Score — {checklistType}</div>
                  <ScoreBar pct={pct} />
                  {d.status && <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-muted)' }}>Status: <strong style={{ color: 'var(--text-heading)' }}>{d.status}</strong></div>}
                  {d.reviewer_action && <div style={{ marginTop: 8, padding: '8px 12px', background: 'var(--accent-bg)', borderRadius: 6, fontSize: 12, color: 'var(--accent)', borderLeft: '3px solid var(--accent)' }}>{d.reviewer_action}</div>}
                </div>

                {/* Checklist items — backend returns d.items */}
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

                {/* Critical missing — backend returns d.critical_missing */}
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
            const impactColor = { Major: 'var(--danger)', Moderate: 'var(--warning)', Minor: 'var(--success)' }
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

                {/* Unified diff */}
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

                {(d.new_sections?.length > 0 || d.removed_sections?.length > 0 || d.data_changes?.length > 0) && (
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
            <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 200, gap: 12 }}>
              <CheckIcon style={{ width: 40, height: 40, color: 'var(--text-dim)' }} />
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Results will appear here</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function CheckIcon({ style }) { return <svg style={style} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> }
function CheckCircleIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> }
function XCircleIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> }
function AlertCircleIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> }
function MinusIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg> }
function DocAIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/></svg> }
function DocBIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="17" x2="8" y2="17"/></svg> }
function ZapIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> }
function ListIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/></svg> }
function AlertIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> }
function GitIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg> }
function DiffIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/></svg> }
function CodeIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg> }
function LightbulbIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="9" y1="18" x2="15" y2="18"/><line x1="10" y1="22" x2="14" y2="22"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/></svg> }
