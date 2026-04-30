import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { classify, detectDuplicate, classifyBatch, uploadFile } from '../lib/api'

// ICH E2A / CDSCO severity classes
const SEV_STYLE = {
  'Death':                           { badge: 'badge-red',    urgent: true },
  'Life-Threatening':                { badge: 'badge-red',    urgent: true },
  'Hospitalisation Required':        { badge: 'badge-yellow', urgent: false },
  'Persistent Disability/Incapacity':{ badge: 'badge-yellow', urgent: false },
  'Congenital Anomaly/Birth Defect': { badge: 'badge-purple', urgent: false },
  'Medically Important Event':       { badge: 'badge-blue',   urgent: false },
  'Other Non-Serious':               { badge: 'badge-green',  urgent: false },
}

const PRIORITY_STYLE = {
  URGENT: { color: 'var(--danger)',  bg: 'var(--danger-bg)' },
  HIGH:   { color: 'var(--warning)', bg: 'var(--warning-bg)' },
  MEDIUM: { color: 'var(--accent)',  bg: 'var(--accent-bg)' },
  LOW:    { color: 'var(--success)', bg: 'var(--success-bg)' },
}

export default function ClassificationPage() {
  const [activeTab, setActiveTab] = useState('single')
  const [text, setText] = useState('')
  const [text2, setText2] = useState('')
  const [batchTexts, setBatchTexts] = useState(['', ''])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const onDropSingle = useCallback(async (files) => {
    if (!files[0]) return
    try { const { text: t } = await uploadFile(files[0]); setText(t) }
    catch { setError('Upload failed') }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop: onDropSingle, multiple: false })

  const run = async () => {
    setLoading(true)
    setError('')
    setResult(null)
    try {
      if (activeTab === 'single') {
        const r = await classify(text)
        setResult({ type: 'single', data: r })
      } else if (activeTab === 'duplicate') {
        const r = await detectDuplicate(text, text2)
        setResult({ type: 'duplicate', data: r })
      } else {
        const reports = batchTexts.filter(t => t.trim())
        const r = await classifyBatch(reports)
        // backend returns array directly
        setResult({ type: 'batch', data: Array.isArray(r) ? r : r.results ?? [] })
      }
    } catch (e) {
      setError(e.response?.data?.detail || e.message)
    } finally {
      setLoading(false)
    }
  }

  const canRun = activeTab === 'single'
    ? !!text.trim()
    : activeTab === 'duplicate'
    ? !!(text.trim() && text2.trim())
    : batchTexts.filter(t => t.trim()).length >= 2

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">SAE Classification</h1>
        <p className="page-subtitle">
          ICH E2A severity classification · TF-IDF + AI blended duplicate detection · Batch prioritisation
        </p>
      </div>

      <div className="tabs">
        {[
          ['single',    'Single Report'],
          ['duplicate', 'Duplicate Detection'],
          ['batch',     'Batch Classification'],
        ].map(([id, label]) => (
          <button
            key={id}
            className={`tab-btn${activeTab === id ? ' active' : ''}`}
            onClick={() => { setActiveTab(id); setResult(null) }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="two-col">
        {/* ── Left: input ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {activeTab === 'single' && (
            <div className="card">
              <div className="card-title"><TagIcon />SAE Report</div>
              <div {...getRootProps()} className={`dropzone${isDragActive ? ' active' : ''}`} style={{ marginBottom: 12 }}>
                <input {...getInputProps()} />
                <div className="dropzone-text">Drop file or <span>browse</span></div>
                <div className="dropzone-hint">PDF · DOCX · TXT</div>
              </div>
              <textarea
                className="form-textarea"
                style={{ minHeight: 300 }}
                placeholder="Paste SAE report text. The tool will extract case ID, severity class, causality, MedDRA term, and priority…"
                value={text}
                onChange={e => setText(e.target.value)}
              />
            </div>
          )}

          {activeTab === 'duplicate' && (
            <>
              <div className="card">
                <div className="card-title"><TagIcon />Report A</div>
                <textarea className="form-textarea" style={{ minHeight: 200 }} placeholder="Paste first SAE report…" value={text} onChange={e => setText(e.target.value)} />
              </div>
              <div className="card">
                <div className="card-title"><TagIcon />Report B</div>
                <textarea className="form-textarea" style={{ minHeight: 200 }} placeholder="Paste second SAE report…" value={text2} onChange={e => setText2(e.target.value)} />
              </div>
              <div className="alert alert-info">
                <InfoIcon />
                TF-IDF cosine pre-filter (fast): if score &lt;0.2 the reports are distinct without calling AI. Otherwise blended score = 0.4×cosine + 0.6×AI; duplicate if ≥0.80.
              </div>
            </>
          )}

          {activeTab === 'batch' && (
            <div className="card">
              <div className="card-title" style={{ justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><LayersIcon />Batch Reports</span>
                <button className="btn btn-secondary btn-sm" onClick={() => setBatchTexts(t => [...t, ''])}>
                  <PlusIcon />Add Report
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {batchTexts.map((t, i) => (
                  <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Report {i + 1}</span>
                      {batchTexts.length > 2 && (
                        <button className="btn btn-ghost btn-sm" style={{ padding: '2px 6px' }} onClick={() => setBatchTexts(bt => bt.filter((_, j) => j !== i))}>
                          <XIcon />
                        </button>
                      )}
                    </div>
                    <textarea
                      className="form-textarea"
                      style={{ minHeight: 90 }}
                      placeholder={`SAE report ${i + 1}…`}
                      value={t}
                      onChange={e => { const next = [...batchTexts]; next[i] = e.target.value; setBatchTexts(next) }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <button className="btn btn-primary btn-full" onClick={run} disabled={loading || !canRun}>
            {loading
              ? <><div className="spinner" />Classifying…</>
              : <><ZapIcon />{activeTab === 'batch' ? 'Classify All' : activeTab === 'duplicate' ? 'Check Duplicate' : 'Classify Report'}</>
            }
          </button>
          {error && <div className="alert alert-error"><AlertIcon />{error}</div>}
        </div>

        {/* ── Right: results ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {loading && <div className="card loading-center" style={{ minHeight: 200 }}><div className="spinner spinner-lg" /></div>}

          {/* ── Single result ── */}
          {result?.type === 'single' && !loading && (() => {
            const d = result.data
            // backend field: severity_class (not severity)
            const sevStyle = SEV_STYLE[d.severity_class] || { badge: 'badge-blue', urgent: false }
            const priStyle = PRIORITY_STYLE[d.priority] || PRIORITY_STYLE.MEDIUM
            return (
              <>
                <div className="card">
                  <div className="card-title" style={{ justifyContent: 'space-between' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><TagIcon />Classification Result</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {d.priority && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 100, background: priStyle.bg, color: priStyle.color }}>{d.priority}</span>}
                      <span className={`badge ${sevStyle.badge}`}>{d.severity_class}</span>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                    {[
                      ['Case ID', d.case_id],
                      ['Outcome', d.outcome],
                      ['Suspect Drug', d.drug_suspect],
                      ['MedDRA Term', d.event_pt],
                      ['Causality', d.causality_assessment],
                      ['Severity Score', d.severity_score ? `${d.severity_score}/10` : null],
                    ].filter(([, v]) => v).map(([l, v]) => (
                      <div key={l} style={{ background: 'var(--bg-input)', borderRadius: 6, padding: '8px 12px' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 2 }}>{l}</div>
                        <div style={{ fontSize: 13, color: 'var(--text-heading)', fontWeight: 500 }}>{v}</div>
                      </div>
                    ))}
                  </div>

                  {/* Reviewer priority notes — backend field name */}
                  {d.reviewer_priority_notes && (
                    <div style={{ background: 'var(--bg-input)', borderRadius: 8, padding: '10px 14px', fontSize: 13, lineHeight: 1.6, color: 'var(--text)', borderLeft: '3px solid var(--accent)' }}>
                      {d.reviewer_priority_notes}
                    </div>
                  )}
                </div>

                {d.seriousness_criteria?.length > 0 && (
                  <div className="card">
                    <div className="card-title"><CheckIcon />Seriousness Criteria (ICH E2A)</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {d.seriousness_criteria.map((c, i) => (
                        <span key={i} className="badge badge-red">{c}</span>
                      ))}
                    </div>
                  </div>
                )}

                {d.flags?.length > 0 && (
                  <div className="card">
                    <div className="card-title"><AlertIcon />Special Flags</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {d.flags.map((f, i) => (
                        <div key={i} style={{ padding: '7px 12px', background: 'var(--warning-bg)', borderRadius: 6, fontSize: 13, color: 'var(--warning)', borderLeft: '3px solid var(--warning)' }}>{f}</div>
                      ))}
                    </div>
                  </div>
                )}

                {d.duplicate_indicators?.length > 0 && (
                  <div className="card">
                    <div className="card-title"><CopyIcon />Duplicate Risk: <span className="badge badge-yellow" style={{ marginLeft: 8 }}>{d.duplicate_risk}</span></div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Matching indicators:</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                      {d.duplicate_indicators.map((di, i) => <span key={i} className="badge badge-yellow">{di}</span>)}
                    </div>
                  </div>
                )}
              </>
            )
          })()}

          {/* ── Duplicate result ── */}
          {result?.type === 'duplicate' && !loading && (() => {
            const d = result.data
            // backend fields: is_duplicate, similarity_score (blended), cosine_similarity, matching_elements, differing_elements
            const isDup = d.is_duplicate
            const blended = Math.round((d.similarity_score ?? 0) * 100)
            const cosine = Math.round((d.cosine_similarity ?? 0) * 100)
            return (
              <div className="card">
                <div className="card-title" style={{ justifyContent: 'space-between' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><CopyIcon />Duplicate Analysis</span>
                  <span className={`badge ${isDup ? 'badge-red' : 'badge-green'}`}>
                    {isDup ? 'Likely Duplicate' : 'Not a Duplicate'}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                  {[
                    ['Blended Score', `${blended}%`, blended >= 80 ? 'var(--danger)' : 'var(--text-heading)'],
                    ['Cosine (TF-IDF)', `${cosine}%`, 'var(--text-heading)'],
                    ['Matching Fields', d.matching_elements?.length ?? 0, 'var(--text-heading)'],
                    ['Differing Fields', d.differing_elements?.length ?? 0, 'var(--text-heading)'],
                  ].map(([l, v, col]) => (
                    <div key={l} style={{ background: 'var(--bg-input)', borderRadius: 6, padding: '8px 12px' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 2 }}>{l}</div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: col }}>{v}</div>
                    </div>
                  ))}
                </div>

                {d.matching_elements?.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600, marginBottom: 5 }}>MATCHING ELEMENTS</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {d.matching_elements.map((m, i) => <span key={i} className="badge badge-green">{m}</span>)}
                    </div>
                  </div>
                )}

                {d.differing_elements?.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 600, marginBottom: 5 }}>DIFFERING ELEMENTS</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {d.differing_elements.map((m, i) => <span key={i} className="badge badge-red">{m}</span>)}
                    </div>
                  </div>
                )}

                {d.reasoning && (
                  <div style={{ background: 'var(--bg-input)', borderRadius: 8, padding: 12, fontSize: 13, lineHeight: 1.6, marginTop: 4 }}>
                    {d.reasoning}
                  </div>
                )}
              </div>
            )
          })()}

          {/* ── Batch result ── */}
          {result?.type === 'batch' && !loading && (
            <div className="card">
              <div className="card-title"><LayersIcon />Batch Results — {result.data.length} Reports</div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Case ID</th>
                      <th>Severity</th>
                      <th>Priority</th>
                      <th>Outcome</th>
                      <th>Possible Dup</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.data.map((r, i) => {
                      const sevStyle = SEV_STYLE[r.severity_class] || { badge: 'badge-blue' }
                      const priStyle = PRIORITY_STYLE[r.priority] || PRIORITY_STYLE.MEDIUM
                      return (
                        <tr key={i}>
                          <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{(r.index ?? i) + 1}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-heading)', fontWeight: 500 }}>{r.case_id || '—'}</td>
                          <td><span className={`badge ${sevStyle.badge}`} style={{ fontSize: 10 }}>{r.severity_class || '—'}</span></td>
                          <td><span style={{ fontSize: 11, fontWeight: 600, color: priStyle.color }}>{r.priority}</span></td>
                          <td style={{ fontSize: 12 }}>{r.outcome || '—'}</td>
                          <td>
                            {r.potential_duplicate_of?.length > 0
                              ? <span className="badge badge-yellow" style={{ fontSize: 10 }}>#{r.potential_duplicate_of.map(x => x + 1).join(', ')} ({r.duplicate_confidence})</span>
                              : <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>None</span>
                            }
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!result && !loading && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 200, gap: 12 }}>
              <TagIcon style={{ width: 40, height: 40, color: 'var(--text-dim)' }} />
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Classification results will appear here</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function TagIcon({ style }) { return <svg style={style} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg> }
function LayersIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg> }
function ZapIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> }
function CopyIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> }
function PlusIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> }
function XIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> }
function AlertIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> }
function CheckIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> }
function InfoIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> }
