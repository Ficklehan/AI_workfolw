import { useState } from 'react'
import { useStore } from '../store'
import { Plus, Trash2, Edit2, Check, X, TestTube, Star, Clock, ChevronRight, User, Globe } from 'lucide-react'
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

// ---- Account Section (左右分栏) ----
function AccountSection({ accounts, platforms, onRefresh }: { accounts: Account[], platforms: Platform[], onRefresh: () => Promise<void> }) {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(accounts[0]?.id || null)
  const [editingAccount, setEditingAccount] = useState<string | null>(null)
  const [showNewAccount, setShowNewAccount] = useState(false)
  const [accountForm, setAccountForm] = useState({ name: '', username: '', password: '' })
  const [editingPlatform, setEditingPlatform] = useState<string | null>(null)
  const [showNewPlatform, setShowNewPlatform] = useState(false)
  const [platformForm, setPlatformForm] = useState({ accountId: '', name: '', ssoUrl: '', workflowUrl: '', workflowView: '待办', urlPattern: '', platformType: 'landray' })
  const [formError, setFormError] = useState('')

  const selectedAccount = accounts.find(a => a.id === selectedAccountId)
  const selectedPlatforms = platforms.filter(p => p.accountId === selectedAccountId)

  // ---- Account handlers ----
  const handleSaveAccount = async () => {
    if (!accountForm.name || !accountForm.username || !accountForm.password) {
      setFormError('请填写所有字段')
      return
    }
    setFormError('')
    if (editingAccount) {
      await window.api.updateAccount(editingAccount, accountForm.name, accountForm.username, accountForm.password)
    } else {
      const newAccount = await window.api.createAccount(accountForm.name, accountForm.username, accountForm.password)
      setSelectedAccountId(newAccount.id)
    }
    setAccountForm({ name: '', username: '', password: '' })
    setEditingAccount(null)
    setShowNewAccount(false)
    await onRefresh()
  }

  const handleDeleteAccount = async (id: string) => {
    if (!confirm('确定删除此账号？关联的平台也会被删除。')) return
    await window.api.deleteAccount(id)
    if (selectedAccountId === id) setSelectedAccountId(accounts[0]?.id || null)
    await onRefresh()
  }

  const startEditAccount = (a: Account) => {
    setEditingAccount(a.id)
    setShowNewAccount(false)
    setAccountForm({ name: a.name, username: a.username, password: a.password })
    setFormError('')
  }

  // ---- Platform handlers ----
  const handleSavePlatform = async () => {
    if (!platformForm.name || !platformForm.ssoUrl || !platformForm.workflowUrl || !platformForm.urlPattern) {
      setFormError('请填写所有必填字段')
      return
    }
    setFormError('')
    if (editingPlatform) {
      await window.api.updatePlatform(editingPlatform, platformForm as any)
    } else {
      await window.api.createPlatform(platformForm as any)
    }
    resetPlatformForm()
    await onRefresh()
  }

  const handleDeletePlatform = async (id: string) => {
    await window.api.deletePlatform(id)
    await onRefresh()
  }

  const startEditPlatform = (p: Platform) => {
    setEditingPlatform(p.id)
    setShowNewPlatform(false)
    setPlatformForm({
      accountId: p.accountId, name: p.name, ssoUrl: p.ssoUrl,
      workflowUrl: p.workflowUrl, workflowView: p.workflowView || '待办',
      urlPattern: p.urlPattern || '', platformType: p.platformType || 'landray'
    })
    setFormError('')
  }

  const resetPlatformForm = () => {
    setEditingPlatform(null)
    setShowNewPlatform(false)
    setPlatformForm({ accountId: '', name: '', ssoUrl: '', workflowUrl: '', workflowView: '待办', urlPattern: '', platformType: 'landray' })
    setFormError('')
  }

  return (
    <div style={{ display: 'flex', gap: 16, minHeight: 500 }}>
      {/* Left: Account list */}
      <div style={{ width: 240, flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>账号</span>
          <button className="btn-secondary" onClick={() => { setShowNewAccount(true); setEditingAccount(null); setAccountForm({ name: '', username: '', password: '' }); setFormError('') }}
            style={{ padding: '4px 8px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}>
            <Plus size={12} /> 添加
          </button>
        </div>

        {/* New account form */}
        {(showNewAccount || editingAccount) && (
          <div className="card" style={{ marginBottom: 10, padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>{editingAccount ? '编辑账号' : '新增账号'}</div>
            <input placeholder="账号名称" value={accountForm.name} onChange={e => setAccountForm({ ...accountForm, name: e.target.value })} style={{ width: '100%', marginBottom: 6, fontSize: 12 }} />
            <input placeholder="工号/用户名" value={accountForm.username} onChange={e => setAccountForm({ ...accountForm, username: e.target.value })} style={{ width: '100%', marginBottom: 6, fontSize: 12 }} />
            <input type="password" placeholder="密码" value={accountForm.password} onChange={e => setAccountForm({ ...accountForm, password: e.target.value })} style={{ width: '100%', marginBottom: 6, fontSize: 12 }} />
            {formError && <div style={{ fontSize: 11, color: 'var(--danger)', marginBottom: 6 }}>{formError}</div>}
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn-primary" onClick={handleSaveAccount} style={{ padding: '4px 10px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}><Check size={12} /> 保存</button>
              <button className="btn-secondary" onClick={() => { setShowNewAccount(false); setEditingAccount(null); setFormError('') }} style={{ padding: '4px 10px', fontSize: 11 }}><X size={12} /></button>
            </div>
          </div>
        )}

        {/* Account list */}
        {accounts.map(a => (
          <div key={a.id}
            onClick={() => setSelectedAccountId(a.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
              borderRadius: 8, cursor: 'pointer', marginBottom: 4,
              background: selectedAccountId === a.id ? 'var(--accent)' : 'var(--bg-card)',
              border: selectedAccountId === a.id ? '1px solid var(--accent)' : '1px solid var(--border)',
              transition: 'all 0.15s'
            }}
          >
            <User size={14} style={{ color: selectedAccountId === a.id ? 'white' : 'var(--text-secondary)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: selectedAccountId === a.id ? 'white' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
              <div style={{ fontSize: 11, color: selectedAccountId === a.id ? 'rgba(255,255,255,0.7)' : 'var(--text-secondary)' }}>{a.username}</div>
            </div>
            <span style={{
              fontSize: 10, padding: '1px 6px', borderRadius: 9999,
              background: selectedAccountId === a.id ? 'rgba(255,255,255,0.2)' : 'var(--accent)',
              color: 'white'
            }}>{platforms.filter(p => p.accountId === a.id).length}</span>
          </div>
        ))}

        {accounts.length === 0 && !showNewAccount && (
          <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-secondary)', fontSize: 12 }}>
            暂无账号，点击上方添加
          </div>
        )}
      </div>

      {/* Right: Platform details */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {selectedAccount ? (
          <div>
            {/* Account header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <span style={{ fontSize: 16, fontWeight: 700 }}>{selectedAccount.name}</span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>{selectedAccount.username}</span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn-secondary" onClick={() => startEditAccount(selectedAccount)} style={{ padding: '4px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}><Edit2 size={13} /> 编辑</button>
                <button className="btn-danger" onClick={() => handleDeleteAccount(selectedAccount.id)} style={{ padding: '4px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}><Trash2 size={13} /> 删除</button>
              </div>
            </div>

            {/* Platform section */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>平台配置</span>
              <button className="btn-primary" onClick={() => { setShowNewPlatform(true); setEditingPlatform(null); setPlatformForm({ ...platformForm, accountId: selectedAccount.id }); setFormError('') }}
                style={{ padding: '4px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Plus size={14} /> 添加平台
              </button>
            </div>

            {/* Platform form */}
            {(showNewPlatform || editingPlatform) && (
              <div className="card" style={{ marginBottom: 12, padding: 16 }}>
                <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{editingPlatform ? '编辑平台' : '新增平台'}</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>平台名称 *</label>
                    <input placeholder="如：OA、北森EHR" value={platformForm.name} onChange={e => setPlatformForm({ ...platformForm, name: e.target.value })} style={{ width: '100%' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>平台类型</label>
                    <select value={platformForm.platformType} onChange={e => setPlatformForm({ ...platformForm, platformType: e.target.value })} style={{ width: '100%' }}>
                      <option value="landray">蓝凌 OA</option>
                      <option value="beisen">北森</option>
                      <option value="other">其他</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>视图类型</label>
                    <select value={platformForm.workflowView} onChange={e => setPlatformForm({ ...platformForm, workflowView: e.target.value })} style={{ width: '100%' }}>
                      <option value="待办">待办</option>
                      <option value="我发起的">我发起的</option>
                      <option value="我已审的">我已审的</option>
                    </select>
                  </div>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>SSO 登录地址 *</label>
                  <input placeholder="https://sso.example.com/login" value={platformForm.ssoUrl} onChange={e => setPlatformForm({ ...platformForm, ssoUrl: e.target.value })} style={{ width: '100%' }} />
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>流程列表地址 *</label>
                  <input placeholder="https://oa.example.com/workflow/list" value={platformForm.workflowUrl} onChange={e => setPlatformForm({ ...platformForm, workflowUrl: e.target.value })} style={{ width: '100%' }} />
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>URL 模板 *（用 {'{fdId}'} 作为流程 ID 占位符）</label>
                  <input placeholder="https://oa.example.com/workflow/view?id={fdId}" value={platformForm.urlPattern} onChange={e => setPlatformForm({ ...platformForm, urlPattern: e.target.value })} style={{ width: '100%' }} />
                </div>
                {formError && <div style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 10 }}>{formError}</div>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn-primary" onClick={handleSavePlatform} style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Check size={14} /> 保存</button>
                  <button className="btn-secondary" onClick={resetPlatformForm} style={{ display: 'flex', alignItems: 'center', gap: 4 }}><X size={14} /> 取消</button>
                </div>
              </div>
            )}

            {/* Platform list */}
            {selectedPlatforms.length === 0 && !showNewPlatform ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)', fontSize: 13 }}>
                <Globe size={32} style={{ marginBottom: 8, opacity: 0.3 }} />
                <p>暂无平台配置</p>
                <p style={{ fontSize: 11, marginTop: 4 }}>点击「添加平台」配置 OA 系统</p>
              </div>
            ) : (
              selectedPlatforms.map(p => (
                <div key={p.id} className="card" style={{ marginBottom: 8, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</span>
                      <span className="badge badge-info">{p.workflowView}</span>
                      <span className="badge" style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--warning)' }}>
                        {p.platformType === 'beisen' ? '北森' : p.platformType === 'landray' ? 'OA' : '其他'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn-secondary" onClick={() => window.api.runPlatformExtraction(p.id)} style={{ padding: '4px 10px', fontSize: 11 }}>提取</button>
                      <button className="btn-secondary" onClick={() => startEditPlatform(p)} style={{ padding: 4 }}><Edit2 size={13} /></button>
                      <button className="btn-danger" onClick={() => handleDeletePlatform(p.id)} style={{ padding: 4 }}><Trash2 size={13} /></button>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                    <div style={{ display: 'flex', gap: 4 }}><span style={{ flexShrink: 0, width: 60 }}>SSO：</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.ssoUrl}</span></div>
                    <div style={{ display: 'flex', gap: 4 }}><span style={{ flexShrink: 0, width: 60 }}>列表：</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.workflowUrl}</span></div>
                    <div style={{ display: 'flex', gap: 4 }}><span style={{ flexShrink: 0, width: 60 }}>模板：</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.urlPattern}</span></div>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--text-secondary)', fontSize: 13 }}>
            <div style={{ textAlign: 'center' }}>
              <User size={40} style={{ marginBottom: 12, opacity: 0.3 }} />
              <p>选择左侧账号查看平台配置</p>
              <p style={{ fontSize: 11, marginTop: 4 }}>或点击「添加账号」开始配置</p>
            </div>
          </div>
        )}
      </div>
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
  const [formError, setFormError] = useState('')

  const handleSave = async () => {
    if (!form.name || !form.baseUrl || !form.apiKey || !form.modelName) {
      setFormError('请填写所有字段')
      return
    }
    setFormError('')
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
        <button className="btn-primary" onClick={() => { setShowForm(true); setEditing(null); setForm({ name: '', baseUrl: '', apiKey: '', modelName: '', isDefault: configs.length === 0 }); setFormError('') }}
          style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Plus size={14} /> 添加模型
        </button>
      </div>

      {(showForm || editing) && (
        <div className="card" style={{ marginBottom: 12 }}>
          <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{editing ? '编辑模型' : '新增模型'}</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>显示名称</label>
              <input placeholder="如：DeepSeek V3" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>模型名称</label>
              <input placeholder="如：deepseek-chat" value={form.modelName} onChange={e => setForm({ ...form, modelName: e.target.value })} style={{ width: '100%' }} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>API Base URL</label>
              <input placeholder="https://api.example.com/v1" value={form.baseUrl} onChange={e => setForm({ ...form, baseUrl: e.target.value })} style={{ width: '100%' }} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>API Key</label>
              <input type="password" placeholder="sk-..." value={form.apiKey} onChange={e => setForm({ ...form, apiKey: e.target.value })} style={{ width: '100%' }} />
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.isDefault} onChange={e => setForm({ ...form, isDefault: e.target.checked })} />
            设为默认模型
          </label>
          {formError && <div style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 10 }}>{formError}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" onClick={handleSave} style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Check size={14} /> 保存</button>
            <button className="btn-secondary" onClick={handleTest} disabled={testing} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <TestTube size={14} /> {testing ? '测试中...' : '测试连接'}
            </button>
            <button className="btn-secondary" onClick={() => { setShowForm(false); setEditing(null); setFormError('') }} style={{ display: 'flex', alignItems: 'center', gap: 4 }}><X size={14} /> 取消</button>
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
            <button className="btn-secondary" onClick={() => { setEditing(c.id); setForm({ name: c.name, baseUrl: c.baseUrl, apiKey: c.apiKey, modelName: c.modelName, isDefault: c.isDefault }); setShowForm(false); setFormError('') }}
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
