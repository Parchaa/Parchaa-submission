import { useState, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { summarize, uploadFile, chatWithDocument } from '../lib/api'
import {
  UploadIcon, FileTextIcon, DocIcon, AlertIcon, CheckIcon,
  ArrowIcon, CalendarIcon, XCircleIcon, CopyIcon, DownloadIcon,
} from '../components/Icons'
import HistoryPanel from '../components/HistoryPanel'

const DOC_TYPES = [
  { value: 'SUGAM Application',                label: 'SUGAM Application (Drug Approval)' },
  { value: 'SAE Case Narration',               label: 'SAE Case Narration (Adverse Event)' },
  { value: 'Meeting Transcript / Audio Summary', label: 'Meeting Transcript / Audio Summary' },
]

const SUGAM_SUBTYPES = [
  { value: '',                        label: 'Auto-detect from document' },
  { value: 'New Drug Application',    label: 'New Drug Application (NDA / NME)' },
  { value: 'Clinical Trial Application', label: 'Clinical Trial Application (CTA)' },
  { value: 'Import Licence Application', label: 'Import Licence Application' },
  { value: 'Fixed Dose Combination',  label: 'Fixed Dose Combination (FDC)' },
  { value: 'PSUR / DSUR',            label: 'PSUR / DSUR (Periodic Safety Report)' },
]

// File types accepted per document category
const ACCEPT_BY_TYPE = {
  'SUGAM Application': {
    'application/pdf': ['.pdf'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    'text/plain': ['.txt'],
  },
  'SAE Case Narration': {
    'application/pdf': ['.pdf'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    'text/plain': ['.txt'],
  },
  'Meeting Transcript / Audio Summary': {
    'application/pdf': ['.pdf'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    'text/plain': ['.txt'],
    'audio/mpeg': ['.mp3'],
    'audio/wav': ['.wav'],
    'audio/mp4': ['.m4a', '.mp4'],
    'audio/ogg': ['.ogg'],
    'audio/webm': ['.webm'],
    'audio/aac': ['.aac'],
    'audio/flac': ['.flac'],
  },
}

const HINT_BY_TYPE = {
  'SUGAM Application': 'PDF · DOCX · TXT',
  'SAE Case Narration': 'PDF · DOCX · TXT',
  'Meeting Transcript / Audio Summary': 'PDF · DOCX · TXT · MP3 · WAV · M4A · OGG (audio transcribed automatically)',
}

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

const STATUS_STYLE = {
  Present: { color: 'var(--success)', bg: 'rgba(52,211,153,0.1)' },
  Absent:  { color: 'var(--danger)',  bg: 'rgba(239,68,68,0.1)' },
  Partial: { color: 'var(--warning)', bg: 'rgba(251,191,36,0.1)' },
}

function ChecklistStatus({ items }) {
  if (!items?.length) return null
  return (
    <div className="card">
      <div className="card-title"><CheckIcon />Checklist Status</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((item, i) => {
          const s = STATUS_STYLE[item.status] || STATUS_STYLE.Partial
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '7px 12px', background: 'var(--bg-input)', borderRadius: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: s.color, background: s.bg, borderRadius: 4, padding: '2px 7px', minWidth: 56, textAlign: 'center', flexShrink: 0, marginTop: 1 }}>
                {item.status}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: 'var(--text-heading)' }}>{item.item}</div>
                {item.note && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{item.note}</div>}
              </div>
            </div>
          )
        })}
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
          {[
            ['Type', data.application_type],
            ['Sub-Type', data.sub_type],
            ['Applicant', data.applicant],
            ['Product', data.product],
            ['Regulatory Status', data.regulatory_status],
          ].map(([l, v]) => v ? (
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
      <ChecklistStatus items={data.checklist_status} />
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
      {(data.reporting_timeline || data.action_required) && (
        <div className="card">
          <div className="card-title"><ArrowIcon />Reporting & Action</div>
          {data.reporting_timeline && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4, fontWeight: 600 }}>Reporting Timeline</div>
              <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: 6, fontSize: 13, color: 'var(--danger)', borderLeft: '3px solid var(--danger)' }}>
                {data.reporting_timeline}
              </div>
            </div>
          )}
          {data.action_required && (
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4, fontWeight: 600 }}>Action Required</div>
              <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text)' }}>{data.action_required}</p>
            </div>
          )}
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
          {data.meeting_type && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Type: <strong style={{ color: 'var(--text-heading)' }}>{data.meeting_type}</strong></span>}
          {data.meeting_date && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Date: <strong style={{ color: 'var(--text-heading)' }}>{data.meeting_date}</strong></span>}
          {data.attendees?.length > 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Attendees: <strong style={{ color: 'var(--text-heading)' }}>{data.attendees.length} present</strong></span>}
        </div>
        {data.attendees?.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
            {data.attendees.map((a, i) => (
              <div key={i} style={{ fontSize: 12, color: 'var(--text)', padding: '4px 10px', background: 'var(--bg-input)', borderRadius: 5 }}>{a}</div>
            ))}
          </div>
        )}
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
      <ListField label="Regulatory Timelines" items={data.regulatory_timelines} color="var(--danger)" />
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
    if (data.sub_type)         lines.push(`Sub-Type: ${data.sub_type}`)
    if (data.applicant)        lines.push(`Applicant: ${data.applicant}`)
    if (data.product)          lines.push(`Product: ${data.product}`)
    if (data.regulatory_status) lines.push(`Regulatory Status: ${data.regulatory_status}`)
    if (data.recommendation)   lines.push(`Recommendation: ${data.recommendation}`)
    lines.push('')
    if (data.clinical_data_summary) { lines.push('CLINICAL DATA SUMMARY', sub, data.clinical_data_summary, '') }
    if (data.safety_profile)        { lines.push('SAFETY PROFILE', sub, data.safety_profile, '') }
    if (data.reviewer_notes)        { lines.push('REVIEWER NOTES', sub, data.reviewer_notes, '') }
    if (data.key_claims?.length)    { lines.push('KEY CLAIMS', sub); data.key_claims.forEach((c, i) => lines.push(`  ${i+1}. ${c}`)); lines.push('') }
    if (data.checklist_status?.length) {
      lines.push('CHECKLIST STATUS', sub)
      data.checklist_status.forEach(c => lines.push(`  [${c.status}] ${c.item}${c.note ? ` — ${c.note}` : ''}`))
      lines.push('')
    }
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
    if (data.reporting_timeline) { lines.push('REPORTING TIMELINE', sub, data.reporting_timeline, '') }
    if (data.action_required)  { lines.push('ACTION REQUIRED', sub, data.action_required, '') }
  } else {
    if (data.meeting_type)     lines.push(`Meeting Type: ${data.meeting_type}`)
    if (data.meeting_date)     lines.push(`Meeting Date: ${data.meeting_date}`)
    if (data.attendees?.length) lines.push(`Attendees:\n${data.attendees.map(a => `  - ${a}`).join('\n')}`)
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
    if (data.regulatory_timelines?.length) { lines.push('REGULATORY TIMELINES', sub); data.regulatory_timelines.forEach((t, i) => lines.push(`  ${i+1}. ${t}`)); lines.push('') }
    if (data.next_steps?.length)       { lines.push('NEXT STEPS', sub); data.next_steps.forEach((s, i) => lines.push(`  ${i+1}. ${s}`)); lines.push('') }
    if (data.unresolved_issues?.length) { lines.push('UNRESOLVED ISSUES', sub); data.unresolved_issues.forEach((u, i) => lines.push(`  ${i+1}. ${u}`)); lines.push('') }
    if (data.agenda_items?.length)     { lines.push('AGENDA ITEMS', sub); data.agenda_items.forEach((a, i) => lines.push(`  ${i+1}. ${a}`)); lines.push('') }
  }

  return lines.join('\n')
}

export default function SummarisationPage() {
  const [text, setText] = useState('')
  const [docType, setDocType] = useState(DOC_TYPES[0].value)
  const [subType, setSubType] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadSource, setUploadSource] = useState(null)
  const [filename, setFilename] = useState('')

  // Chatbot states
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [chatHistory, setChatHistory] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)

  const handleChatSubmit = async (e) => {
    e.preventDefault()
    if (!chatInput.trim()) return

    if (!text) {
      setChatHistory(prev => [...prev, { role: 'user', content: chatInput }, { role: 'assistant', content: 'The original document text is no longer available (e.g., this is a historical run). Please paste the document text in the input area to ask questions.' }])
      setChatInput('')
      return
    }
    
    const userMsg = chatInput.trim()
    setChatInput('')
    setChatHistory(prev => [...prev, { role: 'user', content: userMsg }])
    setChatLoading(true)
    
    try {
      const { answer } = await chatWithDocument(text, userMsg)
      setChatHistory(prev => [...prev, { role: 'assistant', content: answer }])
    } catch (err) {
      setChatHistory(prev => [...prev, { role: 'assistant', content: 'Error: Could not get answer. ' + (err.response?.data?.detail || err.message) }])
    } finally {
      setChatLoading(false)
    }
  }

  const onDrop = useCallback(async (files) => {
    if (!files[0]) return
    setUploading(true)
    setError('')
    setUploadSource(null)
    setFilename(files[0].name)
    try {
      const res = await uploadFile(files[0])
      setText(res.text)
      setUploadSource(res.source || 'text_extraction')
    } catch (e) {
      setError('Upload failed: ' + (e.response?.data?.detail || e.message))
    } finally {
      setUploading(false)
    }
  }, [])

  useEffect(() => {
    try {
      const saved = localStorage.getItem('cdsco_last_summarisation')
      if (saved) {
        const { result: r, docType: dt, subType: st, text: t } = JSON.parse(saved)
        if (r) { setResult(r); if (dt) setDocType(dt); if (st) setSubType(st); if (t) setText(t) }
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (result) {
      try { localStorage.setItem('cdsco_last_summarisation', JSON.stringify({ result, docType, subType, text })) } catch {}
    }
  }, [result, docType, subType, text])

  const accept = ACCEPT_BY_TYPE[docType]
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, multiple: false, accept })

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
      const r = await summarize(text, docType, docType === 'SUGAM Application' ? subType : '', filename)
      setResult({ type: docType, data: r })
    } catch (e) {
      setError(e.response?.data?.detail || e.message)
    } finally {
      setLoading(false)
    }
  }

  const isMeeting = docType === 'Meeting Transcript / Audio Summary'
  const isSugam   = docType === 'SUGAM Application'
  const isSAE     = docType === 'SAE Case Narration'

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Document Summarisation</h1>
        <p className="page-subtitle">
          Structured AI summaries for SUGAM applications, SAE narrations, and meeting transcripts
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <HistoryPanel
          module="summarisation"
          onLoad={(data) => {
            setResult({ type: data.doc_type, data: data.result })
            setDocType(data.doc_type || DOC_TYPES[0].value)
            setError('')
          }}
        />

        <div className="card">
          <div className="card-title"><UploadIcon />Upload or Paste</div>
          <div
            {...getRootProps()}
            className={`dropzone${isDragActive ? ' active' : ''}`}
            style={{ marginBottom: 12 }}
          >
            <input {...getInputProps()} />
            {uploading
              ? (
                <div className="loading-center" style={{ padding: 12 }}>
                  <div className="spinner" />
                  {uploadSource === 'audio_transcription'
                    ? 'Transcribing audio…'
                    : uploadSource === 'image_ocr'
                    ? 'Extracting text from image…'
                    : 'Reading file…'}
                </div>
              )
              : <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 28, height: 28, color: 'var(--text-dim)', marginBottom: 8 }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  <div className="dropzone-text">Drop file or <span>click to browse</span></div>
                  <div className="dropzone-hint">{HINT_BY_TYPE[docType]}</div>
                </>
            }
          </div>

          {uploadSource === 'audio_transcription' && text && (
            <div className="alert" style={{ marginBottom: 10, background: 'rgba(79,142,247,0.08)', borderColor: 'rgba(79,142,247,0.3)', color: 'var(--accent)' }}>
              Audio transcribed — review the transcript below before summarising.
            </div>
          )}

          <div className="form-group" style={{ marginBottom: 10 }}>
            <label className="form-label">Document Type</label>
            <select
              className="form-select"
              value={docType}
              onChange={e => { setDocType(e.target.value); setSubType(''); setResult(null) }}
            >
              {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {isSugam && (
            <div className="form-group" style={{ marginBottom: 10 }}>
              <label className="form-label">Application Sub-Type</label>
              <select
                className="form-select"
                value={subType}
                onChange={e => { setSubType(e.target.value); setResult(null) }}
              >
                {SUGAM_SUBTYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              {subType && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>
                  Sub-type-specific regulatory checklist and flag criteria will be applied.
                </div>
              )}
            </div>
          )}

          <textarea
            className="form-textarea"
            style={{ minHeight: 260 }}
            placeholder={
              isSAE     ? 'Paste the SAE narration / adverse event report…'
              : isMeeting ? 'Paste the meeting transcript, or drop an audio file above to transcribe it automatically…'
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
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-secondary btn-sm" onClick={copyResult}>
                  <CopyIcon />Copy summary
                </button>
                <button className="btn btn-secondary btn-sm" onClick={downloadResult}>
                  <DownloadIcon />Download .txt
                </button>
              </div>
              <button className="btn btn-accent btn-sm" onClick={() => setIsChatOpen(true)}>
                <FileTextIcon />Ask a Question
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

      {isChatOpen && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, width: 380, height: 500,
          background: 'var(--bg-card)', borderRadius: 16, boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
          border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', zIndex: 9999,
          overflow: 'hidden'
        }}>
          <div style={{ padding: '16px', background: 'var(--bg-input)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 600, color: 'var(--text-heading)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileTextIcon size={16} style={{ color: 'var(--accent)' }}/> Document Q&A
            </div>
            <button onClick={() => setIsChatOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
              <XCircleIcon size={18} />
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {chatHistory.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, marginTop: 40 }}>
                Ask anything about the extracted document.
              </div>
            )}
            {chatHistory.map((msg, i) => (
              <div key={i} style={{
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-input)',
                color: msg.role === 'user' ? '#fff' : 'var(--text)',
                padding: '10px 14px', borderRadius: 12, maxWidth: '85%', fontSize: 13, lineHeight: 1.5
              }}>
                {msg.content}
              </div>
            ))}
            {chatLoading && (
              <div style={{ alignSelf: 'flex-start', background: 'var(--bg-input)', padding: '10px 14px', borderRadius: 12, fontSize: 13 }}>
                <div className="spinner" style={{ width: 14, height: 14 }} />
              </div>
            )}
          </div>
          <form onSubmit={handleChatSubmit} style={{ padding: 12, borderTop: '1px solid var(--border)', background: 'var(--bg-card)', display: 'flex', gap: 8 }}>
            <input 
              type="text" 
              value={chatInput} 
              onChange={e => setChatInput(e.target.value)}
              placeholder="Ask a question..."
              style={{ flex: 1, background: 'var(--bg-input)', border: '1px solid var(--border)', padding: '10px 14px', borderRadius: 100, color: 'var(--text)', outline: 'none', fontSize: 13 }}
            />
            <button 
              type="submit" 
              disabled={chatLoading || !chatInput.trim()}
              style={{ background: 'var(--accent)', color: '#fff', border: 'none', width: 38, height: 38, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: (chatLoading || !chatInput.trim()) ? 0.5 : 1 }}
            >
              <ArrowIcon size={16} />
            </button>
          </form>
        </div>
      )}
    </>
  )
}
