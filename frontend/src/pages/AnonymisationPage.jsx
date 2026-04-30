import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { anonymize, uploadFile } from '../lib/api'

// Keys match what backend all_entities[].layer actually returns
const LAYER_COLORS = {
  '1 — Regex':        'var(--accent)',
  '2 — Presidio/NER': 'var(--success)',
  '3 — Gemini AI':    'var(--purple)',
}
const LAYER_LABELS = {
  '1 — Regex':        'Regex Rules',
  '2 — Presidio/NER': 'Presidio NER',
  '3 — Gemini AI':    'AI Detection',
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

  // Group entities by layer
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
          3-layer hybrid: Regex rules → Presidio + spaCy NER → AI contextual detection
        </p>
      </div>

      <div className="two-col">
        {/* ── Left: input ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="card-title"><UploadIcon />Upload Document</div>
            <div {...getRootProps()} className={`dropzone${isDragActive ? ' active' : ''}`}>
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
                    <div className="dropzone-hint">PDF, DOCX, TXT</div>
                  </>
              }
            </div>
          </div>

          <div className="card">
            <div className="card-title"><EditIcon />Input Text</div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Anonymisation Mode</label>
              <select className="form-select" value={mode} onChange={e => setMode(e.target.value)}>
                <option value="pseudonymise">Pseudonymise — reversible tokens e.g. [PERSON_001]</option>
                <option value="full">Full Anonymisation — irreversible, ages generalised to brackets</option>
              </select>
            </div>
            <textarea
              className="form-textarea"
              style={{ minHeight: 320 }}
              placeholder={'Example:\n"Patient Ramesh Kumar, 45M, Aadhaar 1234-5678-9012, admitted at Apollo Delhi on 12 Jan 2024..."'}
              value={text}
              onChange={e => setText(e.target.value)}
            />
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

          {/* Explanation */}
          <div className="card" style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
            <div style={{ fontWeight: 600, color: 'var(--text-heading)', marginBottom: 8, fontSize: 13 }}>How it works</div>
            <p><span style={{ color: 'var(--accent)' }}>Layer 1 — Regex</span> catches structured Indian PII: Aadhaar, PAN, Passport, Phone, Email, Dates, Pincodes.</p>
            <p style={{ marginTop: 6 }}><span style={{ color: 'var(--success)' }}>Layer 2 — Presidio + spaCy</span> detects names, organisations, and locations via trained NER.</p>
            <p style={{ marginTop: 6 }}><span style={{ color: 'var(--purple)' }}>Layer 3 — AI</span> catches contextual PHI that requires medical domain knowledge.</p>
          </div>
        </div>

        {/* ── Right: results ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {result && (
            <>
              <div className="card">
                <div className="card-title" style={{ justifyContent: 'space-between' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CheckIcon />Anonymised Output
                  </span>
                  <span className="badge badge-green">{result.total_entities} entities redacted</span>
                </div>
                <div className="anon-text-block">{result.anonymized_text}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => navigator.clipboard.writeText(result.anonymized_text)}
                  >
                    <CopyIcon />Copy text
                  </button>
                  {mode === 'pseudonymise' && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>
                      Token map stored — reversal available on request
                    </span>
                  )}
                </div>
              </div>

              {/* Detection breakdown by layer */}
              {Object.keys(grouped).length > 0 && (
                <div className="card">
                  <div className="card-title"><LayersIcon />Detection by Layer</div>
                  {Object.entries(grouped).map(([layer, entities]) => (
                    <div key={layer} style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span style={{
                          fontSize: 11, fontWeight: 600,
                          color: LAYER_COLORS[layer] || 'var(--text-muted)',
                          background: `${LAYER_COLORS[layer] || 'var(--text-muted)'}18`,
                          padding: '2px 8px', borderRadius: 100,
                        }}>
                          {LAYER_LABELS[layer] || layer}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{entities.length} found</span>
                      </div>
                      <div className="entity-list">
                        {entities.map((e, i) => (
                          <div key={i} className="entity-chip">
                            <span className="entity-chip-label">{e.category}</span>
                            <span className="entity-chip-value">{e.token}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Regex rule detail table */}
              {result.rule_matches?.length > 0 && (
                <div className="card">
                  <div className="card-title"><HashIcon />Layer 1 — Regex Matches</div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Type</th><th>Original Value</th><th>Token</th></tr></thead>
                      <tbody>
                        {result.rule_matches.slice(0, 30).map((m, i) => (
                          <tr key={i}>
                            <td><span className="badge badge-blue">{m.category}</span></td>
                            <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{m.value}</td>
                            <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--accent)' }}>{m.token}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {!result && !loading && (
            <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 240, flexDirection: 'column', gap: 12 }}>
              <div style={{ color: 'var(--text-dim)' }}><ShieldIcon style={{ width: 40, height: 40 }} /></div>
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Paste text or upload a document to begin</p>
            </div>
          )}

          {loading && (
            <div className="card loading-center" style={{ minHeight: 240 }}>
              <div className="spinner spinner-lg" />
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Running 3-layer detection…</span>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function ShieldIcon({ style }) { return <svg style={style} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> }
function UploadIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> }
function EditIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> }
function CheckIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> }
function CopyIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> }
function LayersIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg> }
function HashIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg> }
function AlertIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> }
