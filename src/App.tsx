import { useEffect } from 'react'
import { useStore } from './store'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'
import Logs from './pages/Logs'

export default function App() {
  const { currentPage, loadAll } = useStore()

  useEffect(() => {
    loadAll()
    const cleanup = window.api.onWorkflowsUpdated(() => {
      useStore.getState().loadWorkflows()
      useStore.getState().loadLogs()
    })
    return cleanup
  }, [])

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard': return <Dashboard />
      case 'settings': return <Settings />
      case 'logs': return <Logs />
      default: return <Dashboard />
    }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw' }}>
      <Sidebar />
      <main style={{ flex: 1, minWidth: 0, overflow: 'auto', paddingTop: 38 }}>
        <div className="titlebar-drag" style={{ position: 'fixed', top: 0, left: 220, right: 0, zIndex: 50 }} />
        <div style={{ padding: '52px 24px 24px', width: '100%' }}>
          {renderPage()}
        </div>
      </main>
    </div>
  )
}
