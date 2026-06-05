import { useState } from 'react'
import { useStore } from '../store'
import { Plus, Trash2, Edit2, Check, X, TestTube, Star, Clock } from 'lucide-react'
import type { Account, Platform, LLMConfig } from '../../types'

export default function Settings() {
  const { accounts, platforms, llmConfigs, schedule, loadAll } = useStore()
  const [tab, setTab] = useState<'accounts' | 'llm' | 'schedule'>('accounts')

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>设置</h2>
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--bg-secondary)', padding: 4, borderRadius: 10 }}>
        {[
          { key: 'accounts' as const, label: '账号与平台' },
          { key: 'llm' as const, label: '大模型配置' },
          { key: 'schedule' as const, label: '定时任务' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 13, fontWeight: 500,
            background: tab === t.key ? 'var(--accent)' : 'transparent',
            color: tab === t.key ? 'white' : 'var(--text-secondary)',
            border: 'none', cursor: 'pointer'
          }}>{t.label}</button>
        ))}
      </div>
      {tab === 'accounts' && <AccountSection accounts={accounts} platforms={platforms} onRefresh={loadAll} />}
      {tab === 'llm' && <LLMSection configs={llmConfigs} onRefresh={loadAll} />}
      {tab === 'schedule' && <ScheduleSection schedule={schedule} onRefresh={loadAll} />}
    </div>
  )
}

// ---- Account Section ----
function AccountSection({ accounts, platforms, onRefresh }: { accounts: Account[], platforms: Platform[], onRefresh: () => Promise<void> }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ name: '', username: '', password: '' })
  const [platformForm, setPlatformForm] = useState({ accountId: '', name: '', ssoUrl: '', workflowUrl: '', workflowView: '待办', urlPattern: '', platformType: 'landray' })
  const [showPlatformFor, setShowPlatformFor] = useState<string | null>(null)
  const [showNewPlatform, setShowNewPlatform] = useState(false)
  const [editingPlatform, setEditingPlatform] = useState<string | null>(null)

  const handleSaveAccount = async () => {
    if (!form.name || !form.username || !form.password) return
    if (editing) {
      await window.api.updateAccount(editing, form.name, form.username, form.password)
    } else {
      await window.api.createAccount(form.name, form.username, form.password)
    }
    setForm({ name: '', username: '', password: '' })
    setEditing(null)
    setShowNew(false)
    await onRefresh()
  }

  const handleDeleteAccount = async (id: string) => {
    if (confirm('确定删除此账号？关联的平台配置也会被删除。')) {
      await window.api.deleteAccount(id)
      await onRefresh()
    }
  }

  const handleSavePlatform = async () => {
    if (!platformForm.accountId || !platformForm.name || !platformForm.ssoUrl || !platformForm.workflowUrl || !platformForm.urlPattern) return
    if (editingPlatform) {
      await window.api.updatePlatform(editingPlatform, platformForm as any)
    } else {
      await window.api.createPlatform(platformForm as any)
    }
    setPlatformForm({ accountId: '', name: '', ssoUrl: '', workflowUrl: '', workflowView: '待办', urlPattern: '', platformType: 'landray' })
    setShowNewPlatform(false)
    setEditingPlatform(null)
    await onRefresh()
  }

  const handleDeletePlatform = async (id: string) => {
    await window.api.deletePlatform(id)
    await onRefresh()
  }

  const handleEditPlatform = (p: Platform) => {
    setEditingPlatform(p.id)
    setShowNewPlatform(true)
    setPlatformForm({
      accountId: p.accountId,
      name: p.name,
      ssoUrl: p.ssoUrl,
      workflowUrl: p.workflowUrl,
      workflowView: p.workflowView || '待办',
      urlPattern: p.urlPattern || '',
      platformType: p.platformType || 'landray'
    })
  }

  const handleExtractPlatform = async (platformId: string) => {
    await window.api.runPlatformExtraction(platformId)
    await onRefresh()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>管理登录账号和对应的 OA 平台</p>
        <button className="btn-primary" onClick={() => { setShowNew(true); setEditing(null); setForm({ name: '', username: '', password: '' }) }}
          style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Plus size={14} /> 添加账号
        </button>
      </div>

      {(showNew || editing) && (
        <div className="card" style={{ marginBottom: 12 }}>
          <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{editing ? '编辑账号' : '新增账号'}</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
            <input placeholder="账号名称（如：纵腾集团）" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <input placeholder="工号/用户名" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} />
            <input type="password" placeholder="密码" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" onClick={handleSaveAccount} style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Check size={14} /> 保存</button>
            <button className="btn-secondary" onClick={() => { setShowNew(false); setEditing(null) }} style={{ display: 'flex', alignItems: 'center', gap: 4 }}><X size={14} /> 取消</button>
          </div>
        </div>
      )}

      {accounts.map(account => (
        <div key={account.id} className="card" style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{account.name}</span>
              <span style={{ color: 'var(--text-secondary)', fontSize: 12, marginLeft: 12 }}>{account.username}</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn-secondary" onClick={() => { setShowPlatformFor(showPlatformFor === account.id ? null : account.id) }}
                style={{ padding: '4px 10px', fontSize: 12 }}>
                平台 ({platforms.filter(p => p.accountId === account.id).length})
              </button>
              <button className="btn-secondary" onClick={() => { setEditing(account.id); setForm({ name: account.name, username: account.username, password: account.password }); setShowNew(false) }}
                style={{ padding: 4 }}><Edit2 size={14} /></button>
              <button className="btn-danger" onClick={() => handleDeleteAccount(account.id)} style={{ padding: 4 }}><Trash2 size={14} /></button>
            </div>
          </div>

          {showPlatformFor === account.id && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>平台配置</span>
                <button className="btn-secondary" onClick={() => { setShowNewPlatform(true); setPlatformForm({ ...platformForm, accountId: account.id }) }}
                  style={{ padding: '3px 10px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Plus size={12} /> 添加平台
                </button>
              </div>

              {(showNewPlatform || editingPlatform) && platformForm.accountId === account.id && (
                <div style={{ background: 'var(--bg-primary)', borderRadius: 8, padding: 12, marginBottom: 10 }}>
                  <h5 style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>{editingPlatform ? '编辑平台' : '新增平台'}</h5>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                    <input placeholder="平台名称" value={platformForm.name} onChange={e => setPlatformForm({ ...platformForm, name: e.target.value })} />
                    <select value={platformForm.platformType} onChange={e => setPlatformForm({ ...platformForm, platformType: e.target.value })}>
                      <option value="landray">蓝凌 OA</option>
                      <option value="beisen">北森</option>
                      <option value="other">其他</option>
                    </select>
                    <select value={platformForm.workflowView} onChange={e => setPlatformForm({ ...platformForm, workflowView: e.target.value })}>
                      <option value="待办">待办</option><option value="我发起的">我发起的</option><option value="我已审的">我已审的</option>
                    </select>
                    <input placeholder="SSO 登录地址" value={platformForm.ssoUrl} onChange={e => setPlatformForm({ ...platformForm, ssoUrl: e.target.value })} style={{ gridColumn: '1 / -1' }} />
                    <input placeholder="流程列表地址" value={platformForm.workflowUrl} onChange={e => setPlatformForm({ ...platformForm, workflowUrl: e.target.value })} style={{ gridColumn: '1 / -1' }} />
                    <input placeholder="URL 模板（{fdId} 为占位符）" value={platformForm.urlPattern} onChange={e => setPlatformForm({ ...platformForm, urlPattern: e.target.value })} style={{ gridColumn: '1 / -1' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-primary" onClick={handleSavePlatform} style={{ padding: '4px 12px', fontSize: 12 }}>保存</button>
                    <button className="btn-secondary" onClick={() => { setShowNewPlatform(false); setEditingPlatform(null); setPlatformForm({ accountId: '', name: '', ssoUrl: '', workflowUrl: '', workflowView: '待办', urlPattern: '', platformType: 'landray' }) }} style={{ padding: '4px 12px', fontSize: 12 }}>取消</button>
                  </div>
                </div>
              )}

              {platforms.filter(p => p.accountId === account.id).map(p => (
                <div key={p.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 10px', background: 'var(--bg-primary)', borderRadius: 6, marginBottom: 4, fontSize: 12
                }}>
                  <div>
                    <span style={{ fontWeight: 500 }}>{p.name}</span>
                    <span className="badge badge-info" style={{ marginLeft: 8 }}>{p.workflowView}</span>
                    <span className="badge" style={{ marginLeft: 4, background: 'rgba(245,158,11,0.15)', color: 'var(--warning)' }}>
                      {p.platformType === 'beisen' ? '北森' : p.platformType === 'landray' ? 'OA' : '其他'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn-secondary" onClick={() => handleExtractPlatform(p.id)} style={{ padding: '2px 8px', fontSize: 11 }} title="提取此平台">提取</button>
                    <button className="btn-secondary" onClick={() => handleEditPlatform(p)} style={{ padding: 2 }}><Edit2 size={12} /></button>
                    <button className="btn-danger" onClick={() => handleDeletePlatform(p.id)} style={{ padding: 2 }}><Trash2 size={12} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ---- LLM Section ----
function LLMSection({ configs, onRefresh }: { configs: LLMConfig[], onRefresh: () => Promise<void> }) {
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', baseUrl: '', apiKey: '', modelName: '', isDefault: false })
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [testing, setTesting] = useState(false)

  const handleSave = async () => {
    if (!form.name || !form.baseUrl || !form.apiKey || !form.modelName) return
    if (editing) {
      await window.api.updateLLMConfig(editing, form)
    } else {
      await window.api.createLLMConfig(form)
    }
    setForm({ name: '', baseUrl: '', apiKey: '', modelName: '', isDefault: false })
    setShowForm(false)
    setEditing(null)
    await onRefresh()
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    const result = await window.api.testLLM({ id: '', ...form } as any)
    setTestResult(result)
    setTesting(false)
  }

  const handleDelete = async (id: string) => {
    if (confirm('确定删除此模型配置？')) {
      await window.api.deleteLLMConfig(id)
      await onRefresh()
    }
  }

  const handleSetDefault = async (id: string) => {
    await window.api.updateLLMConfig(id, { isDefault: true })
    await onRefresh()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>配置大模型 API（支持所有 OpenAI 兼容接口）</p>
        <button className="btn-primary" onClick={() => { setShowForm(true); setEditing(null); setForm({ name: '', baseUrl: '', apiKey: '', modelName: '', isDefault: configs.length === 0 }) }}
          style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Plus size={14} /> 添加模型
        </button>
      </div>

      {(showForm || editing) && (
        <div className="card" style={{ marginBottom: 12 }}>
          <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{editing ? '编辑模型' : '新增模型'}</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <input placeholder="显示名称（如：DeepSeek V3）" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <input placeholder="模型名称（如：deepseek-chat）" value={form.modelName} onChange={e => setForm({ ...form, modelName: e.target.value })} />
            <input placeholder="API Base URL" value={form.baseUrl} onChange={e => setForm({ ...form, baseUrl: e.target.value })} style={{ gridColumn: '1 / -1' }} />
            <input type="password" placeholder="API Key" value={form.apiKey} onChange={e => setForm({ ...form, apiKey: e.target.value })} style={{ gridColumn: '1 / -1' }} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.isDefault} onChange={e => setForm({ ...form, isDefault: e.target.checked })} />
            设为默认模型
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" onClick={handleSave} style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Check size={14} /> 保存</button>
            <button className="btn-secondary" onClick={handleTest} disabled={testing} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <TestTube size={14} /> {testing ? '测试中...' : '测试连接'}
            </button>
            <button className="btn-secondary" onClick={() => { setShowForm(false); setEditing(null) }} style={{ display: 'flex', alignItems: 'center', gap: 4 }}><X size={14} /> 取消</button>
          </div>
          {testResult && (
            <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8, fontSize: 12,
              background: testResult.success ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
              color: testResult.success ? 'var(--success)' : 'var(--danger)' }}>
              {testResult.success ? '✓ 连接成功' : '✗ ' + testResult.message}
            </div>
          )}
        </div>
      )}

      {configs.map(c => (
        <div key={c.id} className="card" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</span>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', background: 'var(--bg-primary)', padding: '2px 8px', borderRadius: 4 }}>{c.modelName}</span>
              {c.isDefault && <span className="badge badge-success">默认</span>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{c.baseUrl}</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {!c.isDefault && <button className="btn-secondary" onClick={() => handleSetDefault(c.id)} style={{ padding: 4 }} title="设为默认"><Star size={14} /></button>}
            <button className="btn-secondary" onClick={() => { setEditing(c.id); setForm({ name: c.name, baseUrl: c.baseUrl, apiKey: c.apiKey, modelName: c.modelName, isDefault: c.isDefault }); setShowForm(false) }}
              style={{ padding: 4 }}><Edit2 size={14} /></button>
            <button className="btn-danger" onClick={() => handleDelete(c.id)} style={{ padding: 4 }}><Trash2 size={14} /></button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ---- Schedule Section ----
function ScheduleSection({ schedule, onRefresh }: { schedule: { enabled: boolean; intervalMinutes: number }, onRefresh: () => Promise<void> }) {
  const [form, setForm] = useState(schedule)

  const handleSave = async () => {
    await window.api.setSchedule(form)
    await onRefresh()
  }

  return (
    <div>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>设置自动提取流程的时间间隔</p>
      <div className="card">
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer', marginBottom: 16 }}>
          <input type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} />
          <Clock size={16} /> 启用定时提取
        </label>
        {form.enabled && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>提取间隔（分钟）</label>
            <input type="number" min={5} max={1440} value={form.intervalMinutes}
              onChange={e => setForm({ ...form, intervalMinutes: parseInt(e.target.value) || 30 })}
              style={{ width: 120 }} />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>
              当前：每 {form.intervalMinutes} 分钟执行一次
            </span>
          </div>
        )}
        <button className="btn-primary" onClick={handleSave}>保存设置</button>
      </div>
    </div>
  )
}
