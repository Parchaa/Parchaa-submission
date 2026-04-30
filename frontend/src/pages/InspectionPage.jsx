import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { generateReport, uploadFile } from '../lib/api'

const REPORT_TYPES = [
  'GMP Inspection',
  'GCP Inspection',
  'GDP Inspection',
  'Pharmacovigilance Audit',
  'Clinical Trial Site Audit',
]

const COMPLIANCE_STYLE = {
  'Compliant':              { badge: 'badge-green', color: 'var(--success)' },
  'Conditionally Compliant':{ badge: 'badge-yellow', color: 'var(--warning)' },
  'Non-Compliant':          { badge: 'badge-red',   color: 'var(--danger)' },
}

const FINDING_STYLE = {
  Critical:    { bg: 'var(--danger-bg)',  border: 'var(--danger)',  badge: 'badge-red' },
  Major:       { bg: 'var(--warning-bg)', border: 'var(--warning)', badge: 'badge-yellow' },
  Minor:       { bg: 'var(--accent-bg)',  border: 'var(--accent)',  badge: 'badge-blue' },
  Observation: { bg: 'var(--bg-hover)',   border: 'var(--border-light)', badge: 'badge-purple' },
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
      `Inspectors      : ${(h.inspectors || []).join(', ') || '—'}`,
      '',
      'EXECUTIVE SUMMARY',
      '-'.repeat(40),
      result.executive_summary || '',
      '',
      `GMP Compliance  : ${result.gmp_compliance || '—'}`,
      `Findings        : ${result.critical_findings_count || 0} Critical | ${result.major_findings_count || 0} Major | ${result.minor_findings_count || 0} Minor`,
      '',
      'FINDINGS',
      '-'.repeat(40),
      ...(result.findings || []).flatMap(f => [
        `\n[${f.finding_id}] ${f.category?.toUpperCase()} — Risk: ${f.risk_level}`,
        `  ${f.description}`,
        f.regulatory_reference ? `  Ref: ${f.regulatory_reference}` : '',
        f.proposed_capa ? `  CAPA: ${f.proposed_capa}` : '',
      ]).filter(Boolean),
      '',
      'OVERALL ASSESSMENT',
      '-'.repeat(40),
      result.overall_assessment || '',
    ]
    navigator.clipboard.writeText(lines.join('\n'))
  }

  // backend field: report_header (not facility_info)
  const header = result?.report_header || {}

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Inspection Report Generator</h1>
        <p className="page-subtitle">
          Convert raw inspection notes into formal CDSCO reports with findings, risk levels, and CAPA recommendations
        </p>
      </div>

      <div className="two-col">
        {/* ── Left ── */}
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
              style={{ minHeight: 320 }}
              placeholder={'Example raw notes:\n"Floor 2 storage room temp not maintained. Staff not wearing gloves. Batch record for Jan missing signature. Cross-contamination risk in packing area."'}
              value={text}
              onChange={e => setText(e.target.value)}
            />
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
        </div>

        {/* ── Right ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {loading && (
            <div className="card loading-center" style={{ minHeight: 200 }}>
              <div className="spinner spinner-lg" />
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Generating formal inspection report…</span>
            </div>
          )}

          {result && !loading && (
            <>
              {/* ── Report header bar ── */}
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
                  <button className="btn btn-secondary btn-sm" onClick={copyReport}><CopyIcon />Copy Report</button>
                </div>
              </div>

              {/* ── Facility info — from report_header ── */}
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

              {/* ── Executive summary ── */}
              {result.executive_summary && (
                <div className="card">
                  <div className="card-title"><FileTextIcon />Executive Summary</div>
                  <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)' }}>{result.executive_summary}</p>
                </div>
              )}

              {/* ── Findings ── */}
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

              {/* ── Overall assessment ── */}
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

              {/* ── Recommendations ── */}
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
            <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 200, gap: 12 }}>
              <ClipboardIcon style={{ width: 40, height: 40, color: 'var(--text-dim)' }} />
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                Paste raw inspection notes and generate a formal CDSCO report
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function ClipboardIcon({ style }) { return <svg style={style} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg> }
function UploadIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> }
function AlertIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> }
function AlertTriangleIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> }
function BuildingIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> }
function FileTextIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> }
function CheckIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> }
function CopyIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> }
function LightbulbIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="9" y1="18" x2="15" y2="18"/><line x1="10" y1="22" x2="14" y2="22"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/></svg> }
