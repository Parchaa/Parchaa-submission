import { useState, useCallback, useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { generateReport, generateReportXlsx, uploadFile } from '../lib/api'
import {
  ClipboardIcon, UploadIcon, AlertIcon, AlertTriangleIcon,
  BuildingIcon, FileTextIcon, CheckIcon, CopyIcon, LightbulbIcon,
  DownloadIcon, LayersIcon,
} from '../components/Icons'
import HistoryPanel from '../components/HistoryPanel'

const REPORT_TYPES = [
  'GMP Inspection',
  'GCP Inspection',
  'GDP Inspection',
  'Pharmacovigilance Audit',
  'Clinical Trial Site Audit',
]

const COMPLIANCE_STYLE = {
  'Compliant':               { badge: 'badge-green',  color: 'var(--success)' },
  'Conditionally Compliant': { badge: 'badge-yellow', color: 'var(--warning)' },
  'Non-Compliant':           { badge: 'badge-red',    color: 'var(--danger)' },
}

const FINDING_STYLE = {
  Critical:    { bg: 'var(--danger-bg)',  border: 'var(--danger)',       badge: 'badge-red' },
  Major:       { bg: 'var(--warning-bg)', border: 'var(--warning)',      badge: 'badge-yellow' },
  Minor:       { bg: 'var(--accent-bg)',  border: 'var(--accent)',       badge: 'badge-blue' },
  Observation: { bg: 'var(--bg-hover)',   border: 'var(--border-light)', badge: 'badge-purple' },
}

// Accepted file types — documents + images for handwritten notes
const ACCEPT = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'text/plain': ['.txt'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/tiff': ['.tiff', '.tif'],
  'image/webp': ['.webp'],
  'image/heic': ['.heic'],
  'image/bmp': ['.bmp'],
}

function buildReportText(result, reportType) {
  const h = result.report_header || {}
  const sc = result.scope || {}
  const lines = [
    '='.repeat(70),
    'CENTRAL DRUGS STANDARD CONTROL ORGANISATION (CDSCO)',
    'INSPECTION REPORT',
    '='.repeat(70),
    `Inspection Type : ${h.inspection_type || reportType}`,
    `Facility        : ${h.facility_name || '—'}`,
    `Address         : ${h.facility_address || '—'}`,
    `Inspection Date : ${h.inspection_date || '—'}`,
    `Report Date     : ${h.report_date || '—'}`,
    `Inspectors      : ${(h.inspectors || []).join(', ') || '—'}`,
  ]

  if (sc.summary || sc.systems_covered?.length) {
    lines.push('', 'SCOPE OF INSPECTION', '-'.repeat(40))
    if (sc.summary) lines.push(`  ${sc.summary}`)
    if (sc.systems_covered?.length) lines.push(`  Systems Covered : ${sc.systems_covered.join(', ')}`)
    if (sc.product_types?.length)   lines.push(`  Products        : ${sc.product_types.join(', ')}`)
    if (sc.manufacturing_lines?.length) lines.push(`  Lines/Units     : ${sc.manufacturing_lines.join(', ')}`)
  }

  lines.push(
    '',
    'EXECUTIVE SUMMARY',
    '-'.repeat(40),
    result.executive_summary || '',
    '',
    `Compliance Status : ${result.gmp_compliance || '—'}`,
    `Findings          : ${result.critical_findings_count || 0} Critical | ${result.major_findings_count || 0} Major | ${result.minor_findings_count || 0} Minor`,
    '',
    'DETAILED FINDINGS',
    '-'.repeat(40),
    ...(result.findings || []).flatMap(f => [
      `\n[${f.finding_id}] ${f.category?.toUpperCase()} — Risk: ${f.risk_level}`,
      f.area ? `  Area           : ${f.area}` : '',
      `  Description    : ${f.description}`,
      f.regulatory_reference ? `  Regulatory Ref : ${f.regulatory_reference}` : '',
      f.proposed_capa ? `  CAPA           : ${f.proposed_capa}` : '',
    ]).filter(Boolean),
    '',
    'OVERALL ASSESSMENT',
    '-'.repeat(40),
    result.overall_assessment || '',
    '',
    'RECOMMENDATIONS',
    '-'.repeat(40),
    ...(result.recommendations || []).map((r, i) => `  ${i + 1}. ${r}`),
    '',
    result.follow_up_required
      ? `Follow-up Required: Yes — ${result.follow_up_timeline || 'TBD'}`
      : 'Follow-up Required: No',
    '='.repeat(70),
  )
  return lines.join('\n')
}

function ScopeSection({ scope }) {
  if (!scope) return null
  const { summary, systems_covered, product_types, manufacturing_lines } = scope
  if (!summary && !systems_covered?.length) return null

  return (
    <div className="card">
      <div className="card-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 16, height: 16 }}>
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        Scope of Inspection
      </div>
      {summary && <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, marginBottom: 12 }}>{summary}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {[
          ['Systems Covered', systems_covered],
          ['Product Types', product_types],
          ['Lines / Units Visited', manufacturing_lines],
        ].filter(([, v]) => v?.length).map(([label, items]) => (
          <div key={label} style={{ background: 'var(--bg-input)', borderRadius: 6, padding: '8px 12px' }}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6, fontWeight: 600 }}>{label}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {items.map((item, i) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--text)', display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ color: 'var(--accent)', fontSize: 10 }}>▸</span>{item}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function InspectionPage() {
  const [text, setText] = useState('')
  const [reportType, setReportType] = useState('GMP Inspection')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadSource, setUploadSource] = useState(null)
  const [filename, setFilename] = useState('')

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
      const saved = localStorage.getItem('cdsco_last_inspection')
      if (saved) {
        const { result: r, reportType: rt } = JSON.parse(saved)
        if (r) { setResult(r); if (rt) setReportType(rt) }
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (result) {
      try { localStorage.setItem('cdsco_last_inspection', JSON.stringify({ result, reportType })) } catch {}
    }
  }, [result, reportType])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, multiple: false, accept: ACCEPT })

  const run = async () => {
    if (!text.trim()) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const r = await generateReport(text, reportType, filename)
      if (r.error) {
        setError(r.error)
      } else {
        setResult(r)
      }
    } catch (e) {
      setError(e.response?.data?.detail || e.message)
    } finally {
      setLoading(false)
    }
  }

  const copyReport = () => {
    if (!result) return
    navigator.clipboard.writeText(buildReportText(result, reportType))
  }

  const downloadReport = () => {
    if (!result) return
    const content = buildReportText(result, reportType)
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `CDSCO_${reportType.replace(/\s+/g, '_')}_Report.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const downloadReportXlsx = async () => {
    if (!text.trim()) return
    setLoading(true)
    try {
      const blob = await generateReportXlsx(text, reportType, filename)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `CDSCO_Risk_Assessment_${reportType.replace(/\s+/g, '_')}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError('XLSX generation failed: ' + (e.response?.data?.detail || e.message))
    } finally {
      setLoading(false)
    }
  }

  const header = result?.report_header || {}

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Inspection Report Generator</h1>
        <p className="page-subtitle">
          Convert raw inspection notes or handwritten observations into formal CDSCO reports with findings, risk levels, and CAPA recommendations
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <HistoryPanel
          module="inspection_report"
          onLoad={(data) => {
            setResult(data.result)
            setReportType(data.doc_type || 'GMP Inspection')
            setError('')
          }}
        />

        <div className="card">
          <div className="card-title"><UploadIcon />Inspection Notes</div>
          <div {...getRootProps()} className={`dropzone${isDragActive ? ' active' : ''}`} style={{ marginBottom: 12 }}>
            <input {...getInputProps()} />
            {uploading
              ? (
                <div className="loading-center" style={{ padding: 12 }}>
                  <div className="spinner" />
                  {uploadSource === 'image_ocr' ? 'Extracting text from image…' : 'Reading file…'}
                </div>
              )
              : <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 28, height: 28, color: 'var(--text-dim)', marginBottom: 8 }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  <div className="dropzone-text">Drop file or <span>click to browse</span></div>
                  <div className="dropzone-hint">PDF · DOCX · TXT · JPG · PNG · TIFF · WEBP (handwritten notes)</div>
                </>
            }
          </div>

          {uploadSource === 'image_ocr' && text && (
            <div className="alert" style={{ marginBottom: 10, background: 'rgba(79,142,247,0.08)', borderColor: 'rgba(79,142,247,0.3)', color: 'var(--accent)' }}>
              Handwritten notes extracted — review the text below before generating the report.
            </div>
          )}

          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">Inspection Type</label>
            <select className="form-select" value={reportType} onChange={e => setReportType(e.target.value)}>
              {REPORT_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <textarea
            className="form-textarea"
            style={{ minHeight: 260 }}
            placeholder={'Paste raw inspection observations, or drop a photo of handwritten notes above.\n\nExample:\n"Floor 2 storage room temp not maintained. Staff not wearing gloves. Batch record for Jan missing signature. Cross-contamination risk in packing area."'}
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
            {loading ? <><div className="spinner" />Generating…</> : <><ClipboardIcon />Generate Report</>}
          </button>
          {error && <div className="alert alert-error" style={{ marginTop: 10 }}><AlertIcon />{error}</div>}
        </div>

        {loading && (
          <div className="card loading-center" style={{ minHeight: 200 }}>
            <div className="spinner spinner-lg" />
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Generating formal inspection report…</span>
          </div>
        )}

        {result && !loading && (
          <>
            <div className="card" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--text-heading)', fontSize: 14 }}>{header.inspection_type || reportType}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                  {result.critical_findings_count || 0} Critical &nbsp;·&nbsp;
                  {result.major_findings_count || 0} Major &nbsp;·&nbsp;
                  {result.minor_findings_count || 0} Minor
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {result.gmp_compliance && (
                  <span className={`badge ${COMPLIANCE_STYLE[result.gmp_compliance]?.badge || 'badge-blue'}`} style={{ fontSize: 11 }}>
                    {result.gmp_compliance}
                  </span>
                )}
                <button className="btn btn-secondary btn-sm" onClick={copyReport}><CopyIcon />Copy</button>
                <button className="btn btn-secondary btn-sm" onClick={downloadReport}><DownloadIcon />Text Report</button>
                <button className="btn btn-primary btn-sm" onClick={downloadReportXlsx}><DownloadIcon />Excel Report (Risk Register)</button>
              </div>
            </div>

            {(header.facility_name || header.facility_address || header.inspection_date) && (
              <div className="card">
                <div className="card-title"><BuildingIcon />Facility Information</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    ['Facility', header.facility_name],
                    ['Address', header.facility_address],
                    ['Inspection Date', header.inspection_date],
                    ['Report Date', header.report_date],
                    ['Inspectors', (header.inspectors || []).join(', ') || null],
                  ].filter(([, v]) => v).map(([l, v]) => (
                    <div key={l} style={{ background: 'var(--bg-input)', borderRadius: 6, padding: '8px 12px' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 2 }}>{l}</div>
                      <div style={{ fontSize: 13, color: 'var(--text-heading)' }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <ScopeSection scope={result.scope} />

            {result.executive_summary && (
              <div className="card">
                <div className="card-title"><FileTextIcon />Executive Summary</div>
                <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)' }}>{result.executive_summary}</p>
              </div>
            )}

            {result.findings?.length > 0 && (
              <div className="card">
                <div className="card-title"><AlertTriangleIcon />Findings</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {result.findings.map((f, i) => {
                    const fs = FINDING_STYLE[f.category] || FINDING_STYLE.Observation
                    return (
                      <div key={i} style={{
                        background: 'var(--bg-input)',
                        border: `1px solid var(--border)`,
                        borderLeft: `4px solid ${fs.border}`,
                        borderRadius: 8,
                        padding: '12px 14px',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'monospace' }}>{f.finding_id}</span>
                          <span className={`badge ${fs.badge}`}>{f.category}</span>
                          {f.risk_level && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Risk: {f.risk_level}</span>}
                          {f.area && <span style={{ fontSize: 11, color: 'var(--text-dim)', padding: '1px 6px', background: 'var(--bg-hover)', borderRadius: 4 }}>{f.area}</span>}
                          {f.regulatory_reference && <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 'auto' }}>{f.regulatory_reference}</span>}
                        </div>
                        <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, marginBottom: f.proposed_capa ? 8 : 0 }}>
                          {f.description}
                        </p>
                        {f.proposed_capa && (
                          <div style={{ background: 'var(--success-bg)', borderRadius: 6, padding: '7px 10px', fontSize: 12, color: 'var(--success)', marginTop: 6 }}>
                            <span style={{ fontWeight: 600 }}>CAPA: </span>{f.proposed_capa}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {result.overall_assessment && (
              <div className="card">
                <div className="card-title"><CheckIcon />Overall Assessment</div>
                <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)' }}>{result.overall_assessment}</p>
                {result.follow_up_required && (
                  <div style={{ marginTop: 10, padding: '7px 12px', background: 'var(--warning-bg)', borderRadius: 6, fontSize: 12, color: 'var(--warning)' }}>
                    Follow-up required: {result.follow_up_timeline || 'TBD'}
                  </div>
                )}
              </div>
            )}

            {result.recommendations?.length > 0 && (
              <div className="card">
                <div className="card-title"><LightbulbIcon />Recommendations</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {result.recommendations.map((r, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 12px', background: 'var(--accent-bg)', borderRadius: 6, fontSize: 13, color: 'var(--text)' }}>
                      <span style={{ color: 'var(--accent)', fontWeight: 600, minWidth: 20 }}>{i + 1}.</span>
                      <span>{r}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.risk_assessment?.length > 0 && (
              <div className="card">
                <div className="card-title" style={{ justifyContent: 'space-between' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><LayersIcon />Risk Register (XLSX Preview)</span>
                  <span className="badge badge-purple" style={{ fontSize: 10 }}>Quantitative Assessment</span>
                </div>
                <div className="table-wrap" style={{ marginTop: 12 }}>
                  <table style={{ borderCollapse: 'separate', borderSpacing: '0 4px' }}>
                    <thead>
                      <tr>
                        <th style={{ background: 'transparent', borderBottom: '1px solid var(--border)', fontSize: 10 }}>Risk ID</th>
                        <th style={{ background: 'transparent', borderBottom: '1px solid var(--border)', fontSize: 10 }}>Likelihood</th>
                        <th style={{ background: 'transparent', borderBottom: '1px solid var(--border)', fontSize: 10 }}>Severity</th>
                        <th style={{ background: 'transparent', borderBottom: '1px solid var(--border)', fontSize: 10 }}>Score</th>
                        <th style={{ background: 'transparent', borderBottom: '1px solid var(--border)', fontSize: 10 }}>Action Plan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.risk_assessment.map((r, i) => (
                        <tr key={i} style={{ background: 'var(--bg-input)' }}>
                          <td style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-heading)', borderTopLeftRadius: 6, borderBottomLeftRadius: 6 }}>{r.risk_id}</td>
                          <td style={{ fontSize: 12, color: 'var(--text)' }}>{r.likelihood}/5</td>
                          <td style={{ fontSize: 12, color: 'var(--text)' }}>{r.severity}/5</td>
                          <td style={{ fontSize: 13, fontWeight: 700, color: r.risk_priority_score > 50 ? 'var(--danger)' : 'var(--accent)' }}>{r.risk_priority_score}</td>
                          <td style={{ fontSize: 12, color: 'var(--text)', borderTopRightRadius: 6, borderBottomRightRadius: 6 }}>{r.action_plan}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12 }}>
                  * This data is automatically mapped to the "Risk Register" sheet in your Excel download.
                </p>
              </div>
            )}
          </>
        )}

        {!result && !loading && (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 160, gap: 12 }}>
            <ClipboardIcon size={40} style={{ color: 'var(--text-dim)' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              Paste raw inspection notes or upload a photo of handwritten observations to generate a formal CDSCO report
            </p>
          </div>
        )}
      </div>
    </>
  )
}
