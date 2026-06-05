import { create } from 'zustand'
import type { Account, Platform, LLMConfig, Workflow, ExecutionLog, ScheduleConfig, ApprovalResult } from '../../types'

declare global {
  interface Window {
    api: {
      listAccounts: () => Promise<Account[]>
      createAccount: (name: string, username: string, password: string) => Promise<Account>
      updateAccount: (id: string, name: string, username: string, password: string) => Promise<void>
      deleteAccount: (id: string) => Promise<void>
      listPlatforms: (accountId?: string) => Promise<Platform[]>
      createPlatform: (p: Omit<Platform, 'id'>) => Promise<Platform>
      updatePlatform: (id: string, p: Partial<Platform>) => Promise<void>
      deletePlatform: (id: string) => Promise<void>
      listLLMConfigs: () => Promise<LLMConfig[]>
      createLLMConfig: (c: Omit<LLMConfig, 'id'>) => Promise<LLMConfig>
      updateLLMConfig: (id: string, c: Partial<LLMConfig>) => Promise<void>
      deleteLLMConfig: (id: string) => Promise<void>
      testLLM: (config: LLMConfig) => Promise<{ success: boolean; message: string }>
      listWorkflows: () => Promise<Workflow[]>
      runExtraction: () => Promise<{ success: number; failed: number; total: number }>
      runPlatformExtraction: (platformId: string) => Promise<any>
      approveWorkflow: (workflowId: string, action: 'approve' | 'reject', comment?: string) => Promise<ApprovalResult>
      runLLMAnalysis: () => Promise<{ success: boolean; analyzed?: number; error?: string }>
      runLLMReanalyze: () => Promise<{ success: boolean; analyzed?: number; error?: string }>
      listLogs: (limit?: number) => Promise<ExecutionLog[]>
      getSchedule: () => Promise<ScheduleConfig>
      setSchedule: (config: ScheduleConfig) => Promise<ScheduleConfig>
      openUrl: (url: string) => Promise<void>
      openUrlWithAuth: (platformId: string, workflowUrl: string) => Promise<{ success: boolean; error?: string }>
      onWorkflowsUpdated: (cb: () => void) => () => void
      onExtractionComplete: (cb: () => void) => () => void
      onExtractionProgress: (cb: (data: { current: number; total: number; account: string; platform: string }) => void) => () => void
    }
  }
}

interface AppState {
  accounts: Account[]
  platforms: Platform[]
  llmConfigs: LLMConfig[]
  workflows: Workflow[]
  logs: ExecutionLog[]
  schedule: ScheduleConfig
  loading: boolean
  extracting: boolean
  currentPage: 'dashboard' | 'settings' | 'logs'

  setPage: (page: 'dashboard' | 'settings' | 'logs') => void
  loadAll: () => Promise<void>
  loadWorkflows: () => Promise<void>
  loadLogs: () => Promise<void>
  setExtracting: (v: boolean) => void
}

export const useStore = create<AppState>((set, get) => ({
  accounts: [],
  platforms: [],
  llmConfigs: [],
  workflows: [],
  logs: [],
  schedule: { enabled: false, intervalMinutes: 30 },
  loading: false,
  extracting: false,
  currentPage: 'dashboard',

  setPage: (page) => set({ currentPage: page }),

  loadAll: async () => {
    set({ loading: true })
    try {
      const [accounts, platforms, llmConfigs, workflows, logs, schedule] = await Promise.all([
        window.api.listAccounts(),
        window.api.listPlatforms(),
        window.api.listLLMConfigs(),
        window.api.listWorkflows(),
        window.api.listLogs(50),
        window.api.getSchedule()
      ])
      set({ accounts, platforms, llmConfigs, workflows, logs, schedule, loading: false })
    } catch (err) {
      console.error('loadAll error:', err)
      set({ loading: false })
    }
  },

  loadWorkflows: async () => {
    const workflows = await window.api.listWorkflows()
    set({ workflows })
  },

  loadLogs: async () => {
    const logs = await window.api.listLogs(50)
    set({ logs })
  },

  setExtracting: (v) => set({ extracting: v })
}))
