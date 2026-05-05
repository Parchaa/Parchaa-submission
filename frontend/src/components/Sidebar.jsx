import { useEffect, useState } from 'react'
import { healthCheck } from '../lib/api'
import {
  ActivityIcon, GridIcon, ShieldIcon, FileTextIcon,
  CheckSquareIcon, TagIcon, ClipboardIcon,
} from './Icons'

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
      { id: 'anonymisation', label: 'Anonymisation',     icon: <ShieldIcon /> },
      { id: 'summarisation', label: 'Summarisation',     icon: <FileTextIcon /> },
      { id: 'completeness',  label: 'Completeness',      icon: <CheckSquareIcon /> },
      { id: 'classification',label: 'SAE Classification',icon: <TagIcon /> },
      { id: 'inspection',    label: 'Inspection Report', icon: <ClipboardIcon /> },
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
            <ActivityIcon size={18} style={{ color: '#fff' }} />
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
