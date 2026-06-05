import fs from 'fs'
import path from 'path'
import { app, safeStorage } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import type { Account, Platform, LLMConfig, Workflow, ExecutionLog, ScheduleConfig } from '../types'

// ---- Encryption helpers ----
const ENC_PREFIX = 'enc:'

function encrypt(plain: string): string {
  if (!plain) return plain
  if (plain.startsWith(ENC_PREFIX)) return plain // already encrypted
  if (!safeStorage.isEncryptionAvailable()) return plain
  const buf = safeStorage.encryptString(plain)
  return ENC_PREFIX + buf.toString('base64')
}

function decrypt(value: string): string {
  if (!value || !value.startsWith(ENC_PREFIX)) return value
  if (!safeStorage.isEncryptionAvailable()) return value.slice(ENC_PREFIX.length)
  try {
    const buf = Buffer.from(value.slice(ENC_PREFIX.length), 'base64')
    return safeStorage.decryptString(buf)
  } catch {
    return value.slice(ENC_PREFIX.length) // fallback: return raw
  }
}

function isEncrypted(value: string): boolean {
  return value?.startsWith(ENC_PREFIX) ?? false
}

interface DBData {
  accounts: Account[]
  platforms: Platform[]
  llmConfigs: LLMConfig[]
  workflows: Workflow[]
  executionLogs: ExecutionLog[]
  settings: Record<string, string>
}

let dbPath = ''
let data: DBData = { accounts: [], platforms: [], llmConfigs: [], workflows: [], executionLogs: [], settings: {} }

function save() {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf-8')
}

export function initDB() {
  const dir = app.getPath('userData')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  dbPath = path.join(dir, 'workflow-ai.json')
  if (fs.existsSync(dbPath)) {
    try { data = JSON.parse(fs.readFileSync(dbPath, 'utf-8')) } catch { save() }
  } else {
    save()
  }
  migrateEncrypt()
  cleanupOrphanedWorkflows()
}

/** Encrypt any plaintext passwords/API keys left from before encryption was added */
function migrateEncrypt() {
  let changed = false
  for (const a of data.accounts) {
    if (a.password && !isEncrypted(a.password)) {
      a.password = encrypt(a.password)
      changed = true
    }
  }
  for (const c of data.llmConfigs) {
    if (c.apiKey && !isEncrypted(c.apiKey)) {
      c.apiKey = encrypt(c.apiKey)
      changed = true
    }
  }
  if (changed) save()
}

/** Remove workflows with empty platformId (leftover from bug) */
function cleanupOrphanedWorkflows() {
  const before = data.workflows.length
  data.workflows = data.workflows.filter(w => w.platformId)
  if (data.workflows.length !== before) save()
}

// ---- Accounts ----
export function getAccounts(): Account[] {
  return data.accounts.map(a => ({ ...a, password: decrypt(a.password) }))
}
export function getAccountById(id: string): Account | undefined {
  const a = data.accounts.find(x => x.id === id)
  return a ? { ...a, password: decrypt(a.password) } : undefined
}
export function createAccount(name: string, username: string, password: string): Account {
  const a: Account = { id: uuidv4(), name, username, password: encrypt(password), createdAt: new Date().toISOString() }
  data.accounts.push(a); save(); return { ...a, password } // return plaintext to caller
}
export function updateAccount(id: string, name: string, username: string, password: string) {
  const a = data.accounts.find(x => x.id === id)
  if (a) { a.name = name; a.username = username; a.password = encrypt(password); save() }
}
export function deleteAccount(id: string) {
  const platformIds = data.platforms.filter(p => p.accountId === id).map(p => p.id)
  data.accounts = data.accounts.filter(x => x.id !== id)
  data.platforms = data.platforms.filter(x => x.accountId !== id)
  // Cascade: remove workflows belonging to deleted platforms
  data.workflows = data.workflows.filter(w => !platformIds.includes(w.platformId))
  save()
}

// ---- Platforms ----
export function getPlatforms(accountId?: string): Platform[] {
  return accountId ? data.platforms.filter(p => p.accountId === accountId) : data.platforms
}
export function createPlatform(p: Omit<Platform, 'id'>): Platform {
  const np: Platform = { ...p, id: uuidv4() }; data.platforms.push(np); save(); return np
}
export function updatePlatform(id: string, p: Partial<Platform>) {
  const existing = data.platforms.find(x => x.id === id)
  if (existing) { Object.assign(existing, p); save() }
}
export function deletePlatform(id: string) {
  data.platforms = data.platforms.filter(x => x.id !== id)
  data.workflows = data.workflows.filter(w => w.platformId !== id)
  save()
}

// ---- LLM Configs ----
export function getLLMConfigs(): LLMConfig[] {
  return data.llmConfigs.map(c => ({ ...c, apiKey: decrypt(c.apiKey) }))
}
export function createLLMConfig(c: Omit<LLMConfig, 'id'>): LLMConfig {
  if (c.isDefault) data.llmConfigs.forEach(x => x.isDefault = false)
  const nc: LLMConfig = { ...c, id: uuidv4(), apiKey: encrypt(c.apiKey) }; data.llmConfigs.push(nc); save()
  return { ...nc, apiKey: c.apiKey } // return plaintext to caller
}
export function updateLLMConfig(id: string, c: Partial<LLMConfig>) {
  if (c.isDefault) data.llmConfigs.forEach(x => x.isDefault = false)
  const existing = data.llmConfigs.find(x => x.id === id)
  if (existing) {
    if (c.apiKey !== undefined) c.apiKey = encrypt(c.apiKey)
    Object.assign(existing, c); save()
  }
}
export function deleteLLMConfig(id: string) {
  data.llmConfigs = data.llmConfigs.filter(x => x.id !== id); save()
}

// ---- Workflows ----
export function getWorkflows(): Workflow[] {
  return data.workflows.map(w => {
    const p = data.platforms.find(x => x.id === w.platformId)
    const a = p ? data.accounts.find(x => x.id === p.accountId) : null
    return { ...w, accountName: a?.name || '', platformName: p?.name || '' }
  })
}
export function upsertWorkflow(w: Omit<Workflow, 'id' | 'extractedAt'>) {
  const idx = data.workflows.findIndex(x => x.platformId === w.platformId && x.fdId === w.fdId)
  const now = new Date().toISOString()
  if (idx >= 0) {
    data.workflows[idx] = { ...data.workflows[idx], ...w, extractedAt: now }
  } else {
    data.workflows.push({ ...w, id: uuidv4(), extractedAt: now, llmSummary: '' })
  }
  save()
}
export function clearWorkflowsForPlatform(platformId: string) {
  data.workflows = data.workflows.filter(w => w.platformId !== platformId); save()
}

/**
 * Incremental sync: compare extracted workflows with local, return diff stats
 * - upserts new/changed workflows
 * - removes workflows no longer in the extracted list
 */
export function syncWorkflowsForPlatform(
  platformId: string,
  extracted: Omit<Workflow, 'id' | 'extractedAt' | 'llmSummary'>[]
): { added: number; updated: number; removed: number } {
  const existing = data.workflows.filter(w => w.platformId === platformId)
  const existingMap = new Map(existing.map(w => [w.fdId, w]))
  const extractedFdIds = new Set(extracted.map(w => w.fdId))

  let added = 0, updated = 0

  // Upsert extracted workflows
  for (const w of extracted) {
    const now = new Date().toISOString()
    const old = existingMap.get(w.fdId)
    if (old) {
      // Update if any field changed
      const changed = old.title !== w.title || old.status !== w.status ||
                      old.currentStep !== w.currentStep || old.currentHandler !== w.currentHandler
      if (changed) {
        Object.assign(old, w, { extractedAt: now })
        updated++
      } else {
        old.extractedAt = now // still update timestamp
      }
    } else {
      data.workflows.push({ ...w, id: uuidv4(), extractedAt: now, llmSummary: '' })
      added++
    }
  }

  // Remove workflows no longer in extracted list (skip empty fdId)
  const before = data.workflows.length
  data.workflows = data.workflows.filter(w => {
    if (w.platformId !== platformId) return true
    if (!w.fdId) return false // remove entries with empty fdId
    return extractedFdIds.has(w.fdId)
  })
  const removedCount = before - data.workflows.length

  const emptyFdIdCount = extracted.filter(w => !w.fdId).length
  console.log(`[sync] platform=${platformId.substring(0,8)} existing=${existing.length} extracted=${extracted.length} noFdId=${emptyFdIdCount} added=${added} updated=${updated} removed=${removedCount} total=${data.workflows.length}`)

  save()
  return { added, updated, removed: removedCount }
}

/** Remove workflows whose platformId doesn't exist in the valid set */
export function removeOrphanedWorkflows(validPlatformIds: Set<string>): number {
  const before = data.workflows.length
  data.workflows = data.workflows.filter(w => validPlatformIds.has(w.platformId))
  const removed = before - data.workflows.length
  if (removed > 0) save()
  return removed
}
export function updateWorkflowSummary(id: string, summary: string) {
  const w = data.workflows.find(x => x.id === id)
  if (w) { w.llmSummary = summary; save() }
}

// ---- Execution Logs ----
export function getLogs(limit = 100): ExecutionLog[] {
  return data.executionLogs.slice(-limit).reverse()
}
export function addLog(platformId: string | null, action: string, status: string, message: string) {
  data.executionLogs.push({ id: uuidv4(), platformId: platformId || '', action, status, message, createdAt: new Date().toISOString() })
  if (data.executionLogs.length > 500) data.executionLogs = data.executionLogs.slice(-500)
  save()
}

// ---- Settings ----
export function getSetting(key: string): string | null { return data.settings[key] || null }
export function setSetting(key: string, value: string) { data.settings[key] = value; save() }
export function getScheduleConfig(): ScheduleConfig {
  const raw = getSetting('schedule')
  return raw ? JSON.parse(raw) : { enabled: false, intervalMinutes: 30 }
}
export function setScheduleConfig(config: ScheduleConfig) { setSetting('schedule', JSON.stringify(config)) }
