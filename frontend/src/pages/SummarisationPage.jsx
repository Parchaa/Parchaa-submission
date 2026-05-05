import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { summarize, uploadFile } from '../lib/api'
import {
  UploadIcon, FileTextIcon, DocIcon, AlertIcon, CheckIcon,
  ArrowIcon, CalendarIcon, XCircleIcon, CopyIcon, DownloadIcon,
} from '../components/Icons'

const DOC_TYPES = [
  { value: 'SUGAM Application',               label: 'SUGAM Application (Drug Approval)' },
  { value: 'SAE Case Narration',              label: 'SAE Case Narration (Adverse Event)' },
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

function SugamResult({ data }) {
  const recStyle = {
    'Proceed':                { color: 'var(--success)',  bg: 'rgba(52,211,153,0.1)',  border: 'rgba(52,211,153,0.3)'  },
    'Request Additional Info':{ color: 'var(--warning)',  bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.3)'  },
    'Flag for Review':        { color: 'var(--danger)',   bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.3)'   },
  }
  const rs = recStyle[data.recommendation] || { color: 'var(--accent)', bg: 'rgba(79,142,247,0.1)', border: 'rgba(79,142,247,0.3)' }
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
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', background: rs.bg, borderRadius: 100, border: `1px solid ${rs.border}` }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: rs.color }}>Recommendation: {data.recommendation}</span>
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
          <div className="card-title" style={{ color: 'var(--danger)' }}><XCircleIcon />Missing Information</div>
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

function formatResultAsText(type, data) {
  const lines = []
  const sep = '='.repeat(60)
  const sub = '-'.repeat(40)
  lines.push(sep, `CDSCO RegAI — Document Summary`, `Type: ${type}`, sep, '')

  if (type === 'SUGAM Application') {
    if (data.application_type) lines.push(`Application Type: ${data.application_type}`)
    if (data.applicant)        lines.push(`Applicant: ${data.applicant}`)
    if (data.product)          lines.push(`Product: ${data.product}`)
    if (data.regulatory_status) lines.push(`Regulatory Status: ${data.regulatory_status}`)
    if (data.recommendation)   lines.push(`Recommendation: ${data.recommendation}`)
    lines.push('')
    if (data.clinical_data_summary) { lines.push('CLINICAL DATA SUMMARY', sub, data.clinical_data_summary, '') }
    if (data.safety_profile)        { lines.push('SAFETY PROFILE', sub, data.safety_profile, '') }
    if (data.reviewer_notes)        { lines.push('REVIEWER NOTES', sub, data.reviewer_notes, '') }
    if (data.key_claims?.length)    { lines.push('KEY CLAIMS', sub); data.key_claims.forEach((c, i) => lines.push(`  ${i+1}. ${c}`)); lines.push('') }
    if (data.missing_information?.length) { lines.push('MISSING INFORMATION', sub); data.missing_information.forEach((m, i) => lines.push(`  ${i+1}. ${m}`)); lines.push('') }
  } else if (type === 'SAE Case Narration') {
    if (data.case_id)          lines.push(`Case ID: ${data.case_id}`)
    if (data.suspect_drug)     lines.push(`Suspect Drug: ${data.suspect_drug}`)
    if (data.onset_date)       lines.push(`Onset Date: ${data.onset_date}`)
    if (data.outcome)          lines.push(`Outcome: ${data.outcome}`)
    if (data.causality)        lines.push(`Causality: ${data.causality}`)
    if (data.resolution_status) lines.push(`Resolution: ${data.resolution_status}`)
    lines.push('')
    if (data.patient_profile)  { lines.push('PATIENT PROFILE', sub, data.patient_profile, '') }
    if (data.event)            { lines.push('EVENT DESCRIPTION', sub, data.event, '') }
    if (data.case_summary)     { lines.push('CASE SUMMARY', sub, data.case_summary, '') }
    if (data.seriousness_criteria?.length) { lines.push('SERIOUSNESS CRITERIA (ICH E2A)', sub); data.seriousness_criteria.forEach((c, i) => lines.push(`  ${i+1}. ${c}`)); lines.push('') }
    if (data.key_findings?.length)         { lines.push('KEY FINDINGS', sub); data.key_findings.forEach((f, i) => lines.push(`  ${i+1}. ${f}`)); lines.push('') }
    if (data.action_required)  { lines.push('ACTION REQUIRED', sub, data.action_required, '') }
  } else {
    if (data.meeting_date)     lines.push(`Meeting Date: ${data.meeting_date}`)
    if (data.attendees?.length) lines.push(`Attendees: ${data.attendees.join(', ')}`)
    lines.push('')
    if (data.executive_summary) { lines.push('EXECUTIVE SUMMARY', sub, data.executive_summary, '') }
    if (data.key_decisions?.length)  { lines.push('KEY DECISIONS', sub); data.key_decisions.forEach((d, i) => lines.push(`  ${i+1}. ${d}`)); lines.push('') }
    if (data.action_items?.length) {
      lines.push('ACTION ITEMS', sub)
      data.action_items.forEach((a, i) => {
        const txt = typeof a === 'string' ? a : a.action
        const meta = typeof a === 'object' ? [a.owner && `Owner: ${a.owner}`, a.deadline && `Due: ${a.deadline}`].filter(Boolean).join(' · ') : ''
        lines.push(`  ${i+1}. ${txt}${meta ? ` [${meta}]` : ''}`)
      })
      lines.push('')
    }
    if (data.next_steps?.length)       { lines.push('NEXT STEPS', sub); data.next_steps.forEach((s, i) => lines.push(`  ${i+1}. ${s}`)); lines.push('') }
    if (data.unresolved_issues?.length) { lines.push('UNRESOLVED ISSUES', sub); data.unresolved_issues.forEach((u, i) => lines.push(`  ${i+1}. ${u}`)); lines.push('') }
    if (data.agenda_items?.length)     { lines.push('AGENDA ITEMS', sub); data.agenda_items.forEach((a, i) => lines.push(`  ${i+1}. ${a}`)); lines.push('') }
  }

  return lines.join('\n')
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

  const copyResult = () => {
    if (!result) return
    navigator.clipboard.writeText(formatResultAsText(result.type, result.data))
  }

  const downloadResult = () => {
    if (!result) return
    const content = formatResultAsText(result.type, result.data)
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `CDSCO_Summary_${Date.now()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

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
              style={{ minHeight: 260 }}
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
            {text.length > 150000 && (
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
              {loading ? <><div className="spinner" />Summarising…</> : <><FileTextIcon />Generate Summary</>}
            </button>
            {error && <div className="alert alert-error" style={{ marginTop: 10 }}><AlertIcon />{error}</div>}
        </div>

        {loading && (
            <div className="card loading-center" style={{ minHeight: 200 }}>
              <div className="spinner spinner-lg" />
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Generating structured summary…</span>
            </div>
          )}

          {result && !loading && (
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-secondary btn-sm" onClick={copyResult}>
                  <CopyIcon />Copy summary
                </button>
                <button className="btn btn-secondary btn-sm" onClick={downloadResult}>
                  <DownloadIcon />Download .txt
                </button>
              </div>
              {result.type === 'SUGAM Application'
                ? <SugamResult data={result.data} />
                : result.type === 'SAE Case Narration'
                ? <SAEResult data={result.data} />
                : <MeetingResult data={result.data} />}
            </>
          )}

        {!result && !loading && (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 160, gap: 12 }}>
            <FileTextIcon size={40} style={{ color: 'var(--text-dim)' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Structured summary will appear here</p>
          </div>
        )}
      </div>
    </>
  )
}
