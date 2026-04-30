import { useState } from 'react'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import AnonymisationPage from './pages/AnonymisationPage'
import SummarisationPage from './pages/SummarisationPage'
import CompletenessPage from './pages/CompletenessPage'
import ClassificationPage from './pages/ClassificationPage'
import InspectionPage from './pages/InspectionPage'

const PAGES = {
  dashboard: Dashboard,
  anonymisation: AnonymisationPage,
  summarisation: SummarisationPage,
  completeness: CompletenessPage,
  classification: ClassificationPage,
  inspection: InspectionPage,
}

export default function App() {
  const [page, setPage] = useState('dashboard')
  const Page = PAGES[page] ?? Dashboard

  return (
    <div className="app-layout">
      <Sidebar active={page} onNavigate={setPage} />
      <main className="main-content">
        <Page />
      </main>
    </div>
  )
}
