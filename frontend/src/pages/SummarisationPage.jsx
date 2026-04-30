import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { summarize, uploadFile } from '../lib/api'

// Keys must match backend PROMPTS dict exactly
const DOC_TYPES = [
  { value: 'SUGAM Application',              label: 'SUGAM Application (Drug Approval)' },
  { value: 'SAE Case Narration',             label: 'SAE Case Narration (Adverse Event)' },
  { value: 'Meeting Transcript / Audio Summary', label: 'Meeting Transcript / Audio Summary' },
]

function Field({ label, value }) {
  if (!value) return null
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>{value}</div>
    </div>
  )
}

function ListField({ label, items, color }) {
  if (!items?.length) return null
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6, fontWeight: 600 }}>{label}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, padding: '7px 12px', background: 'var(--bg-input)', borderRadius: 6, fontSize: 13, borderLeft: `3px solid ${color || 'var(--accent)'}` }}>
            <span style={{ color: color || 'var(--accent)', fontWeight: 600, minWidth: 20 }}>{i + 1}.</span>
            <span>{typeof item === 'string' ? item : JSON.stringify(item)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Renderer for SUGAM Application result
function SugamResult({ data }) {
  const recColor = { 'Proceed': 'var(--success)', 'Request Additional Info': 'var(--warning)', 'Flag for Review': 'var(--danger)' }
  return (
    <>
      <div className="card">
        <div className="card-title"><DocIcon />Application Overview</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          {[['Type', data.application_type], ['Applicant', data.applicant], ['Product', data.product], ['Regulatory Status', data.regulatory_status]].map(([l, v]) => v ? (
            <div key={l} style={{ background: 'var(--bg-input)', borderRadius: 6, padding: '8px 12px' }}>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 2 }}>{l}</div>
              <div style={{ fontSize: 13, color: 'var(--text-heading)' }}>{v}</div>
            </div>
          ) : null)}
        </div>
        {data.recommendation && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', background: `${recColor[data.recommendation] || 'var(--accent)'}18`, borderRadius: 100, border: `1px solid ${recColor[data.recommendation] || 'var(--accent)'}40` }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: recColor[data.recommendation] || 'var(--accent)' }}>Recommendation: {data.recommendation}</span>
          </div>
        )}
      </div>
      {(data.clinical_data_summary || data.safety_profile) && (
        <div className="card">
          <div className="card-title"><FileTextIcon />Clinical & Safety Summary</div>
          <Field label="Clinical Data Summary" value={data.clinical_data_summary} />
          <Field label="Safety Profile" value={data.safety_profile} />
          <Field label="Reviewer Notes" value={data.reviewer_notes} />
        </div>
      )}
      <ListField label="Key Claims" items={data.key_claims} color="var(--accent)" />
      {data.missing_information?.length > 0 && (
        <div className="card">
          <div className="card-title" style={{ color: 'var(--danger)' }}><XIcon />Missing Information</div>
          <div className="checklist">
            {data.missing_information.map((item, i) => (
              <div key={i} className="checklist-item fail">
                <XCircleIcon />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

// Renderer for SAE Case Narration result
function SAEResult({ data }) {
  return (
    <>
      <div className="card">
        <div className="card-title"><AlertIcon />Case Overview</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          {[
            ['Case ID', data.case_id],
            ['Suspect Drug', data.suspect_drug],
            ['Onset Date', data.onset_date],
            ['Outcome', data.outcome],
            ['Causality', data.causality],
            ['Resolution', data.resolution_status],
          ].map(([l, v]) => v ? (
            <div key={l} style={{ background: 'var(--bg-input)', borderRadius: 6, padding: '8px 12px' }}>
              <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 2 }}>{l}</div>
              <div style={{ fontSize: 13, color: 'var(--text-heading)' }}>{v}</div>
            </div>
          ) : null)}
        </div>
        <Field label="Patient Profile" value={data.patient_profile} />
        <Field label="Event Description" value={data.event} />
      </div>
      {data.case_summary && (
        <div className="card">
          <div className="card-title"><FileTextIcon />Case Summary</div>
          <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)' }}>{data.case_summary}</p>
        </div>
      )}
      <ListField label="Seriousness Criteria (ICH E2A)" items={data.seriousness_criteria} color="var(--danger)" />
      <ListField label="Key Findings" items={data.key_findings} color="var(--warning)" />
      {data.action_required && (
        <div className="card">
          <div className="card-title"><ArrowIcon />Action Required</div>
          <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text)' }}>{data.action_required}</p>
        </div>
      )}
    </>
  )
}

// Renderer for Meeting Transcript result
function MeetingResult({ data }) {
  return (
    <>
      <div className="card">
        <div className="card-title"><CalendarIcon />Meeting Details</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          {data.meeting_date && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Date: <strong style={{ color: 'var(--text-heading)' }}>{data.meeting_date}</strong></span>}
          {data.attendees?.length > 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Attendees: <strong style={{ color: 'var(--text-heading)' }}>{data.attendees.join(', ')}</strong></span>}
        </div>
        {data.executive_summary && <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)' }}>{data.executive_summary}</p>}
      </div>
      <ListField label="Key Decisions" items={data.key_decisions} color="var(--accent)" />
      {data.action_items?.length > 0 && (
        <div className="card">
          <div className="card-title"><CheckIcon />Action Items</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.action_items.map((a, i) => (
              <div key={i} style={{ padding: '9px 12px', background: 'var(--bg-input)', borderRadius: 6, fontSize: 13, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--accent)', fontWeight: 600, minWidth: 20, fontSize: 11 }}>{i + 1}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ color: 'var(--text-heading)' }}>{typeof a === 'string' ? a : a.action}</div>
                  {a.owner && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>Owner: {a.owner}{a.deadline ? ` · Due: ${a.deadline}` : ''}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <ListField label="Next Steps" items={data.next_steps} color="var(--success)" />
      <ListField label="Unresolved Issues" items={data.unresolved_issues} color="var(--danger)" />
      <ListField label="Agenda Items" items={data.agenda_items} color="var(--text-muted)" />
    </>
  )
}

export default function SummarisationPage() {
  const [text, setText] = useState('')
  const [docType, setDocType] = useState(DOC_TYPES[0].value)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)

  const onDrop = useCallback(async (files) => {
    if (!files[0]) return
    setUploading(true)
    try {
      const { text: extracted } = await uploadFile(files[0])
      setText(extracted)
    } catch (e) {
      setError('Upload failed: ' + (e.response?.data?.detail || e.message))
    } finally {
      setUploading(false)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, multiple: false })

  const run = async () => {
    if (!text.trim()) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const r = await summarize(text, docType)
      setResult({ type: docType, data: r })
    } catch (e) {
      setError(e.response?.data?.detail || e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Document Summarisation</h1>
        <p className="page-subtitle">
          Structured AI summaries for SUGAM applications, SAE narrations, and meeting transcripts
        </p>
      </div>

      <div className="two-col">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="card-title"><UploadIcon />Upload or Paste</div>
            <div {...getRootProps()} className={`dropzone${isDragActive ? ' active' : ''}`} style={{ marginBottom: 12 }}>
              <input {...getInputProps()} />
              {uploading
                ? <div className="loading-center" style={{ padding: 12 }}><div className="spinner" />Reading file…</div>
                : <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 28, height: 28, color: 'var(--text-dim)', marginBottom: 8 }}>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    <div className="dropzone-text">Drop file or <span>click to browse</span></div>
                    <div className="dropzone-hint">PDF · DOCX · TXT</div>
                  </>
              }
            </div>

            <div className="form-group" style={{ marginBottom: 10 }}>
              <label className="form-label">Document Type</label>
              <select className="form-select" value={docType} onChange={e => { setDocType(e.target.value); setResult(null) }}>
                {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <textarea
              className="form-textarea"
              style={{ minHeight: 320 }}
              placeholder={
                docType === 'SAE Case Narration'
                  ? 'Paste the SAE narration / adverse event report…'
                  : docType === 'Meeting Transcript / Audio Summary'
                  ? 'Paste the meeting transcript or audio transcription…'
                  : 'Paste the SUGAM application or drug approval document…'
              }
              value={text}
              onChange={e => setText(e.target.value)}
            />
            <button
              className="btn btn-primary btn-full"
              style={{ marginTop: 12 }}
              onClick={run}
              disabled={loading || !text.trim()}
            >
              {loading ? <><div className="spinner" />Summarising…</> : <><FileTextIcon />Generate Summary</>}
            </button>
            {error && <div className="alert alert-error" style={{ marginTop: 10 }}><AlertIcon />{error}</div>}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {loading && (
            <div className="card loading-center" style={{ minHeight: 200 }}>
              <div className="spinner spinner-lg" />
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Generating structured summary…</span>
            </div>
          )}

          {result && !loading && (
            result.type === 'SUGAM Application'
              ? <SugamResult data={result.data} />
              : result.type === 'SAE Case Narration'
              ? <SAEResult data={result.data} />
              : <MeetingResult data={result.data} />
          )}

          {!result && !loading && (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 200, gap: 12 }}>
              <FileTextIcon style={{ width: 40, height: 40, color: 'var(--text-dim)' }} />
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Structured summary will appear here</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function UploadIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> }
function FileTextIcon({ style }) { return <svg style={style} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> }
function DocIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> }
function AlertIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> }
function CheckIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> }
function ArrowIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg> }
function CalendarIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> }
function XIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> }
function XCircleIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> }
