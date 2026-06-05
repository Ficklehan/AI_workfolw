import { useState, useEffect } from 'react'
import { useStore } from '../store'
import { LayoutDashboard, Settings, FileText, RefreshCw, Brain } from 'lucide-react'

export default function Sidebar() {
  const { currentPage, setPage, extracting, workflows, loadWorkflows, loadLogs, setExtracting } = useStore()
  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState<{ current: number; total: number; account: string; platform: string } | null>(null)

  // Listen for extraction progress
  useEffect(() => {
    if (!extracting) { setProgress(null); return }
    const cleanup = window.api.onExtractionProgress((data) => {
      setProgress(data)
    })
    return cleanup
  }, [extracting])

  const handleExtract = async () => {
    setExtracting(true)
    try {
      await window.api.runExtraction()
      await loadWorkflows()
      await loadLogs()
    } finally {
      setExtracting(false)
      setProgress(null)
    }
  }

  const handleAnalyze = async () => {
    setAnalyzing(true)
    try {
      await window.api.runLLMAnalysis()
      await loadWorkflows()
      await loadLogs()
    } finally {
      setAnalyzing(false)
    }
  }

  const handleReanalyze = async () => {
    setAnalyzing(true)
    try {
      await window.api.runLLMReanalyze()
      await loadWorkflows()
      await loadLogs()
    } finally {
      setAnalyzing(false)
    }
  }

  const navItems = [
    { key: 'dashboard' as const, icon: LayoutDashboard, label: '工作台', badge: workflows.length },
    { key: 'settings' as const, icon: Settings, label: '设置' },
    { key: 'logs' as const, icon: FileText, label: '执行日志' },
  ]

  return (
    <aside style={{
      width: 220, background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', flexShrink: 0
    }}>
      <div className="titlebar-drag" />
      <div style={{ padding: '12px 20px 20px' }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14
          }}>W</div>
          WorkflowAI
        </h1>
      </div>

      <nav style={{ flex: 1, padding: '0 12px' }}>
        {navItems.map(item => (
          <button
            key={item.key}
            onClick={() => setPage(item.key)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', marginBottom: 4, borderRadius: 8,
              background: currentPage === item.key ? 'var(--accent)' : 'transparent',
              color: currentPage === item.key ? 'white' : 'var(--text-secondary)',
              fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer'
            }}
          >
            <item.icon size={18} />
            <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>
            {item.badge !== undefined && item.badge > 0 && (
              <span style={{
                background: currentPage === item.key ? 'rgba(255,255,255,0.2)' : 'var(--accent)',
                color: 'white', padding: '1px 7px', borderRadius: 9999, fontSize: 11
              }}>{item.badge}</span>
            )}
          </button>
        ))}
      </nav>

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button className="btn-primary" onClick={handleExtract} disabled={extracting}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <RefreshCw size={14} className={extracting ? 'animate-spin' : ''} />
          {extracting ? (progress ? `${progress.account} ${progress.platform}` : '提取中...') : '立即提取'}
        </button>
        {extracting && progress && (
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center' }}>
            {progress.current}/{progress.total}
          </div>
        )}
        <button className="btn-secondary" onClick={handleAnalyze} disabled={analyzing}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Brain size={14} className={analyzing ? 'animate-spin' : ''} />
          {analyzing ? '分析中...' : 'AI 分析'}
        </button>
        <button className="btn-secondary" onClick={handleReanalyze} disabled={analyzing}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 11 }}>
          重新分析全部
        </button>
      </div>
    </aside>
  )
}
