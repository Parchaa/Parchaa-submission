import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { generateReport, uploadFile } from '../lib/api'
import {
  ClipboardIcon, UploadIcon, AlertIcon, AlertTriangleIcon,
  BuildingIcon, FileTextIcon, CheckIcon, CopyIcon, LightbulbIcon,
  DownloadIcon,
} from '../components/Icons'

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

function buildReportText(result, reportType) {
  const h = result.report_header || {}
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
  ]
  return lines.join('\n')
}

export default function InspectionPage() {
  const [text, setText] = useState('')
  const [reportType, setReportType] = useState('GMP Inspection')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)

  const onDrop = useCallback(async (files) => {
    if (!files[0]) return
    setUploading(true)
    try {
      const { text: t } = await uploadFile(files[0])
      setText(t)
    } catch (e) {
      setError('Upload failed: ' + e.message)
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
      const r = await generateReport(text, reportType)
      setResult(r)
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

  const header = result?.report_header || {}

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Inspection Report Generator</h1>
        <p className="page-subtitle">
          Convert raw inspection notes into formal CDSCO reports with findings, risk levels, and CAPA recommendations
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card">
            <div className="card-title"><UploadIcon />Inspection Notes</div>
            <div {...getRootProps()} className={`dropzone${isDragActive ? ' active' : ''}`} style={{ marginBottom: 12 }}>
              <input {...getInputProps()} />
              {uploading
                ? <div className="loading-center" style={{ padding: 12 }}><div className="spinner" />Reading…</div>
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
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Inspection Type</label>
              <select className="form-select" value={reportType} onChange={e => setReportType(e.target.value)}>
                {REPORT_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <textarea
              className="form-textarea"
              style={{ minHeight: 260 }}
              placeholder={'Example raw notes:\n"Floor 2 storage room temp not maintained. Staff not wearing gloves. Batch record for Jan missing signature. Cross-contamination risk in packing area."'}
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
                  <button className="btn btn-secondary btn-sm" onClick={downloadReport}><DownloadIcon />Download</button>
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
            </>
          )}

        {!result && !loading && (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 160, gap: 12 }}>
            <ClipboardIcon size={40} style={{ color: 'var(--text-dim)' }} />
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
              Paste raw inspection notes and generate a formal CDSCO report
            </p>
          </div>
        )}
      </div>
    </>
  )
}
