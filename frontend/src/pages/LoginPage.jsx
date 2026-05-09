import { useState } from 'react'
import { USERS } from '../App'
import { ShieldIcon, ActivityIcon } from '../components/Icons'

export default function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    // Find user (Admin only for now per requirement)
    const user = USERS.find(u => u.email === email)
    
    // Password validation using environment variable
    if (user && user.role === 'admin' && password === import.meta.env.VITE_APP_ADMIN_PASSWORD) {
      onLogin(user)
    } else {
      setError('Invalid admin credentials. Please try again.')
    }
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', 
      minHeight: '100vh', background: 'var(--bg-base)', width: '100%'
    }}>
      <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '40px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ 
            width: '48px', height: '48px', background: 'linear-gradient(135deg, var(--accent) 0%, var(--purple) 100%)', 
            borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', 
            margin: '0 auto 16px' 
          }}>
            <ActivityIcon size={24} style={{ color: '#fff' }} />
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-heading)', marginBottom: '8px' }}>
            CDSCO RegAI
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
            Authorised Admin Access Only
          </p>
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: '20px' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="form-group">
            <label className="form-label">Admin Email</label>
            <input 
              type="email" 
              className="form-input" 
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@cdscoregai.com"
              required
            />
          </div>
          
          <div className="form-group">
            <label className="form-label">Password</label>
            <input 
              type="password" 
              className="form-input" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>

          <button type="submit" className="btn btn-primary btn-full btn-lg" style={{ marginTop: '8px' }}>
            <ShieldIcon size={16} />
            Secure Login
          </button>
        </form>

        <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '12px', color: 'var(--text-dim)' }}>
          System protected by DPDP Act 2023 Guidelines
        </div>
      </div>
    </div>
  )
}
