import { useEffect, useState } from 'react'
import { healthCheck } from '../lib/api'
import {
  ActivityIcon, GridIcon, ShieldIcon, FileTextIcon,
  CheckSquareIcon, TagIcon, ClipboardIcon,
} from './Icons'
import { USERS } from '../App'

const HistoryIconSvg = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
)

const UserIcon = ({ size = 15, style, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style} className={className}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
)
const ChevronUpIcon = ({ size = 15, style, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style} className={className}>
    <polyline points="18 15 12 9 6 15" />
  </svg>
)

const NAV = [
  {
    label: 'Overview',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: <GridIcon /> },
      { id: 'history', label: 'Document History', icon: <HistoryIconSvg /> },
    ],
  },
  {
    label: 'AI Modules',
    items: [
      { id: 'anonymisation', label: 'Anonymisation',     icon: <ShieldIcon />, adminOnly: true },
      { id: 'summarisation', label: 'Summarisation',     icon: <FileTextIcon /> },
      { id: 'completeness',  label: 'Completeness',      icon: <CheckSquareIcon /> },
      { id: 'classification',label: 'SAE Classification',icon: <TagIcon /> },
      { id: 'inspection',    label: 'Inspection Report', icon: <ClipboardIcon />, adminOnly: true },
    ],
  },
]

export default function Sidebar({ active, onNavigate, currentUser, onUserSwitch }) {
  const [online, setOnline] = useState(null)
  const [showUserMenu, setShowUserMenu] = useState(false)

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
        {NAV.map(section => {
          const visibleItems = section.items.filter(item => !item.adminOnly || currentUser?.role === 'admin')
          if (visibleItems.length === 0) return null
          
          return (
            <div key={section.label}>
              <div className="nav-section-label">{section.label}</div>
              {visibleItems.map(item => (
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
          )
        })}
      </nav>

      <div className="sidebar-footer" style={{ position: 'relative' }}>
        {showUserMenu && (
          <div className="user-menu-popup" style={{
            position: 'absolute', bottom: '100%', left: '10px', right: '10px',
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '4px', marginBottom: '8px',
            boxShadow: 'var(--shadow)', zIndex: 10
          }}>
            {USERS.map(u => (
              <button
                key={u.email}
                className="nav-item"
                style={{ marginBottom: 0, opacity: currentUser?.email === u.email ? 1 : 0.7 }}
                onClick={() => {
                  onUserSwitch(u)
                  setShowUserMenu(false)
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)' }}>{u.name}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{u.email}</span>
                </div>
              </button>
            ))}
          </div>
        )}
        <button 
          className="user-profile-btn nav-item" 
          onClick={() => setShowUserMenu(!showUserMenu)}
          style={{ marginBottom: '12px', background: 'var(--bg-input)' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              <UserIcon size={14} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', flex: 1, overflow: 'hidden' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-heading)' }}>{currentUser?.name || 'User'}</span>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{currentUser?.role || 'Role'}</span>
            </div>
            <ChevronUpIcon size={14} />
          </div>
        </button>

        <div className="sidebar-status">
          <div className={`status-dot${online === false ? ' offline' : ''}`} />
          {online === null ? 'Connecting…' : online ? 'API online' : 'API offline'}
        </div>
      </div>
    </aside>
  )
}
