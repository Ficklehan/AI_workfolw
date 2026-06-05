export interface Account {
  id: string
  name: string
  username: string
  password: string
  createdAt: string
}

export interface Platform {
  id: string
  accountId: string
  name: string
  platformType: string
  ssoUrl: string
  workflowUrl: string
  workflowView: string
  urlPattern: string
}

export interface LLMConfig {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  modelName: string
  isDefault: boolean
}

export interface Workflow {
  id: string
  platformId: string
  fdId: string
  title: string
  docNumber: string
  createDate: string
  endDate: string
  status: string
  currentStep: string
  currentHandler: string
  url: string
  llmSummary: string
  extractedAt: string
  accountName?: string
  platformName?: string
}

export interface ExecutionLog {
  id: string
  platformId: string
  action: string
  status: string
  message: string
  createdAt: string
}

export interface ScheduleConfig {
  enabled: boolean
  intervalMinutes: number
}

export interface ApprovalResult {
  success: boolean
  message: string
}
