import { useState, useMemo } from 'react'
import { useStore } from '../store'
import { Search, ExternalLink, Clock, User, GitBranch, Sparkles, RefreshCw } from 'lucide-react'
import Dropdown from '../components/Dropdown'

const statusColors: Record<string, string> = {
  '待审': 'badge-warning', '结束': 'badge-success', '废弃': 'badge-danger',
  '草稿': 'badge-info', '驳回': 'badge-danger',
}

export default function Dashboard() {
  const { workflows, accounts, platforms, loading, extracting } = useStore()
  const [search, setSearch] = useState('')
  const [filterAccount, setFilterAccount] = useState('')
  const [filterPlatform, setFilterPlatform] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const accountNameMap = useMemo(() => {
    const map = new Map<string, string>()
    accounts.forEach(a => map.set(a.name, a.id))
    return map
  }, [accounts])

  const filteredPlatforms = useMemo(() => {
    if (!filterAccount) return platforms
    const accountId = accountNameMap.get(filterAccount)
    return accountId ? platforms.filter(p => p.accountId === accountId) : platforms
  }, [platforms, filterAccount, accountNameMap])

  const filtered = useMemo(() => {
    return workflows.filter(w => {
      if (search) {
        const q = search.toLowerCase()
        const match = w.title.toLowerCase().includes(q) || w.docNumber?.toLowerCase().includes(q) ||
          w.currentStep?.toLowerCase().includes(q) || w.currentHandler?.toLowerCase().includes(q) ||
          w.accountName?.toLowerCase().includes(q) || w.platformName?.toLowerCase().includes(q) ||
          w.llmSummary?.toLowerCase().includes(q)
        if (!match) return false
      }
      if (filterAccount && w.accountName !== filterAccount) return false
      if (filterPlatform && w.platformName !== filterPlatform) return false
      if (filterStatus && w.status !== filterStatus) return false
      return true
    })
  }, [workflows, search, filterAccount, filterPlatform, filterStatus])

  const uniqueStatuses = [...new Set(workflows.map(w => w.status).filter(Boolean))]

  const platformCounts = useMemo(() => {
    const map = new Map<string, { account: string; platform: string; count: number }>()
    workflows.forEach(w => {
      const key = `${w.accountName || '未知'}|${w.platformName || '未知'}`
      const existing = map.get(key)
      if (existing) existing.count++
      else map.set(key, { account: w.accountName || '未知', platform: w.platformName || '未知', count: 1 })
    })
    return Array.from(map.values())
  }, [workflows])

  const handleOpen = async (platformId: string, url: string) => {
    await window.api.openUrlWithAuth(platformId, url)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 600 }}>工作台</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>
            共 {workflows.length} 条待办流程，当前显示 {filtered.length} 条
          </p>
        </div>
        {extracting && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: 6,
            background: 'var(--accent-light)', color: 'var(--accent)', fontSize: 12, fontWeight: 500,
          }}>
            <RefreshCw size={13} className="animate-spin" />
            正在提取中...
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <SummaryCard label="全部" count={workflows.length} active={!filterAccount && !filterPlatform}
          onClick={() => { setFilterAccount(''); setFilterPlatform('') }} />
        {platformCounts.map(item => (
          <SummaryCard key={`${item.account}-${item.platform}`}
            label={item.account} sublabel={item.platform} count={item.count}
            active={filterAccount === item.account && filterPlatform === item.platform}
            onClick={() => {
              if (filterAccount === item.account && filterPlatform === item.platform) { setFilterAccount(''); setFilterPlatform('') }
              else { setFilterAccount(item.account); setFilterPlatform(item.platform) }
            }} />
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input placeholder="搜索流程标题、编号、处理人..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: '100%', paddingLeft: 32 }} />
        </div>
        <Dropdown value={filterAccount} options={[{ label: '全部账号', value: '' }, ...accounts.map(a => ({ label: a.name, value: a.name }))]}
          onChange={v => { setFilterAccount(v); setFilterPlatform('') }} placeholder="全部账号" minWidth={120} />
        <Dropdown value={filterPlatform} options={[{ label: '全部平台', value: '' }, ...filteredPlatforms.map(p => ({ label: p.name, value: p.name }))]}
          onChange={v => setFilterPlatform(v)} placeholder="全部平台" minWidth={120} />
        <Dropdown value={filterStatus} options={[{ label: '全部状态', value: '' }, ...uniqueStatuses.map(s => ({ label: s, value: s }))]}
          onChange={v => setFilterStatus(v)} placeholder="全部状态" minWidth={110} />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-secondary)', fontSize: 13 }}>加载中...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 64, color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>📋</div>
          <p style={{ fontSize: 14, fontWeight: 500 }}>暂无待办流程</p>
          <p style={{ fontSize: 12, marginTop: 4, color: 'var(--text-tertiary)' }}>点击左侧"立即提取"获取最新数据</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {filtered.map(w => (
            <div key={w.id} className="card" style={{
              display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', padding: '12px 14px',
            }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              onClick={() => handleOpen(w.platformId, w.url)}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.title}</span>
                  <span className={`badge ${statusColors[w.status] || 'badge-info'}`}>{w.status}</span>
                  {w.accountName && <span className="badge" style={{ background: 'rgba(118,118,128,0.1)', color: 'var(--text-secondary)' }}>{w.accountName}</span>}
                  {w.platformName && <span className="badge" style={{ background: 'rgba(118,118,128,0.1)', color: 'var(--text-secondary)' }}>{w.platformName}</span>}
                </div>
                <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--text-tertiary)' }}>
                  {w.docNumber && <span>{w.docNumber}</span>}
                  {w.currentStep && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><GitBranch size={10} />{w.currentStep}</span>}
                  {w.currentHandler && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><User size={10} />{w.currentHandler}</span>}
                  {w.createDate && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Clock size={10} />{w.createDate}</span>}
                </div>
                {w.llmSummary && (
                  <div style={{
                    marginTop: 8, padding: '6px 10px', borderRadius: 6,
                    background: 'rgba(10,132,255,0.06)', fontSize: 12, lineHeight: 1.5,
                    color: 'var(--accent)', display: 'flex', alignItems: 'flex-start', gap: 6,
                    border: '0.5px solid rgba(10,132,255,0.1)',
                  }}>
                    <Sparkles size={12} style={{ flexShrink: 0, marginTop: 1, opacity: 0.6 }} />
                    <span>{w.llmSummary}</span>
                  </div>
                )}
              </div>
              <ExternalLink size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, sublabel, count, active, onClick }: {
  label: string; sublabel?: string; count: number; active: boolean; onClick: () => void
}) {
  return (
    <div className="card" onClick={onClick} style={{
      padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
      borderColor: active ? 'rgba(10,132,255,0.3)' : 'var(--border)',
      background: active ? 'rgba(10,132,255,0.1)' : 'var(--bg-card)',
    }}>
      {sublabel ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: active ? 'var(--accent)' : 'var(--text-primary)' }}>{label}</span>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{sublabel}</span>
        </div>
      ) : (
        <span style={{
          fontSize: 11, fontWeight: 500, color: active ? 'var(--accent)' : 'var(--text-secondary)',
        }}>{label}</span>
      )}
      <span style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-primary)' }}>{count}</span>
    </div>
  )
}
