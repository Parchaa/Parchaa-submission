import { useEffect, useState } from 'react'
import { healthCheck } from '../lib/api'

const NAV = [
  {
    label: 'Overview',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: <GridIcon /> },
    ],
  },
  {
    label: 'AI Modules',
    items: [
      { id: 'anonymisation', label: 'Anonymisation', icon: <ShieldIcon /> },
      { id: 'summarisation', label: 'Summarisation', icon: <FileTextIcon /> },
      { id: 'completeness', label: 'Completeness', icon: <CheckSquareIcon /> },
      { id: 'classification', label: 'Classification', icon: <TagIcon /> },
      { id: 'inspection', label: 'Inspection Report', icon: <ClipboardIcon /> },
    ],
  },
]

export default function Sidebar({ active, onNavigate }) {
  const [online, setOnline] = useState(null)

  useEffect(() => {
    healthCheck()
      .then(() => setOnline(true))
      .catch(() => setOnline(false))
  }, [])

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <ActivityIcon />
          </div>
          <div>
            <div className="sidebar-title">CDSCO RegAI</div>
            <div className="sidebar-subtitle">India-AI Hackathon 2026</div>
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV.map(section => (
          <div key={section.label}>
            <div className="nav-section-label">{section.label}</div>
            {section.items.map(item => (
              <button
                key={item.id}
                className={`nav-item${active === item.id ? ' active' : ''}`}
                onClick={() => onNavigate(item.id)}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-status">
          <div className={`status-dot${online === false ? ' offline' : ''}`} />
          {online === null ? 'Connecting…' : online ? 'API online' : 'API offline'}
        </div>
      </div>
    </aside>
  )
}

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
    </svg>
  )
}
function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  )
}
function FileTextIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  )
}
function CheckSquareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
    </svg>
  )
}
function TagIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
      <line x1="7" y1="7" x2="7.01" y2="7"/>
    </svg>
  )
}
function ClipboardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
    </svg>
  )
}
function ActivityIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  )
}
