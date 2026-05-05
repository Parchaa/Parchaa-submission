import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { anonymize, uploadFile } from '../lib/api'
import {
  ShieldIcon, UploadIcon, EditIcon, CheckIcon, CopyIcon, DownloadIcon,
  LayersIcon, HashIcon, AlertIcon,
} from '../components/Icons'

const LAYER_STYLE = {
  '1 — Regex':        { color: 'var(--accent)',   bg: 'rgba(79,142,247,0.1)',   label: 'Layer 1 — Regex Rules',   dot: '#4f8ef7' },
  '2 — Presidio/NER': { color: 'var(--success)',  bg: 'rgba(52,211,153,0.1)',  label: 'Layer 2 — Presidio / NER', dot: '#34d399' },
  '3 — AI Model':     { color: 'var(--purple)',   bg: 'rgba(167,139,250,0.1)', label: 'Layer 3 — AI Model',       dot: '#a78bfa' },
}

const LAYER_KEYS = ['1 — Regex', '2 — Presidio/NER', '3 — AI Model']
const TRUNCATE_LIMIT = 150000

function LayerNavigator({ grouped }) {
  const [activeIdx, setActiveIdx] = useState(0)
  const keys = LAYER_KEYS.filter(k => grouped[k]?.length > 0)
  if (keys.length === 0) return null

  const currentKey = keys[activeIdx] || keys[0]
  const entities = grouped[currentKey] || []
  const ls = LAYER_STYLE[currentKey] || { color: 'var(--text-muted)', bg: 'rgba(107,120,153,0.1)', label: currentKey, dot: '#6b7099' }

  const prev = () => setActiveIdx(i => (i - 1 + keys.length) % keys.length)
  const next = () => setActiveIdx(i => (i + 1) % keys.length)

  return (
    <div className="card">
      <div className="card-title" style={{ justifyContent: 'space-between' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <LayersIcon />Detected Entities
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          {keys.reduce((sum, k) => sum + (grouped[k]?.length || 0), 0)} total across {keys.length} layer{keys.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Layer tab bar */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {keys.map((k, i) => {
          const s = LAYER_STYLE[k] || {}
          const isActive = i === activeIdx
          return (
            <button
              key={k}
              onClick={() => setActiveIdx(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 12px', borderRadius: 100, border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 600,
                background: isActive ? s.bg : 'var(--bg-input)',
                color: isActive ? s.color : 'var(--text-muted)',
                outline: isActive ? `1.5px solid ${s.dot}` : '1.5px solid transparent',
                transition: 'all 0.15s',
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
              {s.label}
              <span style={{
                marginLeft: 4, padding: '0 6px', borderRadius: 100,
                background: isActive ? s.dot : 'var(--border)',
                color: isActive ? '#fff' : 'var(--text-muted)',
                fontSize: 10,
              }}>
                {grouped[k]?.length || 0}
              </span>
            </button>
          )
        })}
      </div>

      {/* Arrow navigation + entity count */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <button
          onClick={prev}
          disabled={keys.length <= 1}
          style={{
            width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)',
            background: 'var(--bg-input)', color: 'var(--text-muted)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
            opacity: keys.length <= 1 ? 0.3 : 1,
          }}
        >‹</button>
        <span style={{ fontSize: 12, color: ls.color, fontWeight: 600, flex: 1 }}>
          {ls.label}
          <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 8 }}>
            {entities.length} entit{entities.length !== 1 ? 'ies' : 'y'} found
          </span>
        </span>
        <button
          onClick={next}
          disabled={keys.length <= 1}
          style={{
            width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)',
            background: 'var(--bg-input)', color: 'var(--text-muted)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
            opacity: keys.length <= 1 ? 0.3 : 1,
          }}
        >›</button>
      </div>

      {/* Entity table */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th>Original Value</th>
              <th>Replaced With</th>
            </tr>
          </thead>
          <tbody>
            {entities.map((e, i) => (
              <tr key={i}>
                <td>
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 100,
                    background: ls.bg, color: ls.color,
                  }}>
                    {e.category}
                  </span>
                </td>
                <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-muted)' }}>
                  {e.value || <em style={{ color: 'var(--text-dim)' }}>—</em>}
                </td>
                <td style={{ fontFamily: 'monospace', fontSize: 12, color: ls.color }}>
                  {e.token}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function AnonymisationPage() {
  const [text, setText] = useState('')
  const [mode, setMode] = useState('pseudonymise')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)

  const onDrop = useCallback(async (files) => {
    if (!files[0]) return
    setUploading(true)
    setError('')
    try {
      const { text: extracted } = await uploadFile(files[0])
      setText(extracted)
    } catch (e) {
      setError('File upload failed: ' + (e.response?.data?.detail || e.message))
    } finally {
      setUploading(false)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': [],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [],
      'text/plain': [],
    },
    multiple: false,
  })

  const run = async () => {
    if (!text.trim()) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const r = await anonymize(text, mode)
      setResult(r)
    } catch (e) {
      setError(e.response?.data?.detail || e.message)
    } finally {
      setLoading(false)
    }
  }

  const copyResult = () => {
    if (!result) return
    navigator.clipboard.writeText(result.anonymized_text)
  }

  const downloadResult = () => {
    if (!result) return
    const grouped = result.all_entities.reduce((acc, e) => {
      const key = e.layer || 'Other'
      ;(acc[key] = acc[key] || []).push(e)
      return acc
    }, {})

    const lines = [
      '='.repeat(60),
      'CDSCO RegAI — PII/PHI Anonymisation Output',
      `Mode: ${mode === 'pseudonymise' ? 'Pseudonymisation (reversible tokens)' : 'Full Anonymisation (irreversible)'}`,
      '='.repeat(60),
      '',
      'ANONYMISED TEXT',
      '-'.repeat(40),
      result.anonymized_text,
      '',
      `Total entities redacted: ${result.total_entities}`,
    ]

    LAYER_KEYS.forEach(key => {
      const entities = grouped[key]
      if (!entities?.length) return
      const ls = LAYER_STYLE[key] || { label: key }
      lines.push('', ls.label.toUpperCase(), '-'.repeat(40))
      entities.forEach(e => {
        const cat = (e.category || '').padEnd(24)
        const val = (e.value || '—').padEnd(32)
        lines.push(`  ${cat} ${val} → ${e.token}`)
      })
    })

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `CDSCO_Anonymised_${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const grouped = result
    ? result.all_entities.reduce((acc, e) => {
        const key = e.layer || 'Other'
        ;(acc[key] = acc[key] || []).push(e)
        return acc
      }, {})
    : {}

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">PII / PHI Anonymisation</h1>
        <p className="page-subtitle">
          3-layer hybrid pipeline: Regex rules → Presidio + spaCy NER → AI contextual detection
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* ── Input section ── */}
        <div className="card">
          <div className="card-title"><UploadIcon />Upload or Paste Document</div>
          <div {...getRootProps()} className={`dropzone${isDragActive ? ' active' : ''}`} style={{ marginBottom: 12 }}>
            <input {...getInputProps()} />
            {uploading
              ? <div className="loading-center" style={{ padding: 16 }}><div className="spinner" />Extracting text…</div>
              : <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  <div className="dropzone-text">Drop a file or <span>click to browse</span></div>
                  <div className="dropzone-hint">PDF · DOCX · TXT</div>
                </>
            }
          </div>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">Anonymisation Mode</label>
            <select className="form-select" value={mode} onChange={e => setMode(e.target.value)}>
              <option value="pseudonymise">Pseudonymise — reversible tokens e.g. [PERSON_001]</option>
              <option value="full">Full Anonymisation — irreversible, ages generalised to brackets</option>
            </select>
          </div>
          <textarea
            className="form-textarea"
            style={{ minHeight: 260 }}
            placeholder={'Example:\n"Patient Ramesh Kumar, 45M, Aadhaar 1234-5678-9012, admitted at Apollo Delhi on 12 Jan 2024..."'}
            value={text}
            onChange={e => setText(e.target.value)}
          />
          {text.length > TRUNCATE_LIMIT && (
            <div className="alert alert-warning" style={{ marginTop: 8 }}>
              <AlertIcon />Document exceeds 150,000 characters — content will be truncated before processing.
            </div>
          )}
          <button
            className="btn btn-primary btn-full"
            style={{ marginTop: 12 }}
            onClick={run}
            disabled={loading || !text.trim()}
          >
            {loading ? <><div className="spinner" />Processing…</> : <><ShieldIcon />Run Anonymisation</>}
          </button>
          {error && <div className="alert alert-error" style={{ marginTop: 10 }}><AlertIcon />{error}</div>}
        </div>

        <div className="card" style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
          <div style={{ fontWeight: 600, color: 'var(--text-heading)', marginBottom: 8, fontSize: 13 }}>How it works</div>
          <p><span style={{ color: 'var(--accent)' }}>Layer 1 — Regex</span> catches structured Indian PII: Aadhaar, PAN, Passport, Phone, Email, Dates, Pincodes.</p>
          <p style={{ marginTop: 6 }}><span style={{ color: 'var(--success)' }}>Layer 2 — Presidio + spaCy</span> detects names, organisations, and locations via trained NER.</p>
          <p style={{ marginTop: 6 }}><span style={{ color: 'var(--purple)' }}>Layer 3 — AI Model</span> catches contextual PHI that requires medical domain knowledge.</p>
        </div>

        {/* ── Results section ── */}
        {loading && (
          <div className="card loading-center" style={{ minHeight: 200 }}>
            <div className="spinner spinner-lg" />
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Running 3-layer detection…</span>
          </div>
        )}

        {result && !loading && (
          <>
            <div className="card">
              <div className="card-title" style={{ justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CheckIcon />Anonymised Output
                </span>
                <span className="badge badge-green">{result.total_entities} entities redacted</span>
              </div>
              <div className="anon-text-block">{result.anonymized_text}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <button className="btn btn-secondary btn-sm" onClick={copyResult}>
                  <CopyIcon />Copy text
                </button>
                <button className="btn btn-secondary btn-sm" onClick={downloadResult}>
                  <DownloadIcon />Download .txt
                </button>
                {mode === 'pseudonymise' && (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Token map stored — reversal available on request
                  </span>
                )}
              </div>
            </div>

            <LayerNavigator grouped={grouped} />
          </>
        )}

        {!result && !loading && (
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 160, flexDirection: 'column', gap: 12 }}>
            <ShieldIcon size={40} style={{ color: 'var(--text-dim)' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Anonymised output will appear here</p>
          </div>
        )}
      </div>
    </>
  )
}
