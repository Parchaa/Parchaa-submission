import { useState, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { classify, detectDuplicate, classifyBatch, uploadFile } from '../lib/api'
import {
  TagIcon, LayersIcon, ZapIcon, CopyIcon, PlusIcon, XSmallIcon,
  AlertIcon, CheckIcon, InfoIcon, DownloadIcon, UploadIcon,
} from '../components/Icons'
import HistoryPanel from '../components/HistoryPanel'

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
  if (d.case_summary) { lines.push('CASE SUMMARY', sub, d.case_summary, '') }
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

const ICH_CATEGORIES = [
  { name: 'Death',                           color: 'badge-red',    def: 'Patient died as a direct result of the adverse event.' },
  { name: 'Life-Threatening',                color: 'badge-red',    def: 'Patient was at immediate risk of death at the time of the event.' },
  { name: 'Hospitalisation Required',        color: 'badge-yellow', def: 'Inpatient hospitalisation or prolongation of existing hospitalisation.' },
  { name: 'Persistent Disability/Incapacity',color: 'badge-yellow', def: 'Substantial disruption of ability to conduct normal life functions.' },
  { name: 'Congenital Anomaly/Birth Defect', color: 'badge-purple', def: 'Adverse effect in offspring of a patient who received the drug.' },
  { name: 'Medically Important Event',       color: 'badge-blue',   def: 'Event that may jeopardise the patient or require intervention to prevent the above.' },
  { name: 'Other Non-Serious',               color: 'badge-green',  def: 'Does not meet any of the six seriousness criteria above.' },
]

const RESPONSE_FIELDS = [
  { field: 'severity_class',        label: 'Severity Class',      desc: 'One of the 7 ICH E2A categories above.' },
  { field: 'priority',              label: 'Priority',             desc: 'URGENT / HIGH / MEDIUM / LOW — derived from severity × causality.' },
  { field: 'causality_assessment',  label: 'Causality',           desc: 'WHO-UMC scale: Certain / Probable / Possible / Unlikely / Conditional / Unassessable.' },
  { field: 'severity_score',        label: 'Severity Score',      desc: 'Numeric 1–10 scale, 10 = most severe.' },
  { field: 'case_id',               label: 'Case ID',             desc: 'Extracted from the report text.' },
  { field: 'outcome',               label: 'Outcome',             desc: 'Patient outcome: Recovered, Recovering, Not Recovered, Fatal, Unknown.' },
  { field: 'drug_suspect',          label: 'Suspect Drug',        desc: 'The drug suspected of causing the adverse event.' },
  { field: 'event_pt',              label: 'MedDRA Preferred Term',desc: 'Standardised MedDRA term for the adverse event.' },
  { field: 'seriousness_criteria',  label: 'Seriousness Criteria',desc: 'List of ICH E2A criteria that apply.' },
  { field: 'case_summary',          label: 'Case Summary',        desc: 'Concise 2-3 sentence clinical summary of the adverse event.' },
  { field: 'flags',                 label: 'Special Flags',       desc: 'e.g. unexpected reaction, significant drug interaction, expedited reporting needed.' },
  { field: 'reviewer_priority_notes',label: 'Reviewer Notes',     desc: 'Written justification for the assigned classification.' },
  { field: 'duplicate_risk',        label: 'Duplicate Risk',      desc: 'HIGH / MEDIUM / LOW — based on duplicate_indicators found in the report.' },
]

export default function ClassificationPage() {
  const [activeTab, setActiveTab] = useState('single')
  const [text, setText] = useState('')
  const [text2, setText2] = useState('')
  const [batchTexts, setBatchTexts] = useState(['', ''])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [filename, setFilename] = useState('')
  const [showFieldsInfo, setShowFieldsInfo] = useState(false)
  const [showLogicInfo, setShowLogicInfo] = useState(false)
  const [dupThreshold, setDupThreshold] = useState(60)
  const [manualDupDecision, setManualDupDecision] = useState(null) // 'duplicate' | 'not_duplicate' | null

  const onDropSingle = useCallback(async (files) => {
    if (!files[0]) return
    setFilename(files[0].name)
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
        const r = await classify(text, filename)
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

  // 1. Initial mount: restore last active tab
  useEffect(() => {
    try {
      const savedTab = localStorage.getItem('cdsco_classification_activeTab')
      if (savedTab) {
        setActiveTab(savedTab)
      }
    } catch {}
  }, [])

  // 2. Load result whenever activeTab changes
  useEffect(() => {
    try {
      localStorage.setItem('cdsco_classification_activeTab', activeTab)
      const saved = localStorage.getItem(`cdsco_classification_result_${activeTab}`)
      if (saved) {
        setResult(JSON.parse(saved))
      } else {
        setResult(null)
      }
    } catch {
      setResult(null)
    }
  }, [activeTab])

  // 3. Save result whenever it changes (if it is truthy)
  useEffect(() => {
    if (result) {
      try { localStorage.setItem(`cdsco_classification_result_${activeTab}`, JSON.stringify(result)) } catch {}
    }
  }, [result, activeTab])

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
            onClick={() => setActiveTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {activeTab === 'single' && (
          <HistoryPanel
            module="classification"
            onLoad={(data) => {
              setResult({ type: 'single', data: data.result })
              setError('')
            }}
          />
        )}

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
                {showFieldsInfo && (
                  <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setShowFieldsInfo(false)}>
                    <div style={{ background: 'var(--bg-card)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 680, maxHeight: '85vh', overflowY: 'auto', position: 'relative', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => setShowFieldsInfo(false)} style={{ position: 'absolute', top: 16, right: 16, background: 'var(--bg-hover)', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                      <h3 style={{ margin: '0 0 4px', fontSize: 17, color: 'var(--text-heading)' }}>SAE Classification — Field Reference</h3>
                      <p style={{ margin: '0 0 18px', fontSize: 12, color: 'var(--text-muted)' }}>Every field the AI returns and what each ICH E2A category means.</p>

                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-heading)', marginBottom: 8 }}>ICH E2A Severity Categories</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
                        {ICH_CATEGORIES.map(c => (
                          <div key={c.name} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: 'var(--bg-input)', padding: '8px 12px', borderRadius: 8 }}>
                            <span className={`badge ${c.color}`} style={{ flexShrink: 0, fontSize: 10, marginTop: 2 }}>{c.name}</span>
                            <span style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>{c.def}</span>
                          </div>
                        ))}
                      </div>

                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-heading)', marginBottom: 8 }}>Response Fields</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {RESPONSE_FIELDS.map(f => (
                          <div key={f.field} style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 10, padding: '6px 12px', background: 'var(--bg-input)', borderRadius: 6 }}>
                            <code style={{ fontSize: 11, color: 'var(--accent)', alignSelf: 'center' }}>{f.field}</code>
                            <div>
                              <div style={{ fontSize: 12, color: 'var(--text-heading)', fontWeight: 500 }}>{f.label}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{f.desc}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="card">
                  <div className="card-title" style={{ justifyContent: 'space-between' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><TagIcon />Classification Result</span>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {d.priority && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 100, background: priStyle.bg, color: priStyle.color }}>{d.priority}</span>}
                      <span className={`badge ${sevStyle.badge}`}>{d.severity_class}</span>
                      <button className="btn btn-secondary" style={{ padding: '3px 10px', fontSize: 10 }} onClick={() => setShowFieldsInfo(true)}><InfoIcon size={11} /> Field Reference</button>
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

                  {d.case_summary && (
                    <div style={{ background: 'var(--bg-input)', borderRadius: 8, padding: '10px 14px', fontSize: 13, lineHeight: 1.6, color: 'var(--text)', borderLeft: '3px solid var(--text-dim)', marginBottom: 8 }}>
                      {d.case_summary}
                    </div>
                  )}

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
            const blended  = Math.round((d.similarity_score    ?? 0) * 100)
            const cosine   = Math.round((d.cosine_similarity   ?? 0) * 100)
            const aiScore  = Math.round((d.ai_similarity       ?? 0) * 100)
            const aiIsDup  = d.is_duplicate
            const thresholdDup = blended >= dupThreshold
            const finalIsDup = manualDupDecision !== null
              ? manualDupDecision === 'duplicate'
              : thresholdDup
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {showLogicInfo && (
                  <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setShowLogicInfo(false)}>
                    <div style={{ background: 'var(--bg-card)', borderRadius: 20, padding: 32, width: '100%', maxWidth: 600, position: 'relative', border: '1px solid var(--border)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => setShowLogicInfo(false)} style={{ position: 'absolute', top: 20, right: 20, background: 'var(--bg-hover)', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                        <div style={{ background: 'var(--accent-bg)', color: 'var(--accent)', width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <LayersIcon size={24} />
                        </div>
                        <div>
                          <h3 style={{ margin: 0, fontSize: 20, color: 'var(--text-heading)' }}>How is Duplicate Detected?</h3>
                          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>The science behind our blended scoring model.</p>
                        </div>
                      </div>

                      <div style={{ background: 'var(--bg-input)', padding: 20, borderRadius: 12, marginBottom: 24, border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', marginBottom: 8 }}>The Formula</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-heading)', fontFamily: 'monospace', textAlign: 'center', margin: '12px 0' }}>
                          (0.4 × TF-IDF) + (0.6 × AI) = Blended Score
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                          We combine **TF-IDF Cosine Similarity** (which looks at word frequencies and structural overlap) with **AI Semantic Analysis** (which understands clinical intent and context).
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-heading)', marginBottom: 4 }}>1. Fast Pre-Filter (TF-IDF)</div>
                          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>If the TF-IDF score is below 20%, the system instantly marks reports as "Distinct" without calling the AI, saving time and costs.</p>
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-heading)', marginBottom: 4 }}>2. Deep Semantic Check (AI)</div>
                          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>The AI compares Patient IDs, Suspect Drugs, Onset Dates, and Event Narratives to see if they describe the same clinical event.</p>
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-heading)', marginBottom: 4 }}>3. Threshold & Control</div>
                          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>The <strong>Default Threshold is 60%</strong>. Any blended score above this is flagged as a duplicate. You can use the slider to adjust this — move it right for strict matching, left for more sensitive detection.</p>
                        </div>
                      </div>

                      <button className="btn btn-primary btn-full" onClick={() => setShowLogicInfo(false)}>Got it</button>
                    </div>
                  </div>
                )}

                <div className="card">
                  <div className="card-title" style={{ justifyContent: 'space-between' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <CopyIcon />Duplicate Analysis
                      <button 
                        onClick={() => setShowLogicInfo(true)}
                        style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}
                      >
                        <InfoIcon size={14} />
                      </button>
                    </span>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {manualDupDecision && <span className="badge badge-purple" style={{ fontSize: 10 }}>Human Override</span>}
                      <span className={`badge ${finalIsDup ? 'badge-red' : 'badge-green'}`}>
                        {finalIsDup ? 'Duplicate' : 'Not a Duplicate'}
                      </span>
                    </div>
                  </div>

                  {d.analysis_summary && (
                    <p style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--text)', lineHeight: 1.6, background: 'var(--bg-input)', padding: '12px 16px', borderRadius: 8, borderLeft: '3px solid var(--accent)' }}>
                      {d.analysis_summary}
                    </p>
                  )}

                  {/* Score Breakdown */}
                  <div style={{ background: 'var(--bg-input)', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Score Breakdown</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[
                        { label: 'TF-IDF Cosine Similarity', value: cosine, weight: '40%', color: 'var(--accent)', hint: 'Word-frequency based pre-filter.' },
                        { label: 'AI Semantic Similarity',   value: aiScore, weight: '60%', color: 'var(--purple)', hint: 'Field-by-field contextual comparison.' },
                      ].map(row => (
                        <div key={row.label}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                            <span style={{ fontSize: 12, color: 'var(--text)' }}>{row.label} <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>(weight: {row.weight})</span></span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: row.color }}>{row.value}%</span>
                          </div>
                          <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${row.value}%`, background: row.color, borderRadius: 3, transition: 'width 0.5s ease' }} />
                          </div>
                        </div>
                      ))}
                      <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-heading)' }}>Blended Score <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-muted)' }}>(0.4 × TF-IDF + 0.6 × AI)</span></span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: blended >= dupThreshold ? 'var(--danger)' : 'var(--success)' }}>{blended}%</span>
                        </div>
                        <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${blended}%`, background: blended >= dupThreshold ? 'var(--danger)' : 'var(--success)', borderRadius: 4, transition: 'width 0.5s ease' }} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Threshold Slider */}
                  <div style={{ background: 'var(--bg-input)', borderRadius: 10, padding: '14px 16px', marginBottom: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-heading)' }}>Duplicate Threshold</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>{dupThreshold}%</span>
                    </div>
                    <input type="range" min="30" max="95" step="5" value={dupThreshold}
                      onChange={e => { setDupThreshold(Number(e.target.value)); setManualDupDecision(null) }}
                      style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                      <span>30% (Sensitive)</span><span>95% (Strict)</span>
                    </div>
                  </div>
                </div>

                {/* Field Comparison Table */}
                {d.field_comparison?.length > 0 && (
                  <div className="card">
                    <div className="card-title"><LayersIcon />Side-by-Side Field Comparison</div>
                    <div className="table-wrap">
                      <table style={{ borderCollapse: 'separate', borderSpacing: '0 4px' }}>
                        <thead>
                          <tr>
                            <th style={{ background: 'transparent', borderBottom: '1px solid var(--border)', fontSize: 11 }}>Field</th>
                            <th style={{ background: 'transparent', borderBottom: '1px solid var(--border)', fontSize: 11 }}>Version 1</th>
                            <th style={{ background: 'transparent', borderBottom: '1px solid var(--border)', fontSize: 11 }}>Version 2</th>
                            <th style={{ background: 'transparent', borderBottom: '1px solid var(--border)', fontSize: 11 }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.field_comparison.map((f, i) => (
                            <tr key={i} style={{ background: 'var(--bg-input)' }}>
                              <td style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-heading)', borderTopLeftRadius: 6, borderBottomLeftRadius: 6 }}>{f.field}</td>
                              <td style={{ fontSize: 12, color: 'var(--text)' }}>{f.v1_value || '—'}</td>
                              <td style={{ fontSize: 12, color: 'var(--text)' }}>{f.v2_value || '—'}</td>
                              <td>
                                <span className={`badge ${
                                  f.status === 'Match' ? 'badge-green' : 
                                  f.status === 'Conflict' ? 'badge-red' : 
                                  f.status === 'Supplementary' ? 'badge-blue' : 'badge-yellow'
                                }`} style={{ fontSize: 10 }}>{f.status}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Evidence Snippets */}
                {d.evidence_snippets && (
                  <div className="card">
                    <div className="card-title"><TagIcon />Evidence Highlights</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div style={{ padding: 12, background: 'var(--bg-input)', borderRadius: 8, borderLeft: '3px solid var(--accent)' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase' }}>Version 1 Evidence</div>
                        <div style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--text)', lineHeight: 1.5 }}>"{d.evidence_snippets.case1}"</div>
                      </div>
                      <div style={{ padding: 12, background: 'var(--bg-input)', borderRadius: 8, borderLeft: '3px solid var(--success)' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase' }}>Version 2 Evidence</div>
                        <div style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--text)', lineHeight: 1.5 }}>"{d.evidence_snippets.case2}"</div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="card">
                  {d.reasoning && (
                    <div style={{ background: 'var(--bg-input)', borderRadius: 8, padding: 12, fontSize: 13, lineHeight: 1.6, marginBottom: 12, borderLeft: '3px solid var(--accent)' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>AI Reasoning</div>
                      {d.reasoning}
                    </div>
                  )}

                  {/* Human override — just buttons */}
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: `1px solid var(--danger)`, background: manualDupDecision === 'duplicate' ? 'var(--danger)' : 'transparent', color: manualDupDecision === 'duplicate' ? '#fff' : 'var(--danger)', cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all 0.2s' }}
                      onClick={() => setManualDupDecision(manualDupDecision === 'duplicate' ? null : 'duplicate')}>
                      Mark as Duplicate
                    </button>
                    <button style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: `1px solid var(--success)`, background: manualDupDecision === 'not_duplicate' ? 'var(--success)' : 'transparent', color: manualDupDecision === 'not_duplicate' ? '#fff' : 'var(--success)', cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all 0.2s' }}
                      onClick={() => setManualDupDecision(manualDupDecision === 'not_duplicate' ? null : 'not_duplicate')}>
                      Mark as Not Duplicate
                    </button>
                  </div>
                </div>
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
