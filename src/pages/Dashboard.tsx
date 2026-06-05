import { useState, useMemo } from 'react'
import { useStore } from '../store'
import { Search, ExternalLink, Clock, User, GitBranch, Sparkles, RefreshCw } from 'lucide-react'
import Dropdown from '../components/Dropdown'

const statusColors: Record<string, string> = {
  '待审': 'badge-warning',
  '结束': 'badge-success',
  '废弃': 'badge-danger',
  '草稿': 'badge-info',
  '驳回': 'badge-danger',
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
        const match = w.title.toLowerCase().includes(q) ||
          w.docNumber?.toLowerCase().includes(q) ||
          w.currentStep?.toLowerCase().includes(q) ||
          w.currentHandler?.toLowerCase().includes(q) ||
          w.accountName?.toLowerCase().includes(q) ||
          w.platformName?.toLowerCase().includes(q) ||
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
      if (existing) {
        existing.count++
      } else {
        map.set(key, { account: w.accountName || '未知', platform: w.platformName || '未知', count: 1 })
      }
    })
    return Array.from(map.values())
  }, [workflows])

  const handleOpen = async (platformId: string, url: string) => {
    await window.api.openUrlWithAuth(platformId, url)
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>工作台</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
            共 {workflows.length} 条待办流程，当前显示 {filtered.length} 条
          </p>
        </div>
        {extracting && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 14px', borderRadius: 8,
            background: 'rgba(99,102,241,0.1)', color: 'var(--accent)', fontSize: 13
          }}>
            <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
            正在提取中...
          </div>
        )}
      </div>

      {/* Account+Platform Summary — click to filter */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div
          className="card"
          onClick={() => { setFilterAccount(''); setFilterPlatform('') }}
          style={{
            padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
            border: !filterAccount && !filterPlatform ? '1px solid var(--accent)' : undefined
          }}
        >
          <span className="badge badge-info">全部</span>
          <span style={{ fontSize: 18, fontWeight: 700 }}>{workflows.length}</span>
        </div>
        {platformCounts.map(item => {
          const isActive = filterAccount === item.account && filterPlatform === item.platform
          return (
            <div
              key={`${item.account}-${item.platform}`}
              className="card"
              onClick={() => {
                if (isActive) { setFilterAccount(''); setFilterPlatform('') }
                else { setFilterAccount(item.account); setFilterPlatform(item.platform) }
              }}
              style={{
                padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                border: isActive ? '1px solid var(--accent)' : undefined
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{item.account}</span>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{item.platform}</span>
              </div>
              <span style={{ fontSize: 18, fontWeight: 700 }}>{item.count}</span>
            </div>
          )
        })}
      </div>

      {/* Search + Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input
            placeholder="搜索流程标题、编号、处理人..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', paddingLeft: 36 }}
          />
        </div>
        <Dropdown
          value={filterAccount}
          options={[{ label: '全部账号', value: '' }, ...accounts.map(a => ({ label: a.name, value: a.name }))]}
          onChange={v => { setFilterAccount(v); setFilterPlatform('') }}
          placeholder="全部账号"
          minWidth={130}
        />
        <Dropdown
          value={filterPlatform}
          options={[{ label: '全部平台', value: '' }, ...filteredPlatforms.map(p => ({ label: p.name, value: p.name }))]}
          onChange={v => setFilterPlatform(v)}
          placeholder="全部平台"
          minWidth={130}
        />
        <Dropdown
          value={filterStatus}
          options={[{ label: '全部状态', value: '' }, ...uniqueStatuses.map(s => ({ label: s, value: s }))]}
          onChange={v => setFilterStatus(v)}
          placeholder="全部状态"
          minWidth={120}
        />
      </div>

      {/* Workflow List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)' }}>加载中...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <p style={{ fontSize: 14 }}>暂无待办流程</p>
          <p style={{ fontSize: 12, marginTop: 4 }}>点击左侧"立即提取"获取最新数据</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(w => (
            <div key={w.id} className="card" style={{
              display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer',
              transition: 'border-color 0.2s'
            }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              onClick={() => handleOpen(w.platformId, w.url)}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {w.title}
                  </span>
                  <span className={`badge ${statusColors[w.status] || 'badge-info'}`}>{w.status}</span>
                  {w.accountName && <span className="badge" style={{ background: 'rgba(34,197,94,0.15)', color: 'var(--success)' }}>🏢 {w.accountName}</span>}
                  {w.platformName && <span className="badge" style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--warning)' }}>🌐 {w.platformName}</span>}
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-secondary)' }}>
                  {w.docNumber && <span>📄 {w.docNumber}</span>}
                  {w.currentStep && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><GitBranch size={11} />{w.currentStep}</span>}
                  {w.currentHandler && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><User size={11} />{w.currentHandler}</span>}
                  {w.createDate && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Clock size={11} />{w.createDate}</span>}
                </div>
                {w.llmSummary && (
                  <div style={{
                    marginTop: 8, padding: '6px 10px', borderRadius: 8,
                    background: 'rgba(99,102,241,0.06)', fontSize: 12,
                    color: 'var(--accent)', display: 'flex', alignItems: 'flex-start', gap: 6
                  }}>
                    <Sparkles size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>{w.llmSummary}</span>
                  </div>
                )}
              </div>
              <ExternalLink size={16} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
