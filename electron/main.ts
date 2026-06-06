import { app, BrowserWindow, ipcMain, shell, session } from 'electron'
import path from 'path'

// Prevent EPIPE crash when stdout pipe is broken
process.stdout.on('error', (err: any) => { if (err.code !== 'EPIPE') console.error(err) })
process.stderr.on('error', (err: any) => { if (err.code !== 'EPIPE') console.error(err) })
import * as db from './db'
import { extractWorkflows } from './services/extractor'
import { batchSummarize } from './services/llm'
import * as scheduler from './services/scheduler'
import type { Account, Platform, LLMConfig, ScheduleConfig } from '../types'

let mainWindow: BrowserWindow | null = null

const isDev = process.env.NODE_ENV === 'development'

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'WorkflowAI',
    titleBarStyle: 'hiddenInset',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    transparent: true,
    backgroundColor: '#00000000',
    trafficLightPosition: { x: 16, y: 16 },
    icon: path.join(__dirname, '../../icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))
  }
}

// Strip quarantine from native .node modules on first launch
// (macOS applies com.apple.quarantine to downloaded apps, which prevents
//  native modules from loading)
if (process.platform === 'darwin') {
  const { execSync } = require('child_process')
  try {
    execSync('xattr -dr com.apple.quarantine "' + app.getPath('exe').replace('/MacOS/WorkflowAI', '') + '" 2>/dev/null || true', { timeout: 3000 })
  } catch { /* ignore - app may already be unquarantined */ }
}

app.whenReady().then(async () => {
  db.initDB()
  createWindow()

  // CSP: only set in production, dev mode needs no restrictions
  if (!isDev) {
    mainWindow?.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https:"]
        }
      })
    })
  }

  registerIPC()

  // Start scheduler
  scheduler.startScheduler(async () => {
    await runAllExtractions()
    mainWindow?.webContents.send('extraction-complete')
  })

  // Auto-extract on startup
  mainWindow?.webContents.on('did-finish-load', () => {
    const accounts = db.getAccounts()
    if (accounts.length > 0) {
      runAllExtractions().catch(() => {})
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  scheduler.stop()
  if (process.platform !== 'darwin') app.quit()
})

function registerIPC() {
  // ---- Accounts ----
  ipcMain.handle('accounts:list', () => db.getAccounts())
  ipcMain.handle('accounts:create', (_, name, username, password) => db.createAccount(name, username, password))
  ipcMain.handle('accounts:update', (_, id, name, username, password) => db.updateAccount(id, name, username, password))
  ipcMain.handle('accounts:delete', (_, id) => db.deleteAccount(id))

  // ---- Platforms ----
  ipcMain.handle('platforms:list', (_, accountId?) => db.getPlatforms(accountId))
  ipcMain.handle('platforms:create', (_, p) => db.createPlatform(p))
  ipcMain.handle('platforms:update', (_, id, p) => db.updatePlatform(id, p))
  ipcMain.handle('platforms:delete', (_, id) => db.deletePlatform(id))

  // ---- LLM ----
  ipcMain.handle('llm:list', () => db.getLLMConfigs())
  ipcMain.handle('llm:create', (_, c) => db.createLLMConfig(c))
  ipcMain.handle('llm:update', (_, id, c) => db.updateLLMConfig(id, c))
  ipcMain.handle('llm:delete', (_, id) => db.deleteLLMConfig(id))
  ipcMain.handle('llm:test', async (_, config: LLMConfig) => {
    try {
      const result = await import('./services/llm').then(m => m.chatCompletion(config, [
        { role: 'user', content: '你好，请回复"连接成功"' }
      ]))
      return { success: true, message: result }
    } catch (err: any) {
      return { success: false, message: err.message }
    }
  })

  // ---- Workflows ----
  ipcMain.handle('workflows:list', () => db.getWorkflows())

  // ---- Extraction ----
  ipcMain.handle('extraction:run', async () => {
    return await runAllExtractions()
  })
  ipcMain.handle('extraction:runPlatform', async (_, platformId: string) => {
    return await runPlatformExtraction(platformId)
  })

  // ---- LLM Analysis ----
  ipcMain.handle('llm:analyze', async () => {
    return await runLLMAnalysis()
  })
  ipcMain.handle('llm:reanalyze', async () => {
    return await runLLMAnalysis(true)
  })

  // ---- Logs ----
  ipcMain.handle('logs:list', (_, limit?) => db.getLogs(limit))
  ipcMain.handle('logs:clear', () => { db.clearLogs(); return { success: true } })
  ipcMain.handle('workflows:remove', (_, platformId: string, workflowKey: string) => {
    const removed = db.removeWorkflow(platformId, workflowKey)
    if (removed) mainWindow?.webContents.send('workflows-updated')
    return { removed }
  })
  // ---- Schedule ----
  ipcMain.handle('schedule:get', () => db.getScheduleConfig())
  ipcMain.handle('schedule:set', (_, config: ScheduleConfig) => {
    db.setScheduleConfig(config)
    scheduler.restart()
    return config
  })

  // ---- Open URL ----
  ipcMain.handle('open:url', (_, url: string) => {
    // Validate URL protocol to prevent file:// or javascript: injection
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        shell.openExternal(url)
      }
    } catch { /* invalid URL, ignore */ }
  })

  // ---- Open workflow URL with account authentication (embedded BrowserWindow) ----
  ipcMain.handle('open:urlWithAuth', async (_, platformId: string, workflowUrl: string) => {
    console.log('[open:urlWithAuth] START', { platformId, workflowUrl })

    // Step 1: validate inputs
    if (!workflowUrl) {
      console.error('[open:urlWithAuth] ERROR: workflowUrl is empty')
      return { success: false, error: '流程链接为空' }
    }

    const platform = db.getPlatforms().find(p => p.id === platformId)
    if (!platform) {
      console.error('[open:urlWithAuth] ERROR: platform not found for id:', platformId)
      return { success: false, error: '平台不存在' }
    }
    console.log('[open:urlWithAuth] platform:', platform.name, platform.ssoUrl)

    const account = db.getAccountById(platform.accountId)
    if (!account) {
      console.error('[open:urlWithAuth] ERROR: account not found for id:', platform.accountId)
      return { success: false, error: '账号不存在' }
    }
    console.log('[open:urlWithAuth] account:', account.name, account.username)

    // Validate URL before opening
    try {
      new URL(workflowUrl)
    } catch {
      console.error('[open:urlWithAuth] invalid URL:', workflowUrl)
      return { success: false, error: 'URL 格式无效' }
    }

    // Step 2: create window
    try {
      const ses = session.fromPartition(`persist:account-${account.id}`)
      console.log('[open:urlWithAuth] session created')

      const win = new BrowserWindow({
        width: 1280,
        height: 800,
        title: `${account.name} - 流程详情`,
        icon: path.join(__dirname, '../../icon.png'),
        webPreferences: {
          session: ses,
          contextIsolation: true,
          nodeIntegration: false
        }
      })
      console.log('[open:urlWithAuth] window created')

      // Load workflow URL directly
      console.log('[open:urlWithAuth] loading:', workflowUrl.substring(0, 100))
      win.loadURL(workflowUrl)

      // Log load failures
      win.webContents.on('did-fail-load', (_, code, desc) => {
        console.error('[open:urlWithAuth] did-fail-load:', code, desc)
      })

      // After page loads, check if redirected to login and auto-fill credentials
      win.webContents.once('did-finish-load', () => {
        const waitMs = 800
        setTimeout(() => {
          const currentUrl = win.webContents.getURL()
          console.log('[open:urlWithAuth] page loaded:', currentUrl)

          // Check if on login page
          const needsLogin = currentUrl.includes('/login') || currentUrl.includes('/Login') ||
                             currentUrl.includes('/cas/') || currentUrl.includes('/sso') ||
                             currentUrl.includes('authenticate') || currentUrl.includes('/passport/') ||
                             currentUrl.includes('/auth/') || currentUrl.includes('italent.cn/Login')

          if (!needsLogin) {
            console.log('[open:urlWithAuth] already authenticated, no login needed')
            return
          }

          console.log('[open:urlWithAuth] login page detected, injecting credentials...')

          // Different login scripts based on platform type
          let fillScript = ''

          if (platform.platformType === 'beisen') {
            // ---- 北森登录（不动） ----
            fillScript = `
              (async () => {
                const delay = ms => new Promise(r => setTimeout(r, ms))

                // Step 1: Switch to password mode
                const switchEls = document.querySelectorAll('*')
                for (let i = 0; i < switchEls.length; i++) {
                  const el = switchEls[i]
                  if ((el.textContent || '').trim() === '切换到密码验证' && el.offsetParent !== null) {
                    el.click()
                    await delay(2000)
                    break
                  }
                }

                // Step 2: Find inputs
                const uSels = [
                  'input[placeholder*="工号"]', 'input[placeholder*="用户名"]',
                  'input[placeholder*="username" i]', 'input[placeholder*="账号" i]',
                  'input[name="username"]', 'input[name="j_username"]',
                  'input[name="account"]', 'input[name="loginName"]',
                  'input[type="text"]', 'input[type="tel"]'
                ]
                let u = null
                for (const s of uSels) { const el = document.querySelector(s); if (el && el.offsetParent !== null) { u = el; break } }

                const pSels = [
                  'input[placeholder*="密码"]', 'input[placeholder*="password" i]',
                  'input[name="password"]', 'input[name="j_password"]',
                  'input[type="password"]'
                ]
                let p = null
                for (const s of pSels) { const el = document.querySelector(s); if (el && el.offsetParent !== null) { p = el; break } }

                if (!u || !p) return 'no-form-found'

                // Step 3: Fill using nativeInputValueSetter
                const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
                function setReactValue(el, val) {
                  el.focus()
                  nativeSetter.call(el, val)
                  el.dispatchEvent(new Event('input', { bubbles: true }))
                  el.dispatchEvent(new Event('change', { bubbles: true }))
                  el.dispatchEvent(new Event('blur', { bubbles: true }))
                }

                setReactValue(u, ${JSON.stringify(account.username)})
                await delay(300)
                setReactValue(p, ${JSON.stringify(account.password)})
                await delay(300)

                // Step 4: Check checkbox
                const cb = document.querySelector('input[type="checkbox"]')
                if (cb && !cb.checked) {
                  const nativeClick = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'checked').set
                  nativeClick.call(cb, true)
                  cb.dispatchEvent(new Event('change', { bubbles: true }))
                  cb.dispatchEvent(new Event('click', { bubbles: true }))
                }
                await delay(300)

                // Step 5: Press Enter
                p.focus()
                p.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }))
                p.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }))
                p.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }))

                return 'beisen-login-submitted'
              })()
            `
          } else {
            // ---- OA / 其他：标准登录 ----
            fillScript = `
              (async () => {
                const uSels = [
                  'input[placeholder*="工号"]', 'input[placeholder*="用户名"]',
                  'input[name="username"]', 'input[name="j_username"]',
                  'input[type="text"]'
                ]
                let u = null
                for (const s of uSels) { const el = document.querySelector(s); if (el && el.offsetParent !== null) { u = el; break } }

                const pSels = [
                  'input[placeholder*="密码"]', 'input[name="password"]',
                  'input[name="j_password"]', 'input[type="password"]'
                ]
                let p = null
                for (const s of pSels) { const el = document.querySelector(s); if (el && el.offsetParent !== null) { p = el; break } }

                if (!u || !p) return 'no-form-found'

                u.focus(); u.value = ${JSON.stringify(account.username)}
                u.dispatchEvent(new Event('input', { bubbles: true }))
                u.dispatchEvent(new Event('change', { bubbles: true }))
                p.focus(); p.value = ${JSON.stringify(account.password)}
                p.dispatchEvent(new Event('input', { bubbles: true }))
                p.dispatchEvent(new Event('change', { bubbles: true }))

                const btnSels = ['input[type="submit"]', 'button[type="submit"]', '.login-btn', '#loginBtn', 'button']
                for (const s of btnSels) {
                  const el = document.querySelector(s)
                  if (el && el.offsetParent !== null) {
                    const text = (el.textContent || '').trim()
                    if (text.includes('登录') || text.includes('登 录') || s.includes('submit')) {
                      el.click(); return 'oa-login-clicked'
                    }
                  }
                }
                for (const s of btnSels) {
                  const el = document.querySelector(s)
                  if (el && el.offsetParent !== null) { el.click(); return 'oa-login-clicked-fallback' }
                }
                p.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }))
                return 'oa-login-enter'
              })()
            `
          }

          win.webContents.executeJavaScript(fillScript).then((result) => {
            console.log('[open:urlWithAuth] fill result:', result)
          }).catch((err) => {
            console.error('[open:urlWithAuth] fill error:', err)
          })
        }, waitMs)
      })

      // ---- Track API calls for approval detection ----
      const workflowKey = workflowUrl
      const approvalApiHits: string[] = []
      let workflowAlreadyRemoved = false
      const isOaPlatform = platform.platformType === 'landray' || !platform.ssoUrl?.includes('italent.cn')

      // For OA: extract the OA server domain from workflowUrl to capture its requests
      let oaHost = ''
      if (isOaPlatform) {
        try { oaHost = new URL(workflowUrl).hostname } catch {}
      }
      console.log('[monitor] platform type:', isOaPlatform ? 'OA/Landray' : 'Beisen', oaHost ? 'oaHost=' + oaHost : '')

      /** Helper: resolve workflow key and remove from DB, notify renderer */
      function tryRemoveWorkflow(reason: string) {
        if (workflowAlreadyRemoved) {
          console.log('[monitor] workflow already removed, skip (' + reason + ')')
          return
        }
        console.log('[monitor] approval action detected (' + reason + '), removing workflow')
        console.log('[monitor] platformId:', platformId.substring(0, 8), 'workflowKey:', workflowKey.substring(0, 100))

        const allWorkflows = db.getWorkflows()
        const target = allWorkflows.find(w =>
          w.platformId === platformId && (w.url === workflowKey || w.fdId === workflowKey)
        )
        const removeKey = target ? (target.fdId || target.url || workflowKey) : workflowKey
        console.log('[monitor] resolved removeKey:', removeKey.substring(0, 100), 'found:', !!target)

        const removed = db.removeWorkflow(platformId, removeKey)
        console.log('[monitor] removeWorkflow result:', removed)
        if (removed) {
          workflowAlreadyRemoved = true
          db.addLog(platformId, 'monitor', 'success', '流程已处理，已从待办移除')
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('workflows-updated')
            console.log('[monitor] workflows-updated event sent to renderer')
          } else {
            console.log('[monitor] WARNING: mainWindow is null or destroyed')
          }
        } else {
          console.log('[monitor] WARNING: removeWorkflow returned false — key mismatch')
        }
      }

      /** Check if a captured request is an approval submission endpoint */
      function isApprovalEndpoint(url: string): boolean {
        if (isOaPlatform) {
          // OA/Landray EKP approval patterns
          if (url.includes('method=approve') || url.includes('method=agree')) return true
          if (url.includes('method=reject') || url.includes('method=disagree')) return true
          if (url.includes('method=finish') || url.includes('method=complete')) return true
          if (url.includes('method=submitto')) return true
          // Generic form-based approval
          if (url.includes('km_review_main') && url.includes('method=')) return true
          return false
        }
        // Beisen approval patterns
        if (url.includes('processhandle') || url.includes('handletask')) return true
        if (url.includes('/wf/') && (url.includes('complete') || url.includes('submit') || url.includes('reject'))) return true
        if (url.includes('approve') || url.includes('approval')) return true
        if (url.includes('todo') && url.includes('handle')) return true
        if (url.includes('/bpm/') && (url.includes('complete') || url.includes('submit') || url.includes('reject'))) return true
        return false
      }

      /** Check if a request URL belongs to the monitored platform */
      function isPlatformRequest(reqUrl: string): boolean {
        if (isOaPlatform) {
          return oaHost !== '' && reqUrl.includes(oaHost)
        }
        return reqUrl.includes('italent') || reqUrl.includes('beisen')
      }

      let cdpSession: any = null
      try {
        cdpSession = win.webContents.debugger
        cdpSession.attach('1.3')
        cdpSession.on('message', (_: any, method: string, params: any) => {
          if (method === 'Network.requestWillBeSent') {
            const reqUrl = (params.request?.url || '').toLowerCase()
            const methodType = (params.request?.method || '').toUpperCase()
            // Capture POST/PUT requests to the relevant platform
            if ((methodType === 'POST' || methodType === 'PUT' || (isOaPlatform && methodType === 'GET')) &&
                isPlatformRequest(reqUrl)) {
              approvalApiHits.push(reqUrl)
              console.log('[monitor] ' + methodType + ' captured:', reqUrl.substring(0, 100))

              // Mechanism 1: Real-time — remove immediately when approval endpoint is hit
              if (!workflowAlreadyRemoved && isApprovalEndpoint(reqUrl)) {
                tryRemoveWorkflow('real-time CDP')
              }
            }
          }
        })
        cdpSession.sendCommand('Network.enable')
        console.log('[monitor] CDP network monitoring started')
      } catch (err: any) {
        console.warn('[monitor] CDP attach failed:', err.message?.substring(0, 60))
      }

      // Mechanism 2: Fallback — on window close, scan all captured requests
      win.on('closed', async () => {
        try { cdpSession?.detach() } catch {}

        console.log('[monitor] window closed, POST count:', approvalApiHits.length)

        if (!workflowAlreadyRemoved) {
          const hasApprovalAction = approvalApiHits.some(url => isApprovalEndpoint(url))
          if (hasApprovalAction) {
            tryRemoveWorkflow('window closed fallback')
          } else {
            console.log('[monitor] no approval action detected, keeping workflow')
          }
        }
      })

      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
}

async function runAllExtractions(): Promise<{ success: number; failed: number; total: number }> {
  const accounts = db.getAccounts()

  // Build flat list of (account, platform) pairs
  const tasks: Array<{ account: Account; platform: Platform }> = []
  for (const account of accounts) {
    const platforms = db.getPlatforms(account.id)
    for (const platform of platforms) {
      tasks.push({ account, platform })
    }
  }
  const totalCount = tasks.length

  // Clean up orphaned workflows
  const validPlatformIds = new Set(db.getPlatforms().map(p => p.id))
  const orphaned = db.removeOrphanedWorkflows(validPlatformIds)
  if (orphaned > 0) console.log('[extract] cleaned up orphaned workflows:', orphaned)

  let current = 0
  let success = 0, failed = 0

  // Run all platform extractions in parallel
  const results = await Promise.allSettled(tasks.map(async ({ account, platform }) => {
    const idx = ++current
    const progress = { current: idx, total: totalCount, account: account.name, platform: platform.name }
    mainWindow?.webContents.send('extraction-progress', progress)

    try {
      const freshPlatform = db.getPlatforms().find(p => p.id === platform.id) || platform
      console.log('[extract] using workflowUrl:', freshPlatform.workflowUrl?.substring(0, 80))
      db.addLog(freshPlatform.id, 'extract', 'running', `正在提取 ${account.name} - ${freshPlatform.name}...`)
      const result = await extractWorkflows(account, freshPlatform)

      if (result.error) {
        db.addLog(platform.id, 'extract', 'failed', result.error)
        failed++
        return
      }

      const isBeisenPlatform = freshPlatform.platformType === 'beisen' || freshPlatform.ssoUrl?.includes('italent.cn')
      const validWorkflows = isBeisenPlatform
        ? result.workflows.filter(w => w.fdId || w.url)
        : result.workflows.filter(w => w.fdId)
      const syncResult = db.syncWorkflowsForPlatform(platform.id, validWorkflows)
      db.addLog(platform.id, 'extract', 'success',
        `同步完成: 新增${syncResult.added} 更新${syncResult.updated} 移除${syncResult.removed}，共${result.workflows.length}条`)
      success++
    } catch (err: any) {
      db.addLog(platform.id, 'extract', 'failed', err.message)
      failed++
    }
  }))

  db.addLog(null, 'extract-batch', success > 0 ? 'success' : 'failed',
    `完成: ${success}/${totalCount} 成功, ${failed} 失败`)

  mainWindow?.webContents.send('workflows-updated')
  return { success, failed, total: totalCount }
}

async function runPlatformExtraction(platformId: string) {
  const platforms = db.getPlatforms()
  const platform = platforms.find(p => p.id === platformId)
  if (!platform) return { success: false, error: 'Platform not found' }

  const accounts = db.getAccounts()
  const account = accounts.find(a => a.id === platform.accountId)
  if (!account) return { success: false, error: 'Account not found' }

  const result = await extractWorkflows(account, platform)
  if (result.error) return { success: false, error: result.error }

  const isBeisenPlatform = platform.platformType === 'beisen' || platform.ssoUrl?.includes('italent.cn')
  const validWorkflows = isBeisenPlatform
    ? result.workflows.filter(w => w.fdId || w.url)
    : result.workflows.filter(w => w.fdId)
  const syncResult = db.syncWorkflowsForPlatform(platform.id, validWorkflows)
  db.addLog(platform.id, 'extract', 'success',
    `同步完成: 新增${syncResult.added} 更新${syncResult.updated} 移除${syncResult.removed}`)
  mainWindow?.webContents.send('workflows-updated')
  return { success: true, count: result.workflows.length }
}

async function runLLMAnalysis(force = false) {
  const configs = db.getLLMConfigs()
  const defaultConfig = configs.find(c => c.isDefault) || configs[0]
  if (!defaultConfig) return { success: false, error: '未配置大模型' }

  const workflows = force ? db.getWorkflows() : db.getWorkflows().filter(w => !w.llmSummary)
  if (workflows.length === 0) return { success: true, analyzed: 0 }

  const results = await batchSummarize(defaultConfig, workflows)
  for (const [id, summary] of results) {
    db.updateWorkflowSummary(id, summary)
  }

  db.addLog(null, 'llm-analyze', 'success', `分析了 ${results.size} 条流程`)
  mainWindow?.webContents.send('workflows-updated')
  return { success: true, analyzed: results.size }
}
