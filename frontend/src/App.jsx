import { useState } from 'react'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import AnonymisationPage from './pages/AnonymisationPage'
import SummarisationPage from './pages/SummarisationPage'
import CompletenessPage from './pages/CompletenessPage'
import ClassificationPage from './pages/ClassificationPage'
import InspectionPage from './pages/InspectionPage'
import HistoryPage from './pages/HistoryPage'
import LoginPage from './pages/LoginPage'

const PAGES = {
  dashboard: Dashboard,
  anonymisation: AnonymisationPage,
  summarisation: SummarisationPage,
  completeness: CompletenessPage,
  classification: ClassificationPage,
  inspection: InspectionPage,
  history: HistoryPage,
}

export const USERS = [
  { email: 'admin@cdscoregai.com', name: 'Admin User', role: 'admin' },
  { email: 'reviewer@cdscoregai.com', name: 'Standard User', role: 'standard' }
]

export default function App() {
  const [page, setPage] = useState('dashboard')
  const [currentUser, setCurrentUser] = useState(null) // null means not logged in
  const Page = PAGES[page] ?? Dashboard

  if (!currentUser) {
    return <LoginPage onLogin={setCurrentUser} />
  }

  return (
    <div className="app-layout">
      <Sidebar active={page} onNavigate={setPage} currentUser={currentUser} onUserSwitch={setCurrentUser} />
      <main className="main-content">
        <Page />
      </main>
    </div>
  )
}
