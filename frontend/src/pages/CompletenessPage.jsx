import { useState, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { assessCompleteness, compareDocuments, uploadFile } from '../lib/api'
import HistoryPanel from '../components/HistoryPanel'
import {
  CheckIcon, CheckCircleIcon, XCircleIcon, AlertCircleIcon, MinusIcon,
  ZapIcon, AlertIcon, ListIcon, LightbulbIcon, GitIcon, DiffIcon, CodeIcon,
  DocAIcon, DocBIcon, CopyIcon, DownloadIcon, InfoIcon
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
function useUploadDropzone(setter, setFile, setError) {
  return useDropzone({
    onDrop: async (files) => {
      if (!files[0]) return
      if (setFile) setFile(files[0])
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

function highlightText(text, query) {
  if (!query) return text;
  const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, 'gi'));
  return parts.map((part, i) => 
    part.toLowerCase() === query.toLowerCase() 
      ? <mark key={i} style={{ background: 'var(--warning)', color: '#000', padding: '2px 4px', borderRadius: 3, fontWeight: 600 }}>{part}</mark> 
      : part
  );
}


const DB_NAME = 'cdsco_completeness_db'
const STORE_NAME = 'files'

function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME)
    }
    request.onsuccess = (e) => resolve(e.target.result)
    request.onerror = (e) => reject(e.target.error)
  })
}

async function saveFileToDB(file, key) {
  if (!file) return
  const db = await initDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    store.put(file, key)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}

async function getFileFromDB(key) {
  const db = await initDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.get(key)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export default function CompletenessPage() {
  const [activeTab, setActiveTab] = useState('completeness')
  const [text, setText] = useState('')
  const [checklistType, setChecklistType] = useState('Clinical Trial Application')
  const [doc1, setDoc1] = useState('')
  const [doc2, setDoc2] = useState('')
  const [file1, setFile1] = useState(null)
  const [file2, setFile2] = useState(null)
  const [file1Url, setFile1Url] = useState('')
  const [file2Url, setFile2Url] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [showFlowOverlay, setShowFlowOverlay] = useState(false)
  const [selectedChangeForDiff, setSelectedChangeForDiff] = useState(null)
  const [viewMode, setViewMode] = useState('pdf') // 'pdf' or 'text'

  const dzText = useUploadDropzone(setText, null, setError)
  const dz1    = useUploadDropzone(setDoc1, (f) => { setFile1(f); saveFileToDB(f, 'file1') }, setError)
  const dz2    = useUploadDropzone(setDoc2, (f) => { setFile2(f); saveFileToDB(f, 'file2') }, setError)

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
        const r = await assessCompleteness(text, checklistType, '')
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

  // 1. Initial mount: restore last active tab and IndexedDB
  useEffect(() => {
    const init = async () => {
      try {
        const savedTab = localStorage.getItem('cdsco_completeness_activeTab')
        if (savedTab) setActiveTab(savedTab)

        const f1 = await getFileFromDB('file1')
        const f2 = await getFileFromDB('file2')
        if (f1) setFile1(f1)
        if (f2) setFile2(f2)
      } catch {}
    }
    init()
  }, [])

  // 2. Load tab state when activeTab changes
  useEffect(() => {
    try {
      localStorage.setItem('cdsco_completeness_activeTab', activeTab)
      const saved = localStorage.getItem(`cdsco_completeness_data_${activeTab}`)
      if (saved) {
        const data = JSON.parse(saved)
        if (data.result) setResult(data.result)
        else setResult(null)
        if (data.text) setText(data.text)
        if (data.checklistType) setChecklistType(data.checklistType)
        if (data.doc1) setDoc1(data.doc1)
        if (data.doc2) setDoc2(data.doc2)
      } else {
        setResult(null)
      }
    } catch {
      setResult(null)
    }
  }, [activeTab])

  // 3. Save state when result changes
  useEffect(() => {
    if (result) {
      try {
        const dataToSave = activeTab === 'completeness' 
          ? { result, text, checklistType }
          : { result, doc1, doc2 }
        localStorage.setItem(`cdsco_completeness_data_${activeTab}`, JSON.stringify(dataToSave))
      } catch {}
    }
  }, [result, activeTab, text, checklistType, doc1, doc2])

  useEffect(() => {
    console.log('CompletenessPage: File1 changed:', file1 ? `${file1.name} (${file1.type})` : 'null')
    if (file1) {
      const url = URL.createObjectURL(file1)
      setFile1Url(url)
      return () => {
        console.log('CompletenessPage: Revoking URL1')
        URL.revokeObjectURL(url)
      }
    } else {
      setFile1Url('')
    }
  }, [file1])

  useEffect(() => {
    console.log('CompletenessPage: File2 changed:', file2 ? `${file2.name} (${file2.type})` : 'null')
    if (file2) {
      const url = URL.createObjectURL(file2)
      setFile2Url(url)
      return () => {
        console.log('CompletenessPage: Revoking URL2')
        URL.revokeObjectURL(url)
      }
    } else {
      setFile2Url('')
    }
  }, [file2])

  const isPdf1 = !!(file1 && (file1.type === 'application/pdf' || file1.name?.toLowerCase().endsWith('.pdf')))
  const isPdf2 = !!(file2 && (file2.type === 'application/pdf' || file2.name?.toLowerCase().endsWith('.pdf')))

  console.log('CompletenessPage State:', { isPdf1, isPdf2, hasUrl1: !!file1Url, hasUrl2: !!file2Url, viewMode })

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
        <button className={`tab-btn${activeTab === 'completeness' ? ' active' : ''}`} onClick={() => setActiveTab('completeness')}>
          Completeness Check
        </button>
        <button className={`tab-btn${activeTab === 'compare' ? ' active' : ''}`} onClick={() => setActiveTab('compare')}>
          Document Comparison
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {activeTab === 'completeness' && (
          <HistoryPanel
            module="completeness"
            onLoad={(data) => {
              setResult({ type: 'completeness', data: data.result })
              setChecklistType(data.doc_type || 'Clinical Trial Application')
              setError('')
            }}
          />
        )}

        {/* ── Input section ── */}
        {activeTab === 'completeness' ? (
          <div className="card">
            <div className="card-title" style={{ justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckIcon />Completeness Check
              </span>
              <button 
                className="btn btn-secondary" 
                style={{ padding: '4px 10px', fontSize: '11px' }}
                onClick={() => setShowFlowOverlay(true)}
              >
                <InfoIcon size={12} /> How is this scored?
              </button>
            </div>

            {showFlowOverlay && (
              <div style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0,0,0,0.6)', zIndex: 9999,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '20px'
              }} onClick={() => setShowFlowOverlay(false)}>
                <div style={{
                  background: 'var(--bg-card)', padding: '28px', borderRadius: '16px',
                  width: '100%', maxWidth: '650px', boxShadow: 'var(--shadow)',
                  position: 'relative', border: '1px solid var(--border)'
                }} onClick={e => e.stopPropagation()}>
                  <button 
                    onClick={() => setShowFlowOverlay(false)} 
                    style={{ position: 'absolute', top: 16, right: 16, background: 'var(--bg-hover)', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >✕</button>
                  
                  <h3 style={{ marginTop: 0, color: 'var(--text-heading)', fontSize: '18px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <InfoIcon /> Completeness Scoring Methodology
                  </h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '24px', lineHeight: 1.6 }}>
                    We do <strong>not</strong> simply ask the LLM for a random score. Instead, we use a deterministic mathematical formula based on the LLM's classification of specific mandatory parameters.
                  </p>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ background: 'var(--bg-input)', padding: '16px', borderRadius: '12px' }}>
                      <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-heading)', marginBottom: 8 }}>1. Parameter Extraction</div>
                      <div style={{ fontSize: '13px', color: 'var(--text)', marginBottom: 8 }}>
                        The AI is prompted to explicitly search the document for CDSCO mandatory checklist items (e.g., <em>Form CT-04, Clinical Protocol, ICFs, Investigator's Brochure, EC Approval</em>).
                      </div>
                    </div>

                    <div style={{ background: 'var(--bg-input)', padding: '16px', borderRadius: '12px' }}>
                      <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-heading)', marginBottom: 8 }}>2. Item Classification</div>
                      <div style={{ fontSize: '13px', color: 'var(--text)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', gap: 8 }}><span className="badge badge-green" style={{width: 60, justifyContent: 'center'}}>Present</span><span>(1.0 weight) The item is clearly and adequately addressed.</span></div>
                        <div style={{ display: 'flex', gap: 8 }}><span className="badge badge-yellow" style={{width: 60, justifyContent: 'center'}}>Partial</span><span>(0.5 weight) The item is mentioned but lacks required detail or format.</span></div>
                        <div style={{ display: 'flex', gap: 8 }}><span className="badge badge-red" style={{width: 60, justifyContent: 'center'}}>Missing</span><span>(0.0 weight) The item is entirely absent from the document.</span></div>
                        <div style={{ display: 'flex', gap: 8 }}><span className="badge badge-purple" style={{width: 60, justifyContent: 'center'}}>N/A</span><span>Excluded from calculation. Genuinely does not apply.</span></div>
                      </div>
                    </div>

                    <div style={{ background: 'var(--bg-input)', padding: '16px', borderRadius: '12px' }}>
                      <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-heading)', marginBottom: 8 }}>3. Mathematical Calculation</div>
                      <div style={{ fontSize: '13px', color: 'var(--text)', marginBottom: 8 }}>
                        <code style={{ background: 'var(--bg-card)', padding: '4px 8px', borderRadius: 4, color: 'var(--accent)' }}>
                          Score % = (Sum of weights) / (Count of applicable items) * 100
                        </code>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        <strong>Status Thresholds:</strong><br/>
                        • <span style={{color: 'var(--success)'}}>Complete</span>: ≥ 90%<br/>
                        • <span style={{color: 'var(--accent)'}}>Mostly Complete</span>: 70–89%<br/>
                        • <span style={{color: 'var(--warning)'}}>Incomplete</span>: 50–69%<br/>
                        • <span style={{color: 'var(--danger)'}}>Critical Gaps</span>: &lt; 50% (or any critical item Missing)
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                        <strong>Action Logic:</strong><br/>
                        • <span style={{color: 'var(--success)'}}>Approve for Review</span>: ≥ 90%<br/>
                        • <span style={{color: 'var(--warning)'}}>Issue Deficiency Letter</span>: 70–89%<br/>
                        • <span style={{color: 'var(--danger)'}}>Return Application</span>: &lt; 70%
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

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
                  <div className="card-title" style={{ justifyContent: 'space-between' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <CheckIcon />Completeness Score — {checklistType}
                    </span>
                    <button 
                      className="btn btn-secondary" 
                      style={{ padding: '3px 10px', fontSize: 10 }}
                      onClick={() => setShowFlowOverlay(true)}
                    >
                      <InfoIcon size={11} style={{ marginRight: 4 }} /> Score Reference
                    </button>
                  </div>
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

                <div className="card" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
                  <div className="card-title" style={{ fontSize: 13, color: 'var(--text-heading)', marginBottom: 8 }}><CheckCircleIcon /> Human-in-the-Loop Override</div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>Review the AI assessment above and make a final manual determination:</p>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <button className="btn btn-primary btn-sm" style={{ flex: 1, background: 'var(--success)', color: '#fff', border: 'none' }} onClick={() => alert('Application marked as Complete & Sent for Review.')}>
                      <CheckIcon size={14} /> Mark Complete & Send for Review
                    </button>
                    <button className="btn btn-primary btn-sm" style={{ flex: 1, background: 'var(--danger)', color: '#fff', border: 'none' }} onClick={() => alert('Application returned to sponsor.')}>
                      <XCircleIcon size={14} /> Return Application
                    </button>
                  </div>
                </div>
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
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>{c.section}</span>
                              <span className={`badge ${c.impact === 'High' ? 'badge-red' : c.impact === 'Medium' ? 'badge-yellow' : 'badge-green'}`}>{c.type}</span>
                              <span className={`badge ${c.impact === 'High' ? 'badge-red' : c.impact === 'Medium' ? 'badge-yellow' : 'badge-blue'}`}>{c.impact} Impact</span>
                            </div>
                            <button className="btn btn-secondary btn-sm" style={{ padding: '2px 8px', fontSize: 10 }} onClick={() => setSelectedChangeForDiff(c)}>
                              <DiffIcon size={12} /> Show Doc Change
                            </button>
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

      {/* Side-by-side Document Change Diff Overlay */}
      {selectedChangeForDiff && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.85)', zIndex: 99999,
          display: 'flex', flexDirection: 'column',
          padding: '30px'
        }} onClick={() => setSelectedChangeForDiff(null)}>
          <div style={{
            background: 'var(--bg-app)', borderRadius: '12px', flex: 1,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '12px 24px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text-heading)' }}>Change: {selectedChangeForDiff.section}</h3>
                  <span className={`badge ${selectedChangeForDiff.impact === 'High' ? 'badge-red' : selectedChangeForDiff.impact === 'Medium' ? 'badge-yellow' : 'badge-blue'}`}>{selectedChangeForDiff.type}</span>
                </div>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>{selectedChangeForDiff.description}</p>
                {(selectedChangeForDiff.text_before || selectedChangeForDiff.text_after) && (
                  <div style={{ marginTop: 6, fontSize: 11, color: 'var(--warning)', fontWeight: 600, display: 'flex', gap: 16 }}>
                    {selectedChangeForDiff.text_before && <span>Original: "{selectedChangeForDiff.text_before}"</span>}
                    {selectedChangeForDiff.text_after && <span>Revised: "{selectedChangeForDiff.text_after}"</span>}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div className="tabs" style={{ marginBottom: 0, padding: 2, background: 'var(--bg-input)', borderRadius: 8 }}>
                  <button className={`tab-btn btn-sm ${viewMode === 'pdf' ? 'active' : ''}`} style={{ padding: '4px 12px', fontSize: 11 }} onClick={() => setViewMode('pdf')}>PDF View</button>
                  <button className={`tab-btn btn-sm ${viewMode === 'text' ? 'active' : ''}`} style={{ padding: '4px 12px', fontSize: 11 }} onClick={() => setViewMode('text')}>Text View</button>
                </div>
                <button className="btn btn-secondary" onClick={() => setSelectedChangeForDiff(null)}><XCircleIcon /> Close</button>
              </div>
            </div>
            
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              {/* Version 1 */}
              <div style={{ flex: 1, padding: '24px', overflowY: 'auto', borderRight: '1px solid var(--border)', background: 'var(--bg-input)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ position: 'sticky', top: 0, background: 'var(--bg-input)', paddingBottom: 12, marginBottom: 12, borderBottom: '1px dashed var(--border)', zIndex: 10 }}>
                  <h4 style={{ margin: 0, color: 'var(--text-heading)', display: 'flex', alignItems: 'center', gap: 8 }}><DocAIcon /> Version 1 (Original)</h4>
                </div>
                {viewMode === 'pdf' && isPdf1 && file1Url ? (
                  <div style={{ flex: 1, position: 'relative', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
                    <iframe 
                      key={file1Url + selectedChangeForDiff.text_before}
                      src={`${file1Url}#search=${encodeURIComponent(selectedChangeForDiff.text_before || selectedChangeForDiff.section)}`} 
                      style={{ width: '100%', height: '100%', border: 'none', position: 'absolute', top: 0, left: 0 }} 
                      title="PDF 1"
                    />
                  </div>
                ) : (
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: 'var(--text)', fontFamily: 'monospace', lineHeight: 1.6, background: 'var(--bg-card)', padding: 16, borderRadius: 8, border: '1px solid var(--border)' }}>
                    {highlightText(doc1, selectedChangeForDiff.text_before || selectedChangeForDiff.section)}
                  </div>
                )}
              </div>
              
              {/* Version 2 */}
              <div style={{ flex: 1, padding: '24px', overflowY: 'auto', background: 'var(--bg-input)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ position: 'sticky', top: 0, background: 'var(--bg-input)', paddingBottom: 12, marginBottom: 12, borderBottom: '1px dashed var(--border)', zIndex: 10 }}>
                  <h4 style={{ margin: 0, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 8 }}><DocBIcon /> Version 2 (Revised)</h4>
                </div>
                {viewMode === 'pdf' && isPdf2 && file2Url ? (
                  <div style={{ flex: 1, position: 'relative', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
                    <iframe 
                      key={file2Url + selectedChangeForDiff.text_after}
                      src={`${file2Url}#search=${encodeURIComponent(selectedChangeForDiff.text_after || selectedChangeForDiff.section)}`} 
                      style={{ width: '100%', height: '100%', border: 'none', position: 'absolute', top: 0, left: 0 }} 
                      title="PDF 2"
                    />
                  </div>
                ) : (
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: 'var(--text)', fontFamily: 'monospace', lineHeight: 1.6, background: 'var(--bg-card)', padding: 16, borderRadius: 8, border: '1px solid var(--border)' }}>
                    {highlightText(doc2, selectedChangeForDiff.text_after || selectedChangeForDiff.section)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
