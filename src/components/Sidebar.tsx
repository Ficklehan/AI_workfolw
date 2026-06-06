import { useState, useEffect } from 'react'
import { useStore } from '../store'
import { LayoutDashboard, Settings, FileText, RefreshCw, Brain } from 'lucide-react'

export default function Sidebar() {
  const { currentPage, setPage, extracting, workflows, loadWorkflows, loadLogs, setExtracting } = useStore()
  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState<{ current: number; total: number; account: string; platform: string } | null>(null)

  useEffect(() => {
    if (!extracting) { setProgress(null); return }
    const cleanup = window.api.onExtractionProgress((data) => setProgress(data))
    return cleanup
  }, [extracting])

  const handleExtract = async () => {
    setExtracting(true)
    try { await window.api.runExtraction(); await loadWorkflows(); await loadLogs() }
    finally { setExtracting(false); setProgress(null) }
  }

  const handleAnalyze = async () => {
    setAnalyzing(true)
    try { await window.api.runLLMAnalysis(); await loadWorkflows(); await loadLogs() }
    finally { setAnalyzing(false) }
  }

  const handleReanalyze = async () => {
    setAnalyzing(true)
    try { await window.api.runLLMReanalyze(); await loadWorkflows(); await loadLogs() }
    finally { setAnalyzing(false) }
  }

  const navItems = [
    { key: 'dashboard' as const, icon: LayoutDashboard, label: '工作台', badge: workflows.length },
    { key: 'settings' as const, icon: Settings, label: '设置' },
    { key: 'logs' as const, icon: FileText, label: '执行日志' },
  ]

  return (
    <aside style={{
      width: 220,
      background: 'var(--bg-sidebar)',
      backdropFilter: 'var(--blur-glass)',
      WebkitBackdropFilter: 'var(--blur-glass)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      borderRight: '0.5px solid rgba(255, 255, 255, 0.06)',
    }}>
      <div className="titlebar-drag" />
      <div style={{ padding: '12px 16px 20px' }}>
        <h1 style={{
          fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8,
          color: 'var(--text-primary)', letterSpacing: '-0.01em',
        }}>
          <div style={{
            width: 26, height: 26, borderRadius: 6,
            background: '#0A84FF',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, color: 'white', fontWeight: 700,
          }}>W</div>
          WorkflowAI
        </h1>
      </div>

      <nav style={{ flex: 1, padding: '0 8px' }}>
        {navItems.map(item => {
          const isActive = currentPage === item.key
          return (
            <button
              key={item.key}
              onClick={() => setPage(item.key)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 10px', marginBottom: 1, borderRadius: 6,
                background: isActive ? 'var(--bg-active)' : 'transparent',
                color: isActive ? '#fff' : 'var(--text-secondary)',
                fontSize: 13, fontWeight: isActive ? 500 : 400,
                border: 'none', cursor: 'pointer',
                transition: 'background 0.1s, color 0.1s',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)' }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
            >
              <item.icon size={16} strokeWidth={isActive ? 2 : 1.5} style={{ color: isActive ? 'var(--accent)' : 'var(--text-tertiary)' }} />
              <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span style={{ fontSize: 11, fontWeight: 500, color: isActive ? 'var(--accent)' : 'var(--text-tertiary)' }}>{item.badge}</span>
              )}
            </button>
          )
        })}
      </nav>

      <div style={{
        padding: '10px 8px 12px', display: 'flex', flexDirection: 'column', gap: 6,
        borderTop: '0.5px solid rgba(255, 255, 255, 0.06)',
      }}>
        <button className="btn-primary" onClick={handleExtract} disabled={extracting}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13 }}>
          <RefreshCw size={13} className={extracting ? 'animate-spin' : ''} />
          {extracting ? (progress ? `${progress.account} ${progress.platform}` : '提取中...') : '立即提取'}
        </button>
        {extracting && progress && (
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center' }}>{progress.current}/{progress.total}</div>
        )}
        <button className="btn-secondary" onClick={handleAnalyze} disabled={analyzing}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13 }}>
          <Brain size={13} className={analyzing ? 'animate-spin' : ''} />
          {analyzing ? '分析中...' : 'AI 分析'}
        </button>
        <button className="btn-secondary" onClick={handleReanalyze} disabled={analyzing}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 11, color: 'var(--text-tertiary)' }}>
          重新分析全部
        </button>
      </div>
    </aside>
  )
}
