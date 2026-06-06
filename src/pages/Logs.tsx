import { useStore } from '../store'
import { CheckCircle, XCircle, Clock, RefreshCw, Trash2 } from 'lucide-react'

const statusIcons: Record<string, any> = {
  success: CheckCircle,
  failed: XCircle,
  running: RefreshCw,
}

const statusColors: Record<string, string> = {
  success: '#30D158',
  failed: '#FF453A',
  running: '#0A84FF',
}

export default function Logs() {
  const { logs, loadLogs, clearLogs } = useStore()

  const handleClear = async () => {
    if (!confirm('确定清空所有执行日志吗？')) return
    await clearLogs()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 600 }}>执行日志</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>最近 {logs.length} 条记录</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" onClick={loadLogs} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
            <RefreshCw size={14} /> 刷新
          </button>
          {logs.length > 0 && (
            <button onClick={handleClear} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '6px 14px', borderRadius: 'var(--radius-md)',
              background: 'transparent', color: 'var(--danger)',
              border: '1px solid rgba(255,69,58,0.25)', cursor: 'pointer',
              fontSize: 13, fontWeight: 500, transition: 'all 0.15s ease',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,69,58,0.1)'; e.currentTarget.style.borderColor = 'rgba(255,69,58,0.5)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(255,69,58,0.25)' }}
            >
              <Trash2 size={14} /> 清空日志
            </button>
          )}
        </div>
      </div>

      {logs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 64, color: 'var(--text-secondary)' }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <Clock size={24} style={{ opacity: 0.2 }} />
          </div>
          <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>暂无执行记录</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {logs.map(log => {
            const Icon = statusIcons[log.status] || Clock
            const color = statusColors[log.status] || 'var(--text-secondary)'
            return (
              <div key={log.id} className="card" style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px' }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 'var(--radius-sm)',
                  background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, marginTop: 1,
                }}>
                  <Icon size={14} style={{ color }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{log.action}</span>
                    <span className={`badge ${log.status === 'success' ? 'badge-success' : log.status === 'failed' ? 'badge-danger' : 'badge-info'}`}>{log.status}</span>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', wordBreak: 'break-all', lineHeight: 1.5 }}>{log.message}</p>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 }}>{log.createdAt}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
