import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { classify, detectDuplicate, classifyBatch, uploadFile } from '../lib/api'
import {
  TagIcon, LayersIcon, ZapIcon, CopyIcon, PlusIcon, XSmallIcon,
  AlertIcon, CheckIcon, InfoIcon, DownloadIcon, UploadIcon,
} from '../components/Icons'

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

function formatSingleResult(d) {
  const sep = '='.repeat(60)
  const sub = '-'.repeat(40)
  const lines = [sep, 'CDSCO RegAI — SAE Classification', sep, '',
    `Case ID          : ${d.case_id || '—'}`,
    `Severity Class   : ${d.severity_class || '—'}`,
    `Priority         : ${d.priority || '—'}`,
    `Outcome          : ${d.outcome || '—'}`,
    `Suspect Drug     : ${d.drug_suspect || '—'}`,
    `MedDRA Term      : ${d.event_pt || '—'}`,
    `Causality        : ${d.causality_assessment || '—'}`,
    `Severity Score   : ${d.severity_score ? `${d.severity_score}/10` : '—'}`,
    '',
  ]
  if (d.seriousness_criteria?.length) { lines.push('SERIOUSNESS CRITERIA (ICH E2A)', sub); d.seriousness_criteria.forEach(c => lines.push(`  · ${c}`)); lines.push('') }
  if (d.flags?.length) { lines.push('SPECIAL FLAGS', sub); d.flags.forEach(f => lines.push(`  · ${f}`)); lines.push('') }
  if (d.reviewer_priority_notes) { lines.push('REVIEWER NOTES', sub, d.reviewer_priority_notes, '') }
  if (d.duplicate_indicators?.length) { lines.push(`DUPLICATE RISK: ${d.duplicate_risk}`, sub); d.duplicate_indicators.forEach(di => lines.push(`  · ${di}`)); lines.push('') }
  return lines.join('\n')
}

function formatBatchResult(rows) {
  const sep = '='.repeat(60)
  const sub = '-'.repeat(40)
  const lines = [sep, 'CDSCO RegAI — Batch SAE Classification', sep, '']
  rows.forEach((r, i) => {
    lines.push(`REPORT ${i+1}${r.case_id ? ` — ${r.case_id}` : ''}`, sub)
    lines.push(`  Severity Class   : ${r.severity_class || '—'}`)
    lines.push(`  Priority         : ${r.priority || '—'}`)
    lines.push(`  Severity Score   : ${r.severity_score ? `${r.severity_score}/10` : '—'}`)
    lines.push(`  Outcome          : ${r.outcome || '—'}`)
    lines.push(`  Suspect Drug     : ${r.drug_suspect || '—'}`)
    lines.push(`  MedDRA Term      : ${r.event_pt || '—'}`)
    lines.push(`  Causality        : ${r.causality_assessment || '—'}`)
    if (r.seriousness_criteria?.length) lines.push(`  Seriousness      : ${r.seriousness_criteria.join('; ')}`)
    if (r.flags?.length)               lines.push(`  Flags            : ${r.flags.join(', ')}`)
    if (r.potential_duplicate_of?.length) lines.push(`  Possible Dup of  : #${r.potential_duplicate_of.map(x => x+1).join(', ')} (${r.duplicate_confidence})`)
    lines.push('')
  })
  return lines.join('\n')
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

  const onDropDupA = useCallback(async (files) => {
    if (!files[0]) return
    try { const { text: t } = await uploadFile(files[0]); setText(t) }
    catch { setError('Upload failed') }
  }, [])

  const onDropDupB = useCallback(async (files) => {
    if (!files[0]) return
    try { const { text: t } = await uploadFile(files[0]); setText2(t) }
    catch { setError('Upload failed') }
  }, [])

  const uploadBatchSlot = async (files, idx) => {
    if (!files[0]) return
    try {
      const { text: t } = await uploadFile(files[0])
      setBatchTexts(bt => { const next = [...bt]; next[idx] = t; return next })
    } catch { setError('Upload failed') }
  }

  const copyResult = () => {
    if (!result) return
    const txt = result.type === 'single'
      ? formatSingleResult(result.data)
      : result.type === 'batch'
      ? formatBatchResult(result.data)
      : `Duplicate: ${result.data.is_duplicate ? 'Yes' : 'No'} — Blended score: ${Math.round((result.data.similarity_score ?? 0) * 100)}%\n${result.data.reasoning || ''}`
    navigator.clipboard.writeText(txt)
  }

  const downloadResult = () => {
    if (!result) return
    const txt = result.type === 'single'
      ? formatSingleResult(result.data)
      : result.type === 'batch'
      ? formatBatchResult(result.data)
      : `Duplicate: ${result.data.is_duplicate ? 'Yes' : 'No'} — Blended score: ${Math.round((result.data.similarity_score ?? 0) * 100)}%\n${result.data.reasoning || ''}`
    const blob = new Blob([txt], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `CDSCO_SAE_${result.type}_${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop: onDropSingle, multiple: false })
  const { getRootProps: getDupARootProps, getInputProps: getDupAInputProps, isDragActive: isDupADrag } = useDropzone({ onDrop: onDropDupA, multiple: false })
  const { getRootProps: getDupBRootProps, getInputProps: getDupBInputProps, isDragActive: isDupBDrag } = useDropzone({ onDrop: onDropDupB, multiple: false })

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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* ── Input section ── */}
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
              style={{ minHeight: 240 }}
              placeholder="Paste SAE report text. The tool will extract case ID, severity class, causality, MedDRA term, and priority…"
              value={text}
              onChange={e => setText(e.target.value)}
            />
            {text.length > 150000 && (
              <div className="alert alert-warning" style={{ marginTop: 8 }}>
                <AlertIcon />Report exceeds 150,000 characters — content will be truncated before processing.
              </div>
            )}
          </div>
        )}

        {activeTab === 'duplicate' && (
          <>
            <div className="card">
              <div className="card-title"><TagIcon />Report A</div>
              <div {...getDupARootProps()} className={`dropzone${isDupADrag ? ' active' : ''}`} style={{ marginBottom: 10 }}>
                <input {...getDupAInputProps()} />
                <div className="dropzone-text">Drop file or <span>browse</span></div>
                <div className="dropzone-hint">PDF · DOCX · TXT</div>
              </div>
              <textarea className="form-textarea" style={{ minHeight: 180 }} placeholder="Paste first SAE report…" value={text} onChange={e => setText(e.target.value)} />
              {text.length > 50000 && (
                <div className="alert alert-warning" style={{ marginTop: 8 }}>
                  <AlertIcon />Report A exceeds 50,000 characters — will be truncated.
                </div>
              )}
            </div>
            <div className="card">
              <div className="card-title"><TagIcon />Report B</div>
              <div {...getDupBRootProps()} className={`dropzone${isDupBDrag ? ' active' : ''}`} style={{ marginBottom: 10 }}>
                <input {...getDupBInputProps()} />
                <div className="dropzone-text">Drop file or <span>browse</span></div>
                <div className="dropzone-hint">PDF · DOCX · TXT</div>
              </div>
              <textarea className="form-textarea" style={{ minHeight: 180 }} placeholder="Paste second SAE report…" value={text2} onChange={e => setText2(e.target.value)} />
              {text2.length > 50000 && (
                <div className="alert alert-warning" style={{ marginTop: 8 }}>
                  <AlertIcon />Report B exceeds 50,000 characters — will be truncated.
                </div>
              )}
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Report {i + 1}</span>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <label style={{ cursor: 'pointer', fontSize: 11, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <UploadIcon size={12} />Browse
                        <input type="file" accept=".pdf,.docx,.txt" style={{ display: 'none' }}
                          onChange={e => uploadBatchSlot(Array.from(e.target.files), i)} />
                      </label>
                      {batchTexts.length > 2 && (
                        <button className="btn btn-ghost btn-sm" style={{ padding: '2px 6px' }} onClick={() => setBatchTexts(bt => bt.filter((_, j) => j !== i))}>
                          <XSmallIcon />
                        </button>
                      )}
                    </div>
                  </div>
                  <textarea
                    className="form-textarea"
                    style={{ minHeight: 90 }}
                    placeholder={`SAE report ${i + 1}…`}
                    value={t}
                    onChange={e => { const next = [...batchTexts]; next[i] = e.target.value; setBatchTexts(next) }}
                  />
                  {t.length > 15000 && (
                    <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 4 }}>
                      ⚠ Report {i + 1} exceeds 15,000 characters — will be truncated.
                    </div>
                  )}
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

        {/* ── Results section ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {result && !loading && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-secondary btn-sm" onClick={copyResult}><CopyIcon />Copy result</button>
              <button className="btn btn-secondary btn-sm" onClick={downloadResult}><DownloadIcon />Download .txt</button>
            </div>
          )}
          {loading && <div className="card loading-center" style={{ minHeight: 200 }}><div className="spinner spinner-lg" /></div>}

          {result?.type === 'single' && !loading && (() => {
            const d = result.data
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

          {result?.type === 'duplicate' && !loading && (() => {
            const d = result.data
            const isDup   = d.is_duplicate
            const blended = Math.round((d.similarity_score ?? 0) * 100)
            const cosine  = Math.round((d.cosine_similarity ?? 0) * 100)
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
                    ['Blended Score',   `${blended}%`, blended >= 80 ? 'var(--danger)' : 'var(--text-heading)'],
                    ['Cosine (TF-IDF)', `${cosine}%`,  'var(--text-heading)'],
                    ['Matching Fields',  d.matching_elements?.length ?? 0, 'var(--text-heading)'],
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

          {result?.type === 'batch' && !loading && (
            <div className="card">
              <div className="card-title"><LayersIcon />Batch Results — {result.data.length} Reports</div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>#</th><th>Case ID</th><th>Severity</th><th>Priority</th><th>Suspect Drug</th><th>MedDRA Term</th><th>Causality</th><th>Outcome</th><th>Dup?</th>
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
                          <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.drug_suspect || '—'}</td>
                          <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.event_pt || '—'}</td>
                          <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.causality_assessment || '—'}</td>
                          <td style={{ fontSize: 12 }}>{r.outcome || '—'}</td>
                          <td>
                            {r.potential_duplicate_of?.length > 0
                              ? <span className="badge badge-yellow" style={{ fontSize: 10 }}>#{r.potential_duplicate_of.map(x => x + 1).join(', ')} ({r.duplicate_confidence})</span>
                              : <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>—</span>
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
            <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 160, gap: 12 }}>
              <TagIcon size={40} style={{ color: 'var(--text-dim)' }} />
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Classification results will appear here</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
