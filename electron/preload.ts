import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  // Accounts
  listAccounts: () => ipcRenderer.invoke('accounts:list'),
  createAccount: (name: string, username: string, password: string) => ipcRenderer.invoke('accounts:create', name, username, password),
  updateAccount: (id: string, name: string, username: string, password: string) => ipcRenderer.invoke('accounts:update', id, name, username, password),
  deleteAccount: (id: string) => ipcRenderer.invoke('accounts:delete', id),

  // Platforms
  listPlatforms: (accountId?: string) => ipcRenderer.invoke('platforms:list', accountId),
  createPlatform: (p: any) => ipcRenderer.invoke('platforms:create', p),
  updatePlatform: (id: string, p: any) => ipcRenderer.invoke('platforms:update', id, p),
  deletePlatform: (id: string) => ipcRenderer.invoke('platforms:delete', id),

  // LLM
  listLLMConfigs: () => ipcRenderer.invoke('llm:list'),
  createLLMConfig: (c: any) => ipcRenderer.invoke('llm:create', c),
  updateLLMConfig: (id: string, c: any) => ipcRenderer.invoke('llm:update', id, c),
  deleteLLMConfig: (id: string) => ipcRenderer.invoke('llm:delete', id),
  testLLM: (config: any) => ipcRenderer.invoke('llm:test', config),

  // Workflows
  listWorkflows: () => ipcRenderer.invoke('workflows:list'),

  // Extraction
  runExtraction: () => ipcRenderer.invoke('extraction:run'),
  runPlatformExtraction: (platformId: string) => ipcRenderer.invoke('extraction:runPlatform', platformId),

  // Approval
  approveWorkflow: (workflowId: string, action: 'approve' | 'reject', comment?: string) =>
    ipcRenderer.invoke('workflow:approve', workflowId, action, comment),

  // LLM Analysis
  runLLMAnalysis: () => ipcRenderer.invoke('llm:analyze'),
  runLLMReanalyze: () => ipcRenderer.invoke('llm:reanalyze'),

  // Logs
  listLogs: (limit?: number) => ipcRenderer.invoke('logs:list', limit),
  clearLogs: () => ipcRenderer.invoke('logs:clear'),
  // Schedule
  getSchedule: () => ipcRenderer.invoke('schedule:get'),
  setSchedule: (config: any) => ipcRenderer.invoke('schedule:set', config),

  // Open URL
  openUrl: (url: string) => ipcRenderer.invoke('open:url', url),
  openUrlWithAuth: (platformId: string, workflowUrl: string) => ipcRenderer.invoke('open:urlWithAuth', platformId, workflowUrl),

  // Events
  onWorkflowsUpdated: (cb: () => void) => {
    ipcRenderer.on('workflows-updated', cb)
    return () => { ipcRenderer.removeListener('workflows-updated', cb) }
  },
  onExtractionComplete: (cb: () => void) => {
    ipcRenderer.on('extraction-complete', cb)
    return () => { ipcRenderer.removeListener('extraction-complete', cb) }
  },
  onExtractionProgress: (cb: (data: { current: number; total: number; account: string; platform: string }) => void) => {
    const handler = (_: any, data: any) => cb(data)
    ipcRenderer.on('extraction-progress', handler)
    return () => { ipcRenderer.removeListener('extraction-progress', handler) }
  }
})
