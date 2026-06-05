import { useStore } from '../store'
import { CheckCircle, XCircle, Clock, RefreshCw, Trash2 } from 'lucide-react'

const statusIcons: Record<string, any> = {
  success: CheckCircle,
  failed: XCircle,
  running: RefreshCw,
}

const statusColors: Record<string, string> = {
  success: 'var(--success)',
  failed: 'var(--danger)',
  running: 'var(--accent)',
}

export default function Logs() {
  const { logs, loadLogs, clearLogs } = useStore()

  const handleClear = async () => {
    if (!confirm('确定清空所有执行日志吗？')) return
    await clearLogs()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>执行日志</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>最近 {logs.length} 条记录</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" onClick={loadLogs} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <RefreshCw size={14} /> 刷新
          </button>
          {logs.length > 0 && (
            <button
              onClick={handleClear}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '6px 12px', borderRadius: 6,
                background: 'rgba(239,68,68,0.1)', color: 'var(--danger)',
                border: '1px solid rgba(239,68,68,0.3)', cursor: 'pointer',
                fontSize: 13, transition: 'all 0.2s'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(239,68,68,0.2)'
                e.currentTarget.style.borderColor = 'var(--danger)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(239,68,68,0.1)'
                e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'
              }}
            >
              <Trash2 size={14} /> 清空日志
            </button>
          )}
        </div>
      </div>

      {logs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>
          <Clock size={40} style={{ marginBottom: 12, opacity: 0.3 }} />
          <p style={{ fontSize: 14 }}>暂无执行记录</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {logs.map(log => {
            const Icon = statusIcons[log.status] || Clock
            const color = statusColors[log.status] || 'var(--text-secondary)'
            return (
              <div key={log.id} className="card" style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px' }}>
                <Icon size={16} style={{ color, flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{log.action}</span>
                    <span className={`badge ${log.status === 'success' ? 'badge-success' : log.status === 'failed' ? 'badge-danger' : 'badge-info'}`}>
                      {log.status}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{log.message}</p>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0 }}>{log.createdAt}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
