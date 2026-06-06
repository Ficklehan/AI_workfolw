import { BrowserWindow, session } from 'electron'
import type { Platform, Account, Workflow } from '../../types'

export interface ExtractResult {
  workflows: Omit<Workflow, 'id' | 'extractedAt' | 'llmSummary'>[]
  error?: string
}

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

// ---- Navigation helper ----
function loadUrl(win: BrowserWindow, url: string, timeout = 15000): Promise<void> {
  return new Promise<void>((resolve) => {
    let handled = false
    const timer = setTimeout(() => { if (!handled) { handled = true; resolve() } }, timeout)
    const onFinish = () => { if (!handled) { handled = true; clearTimeout(timer); resolve() } }
    win.webContents.once('did-finish-load', onFinish)
    win.loadURL(url).catch(() => { if (!handled) { handled = true; clearTimeout(timer); resolve() } })
  })
}

// ---- Main extraction entry point ----

// ---- Safe eval helper ----
async function safeExecuteJavaScript(win: BrowserWindow, script: string): Promise<any> {
  try {
    return await win.webContents.executeJavaScript(script)
  } catch (err: any) {
    console.warn('[safeEval] executeJavaScript error:', err.message?.substring(0, 80))
    return null
  }
}

export async function extractWorkflows(account: Account, platform: Platform): Promise<ExtractResult> {
  const ses = session.fromPartition(`persist:extract-${account.id}`)
  await ses.clearStorageData()

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      session: ses,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  try {
    // Step 1: Navigate to SSO login
    await loadUrl(win, platform.ssoUrl, 15000)
    await delay(2000)

    // Step 2: Login
    await performLogin(win, account)
    await delay(2000)

    const currentUrl = win.webContents.getURL()
    console.log('[extractor] after login URL:', currentUrl.substring(0, 100))

    const isBeisen = platform.platformType === 'beisen' || platform.ssoUrl.includes('italent.cn')

    if (isBeisen) {
      const result = await extractBeisen(win, platform)
      return result
    } else {
      return await extractOA(win, platform)
    }
  } catch (err: any) {
    console.error('[extractor] error:', err.message)
    return { workflows: [], error: err.message }
  } finally {
    if (!win.isDestroyed()) {
      try { win.close() } catch { /* ignore */ }
    }
  }
}

// ---- Login via executeJavaScript (works for both OA and Beisen) ----
async function performLogin(win: BrowserWindow, account: Account): Promise<void> {
  console.log('[performLogin] starting login for:', account.username)

  const pageUrl = win.webContents.getURL()
  const isBeisen = pageUrl.includes('italent.cn')
  console.log('[performLogin] page URL:', pageUrl.substring(0, 100))

  const user = JSON.stringify(account.username)
  const pass = JSON.stringify(account.password)

  // Execute login in one shot — replicating the working main.ts open:urlWithAuth pattern
  const script = isBeisen ? `
    (async () => {
      const delay = ms => new Promise(r => setTimeout(r, ms))

      // Step 1: Switch to password mode
      const all = document.querySelectorAll('*')
      for (const el of all) {
        if ((el.textContent || '').trim() === '切换到密码验证' && el.offsetParent !== null) {
          el.click()
          await delay(2000)
          break
        }
      }

      // Step 2: Fill using React-compatible nativeInputValueSetter
      const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
      if (!desc || !desc.set) return 'no-native-setter'

      function setVal(el, val) {
        el.focus()
        desc.set.call(el, val)
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
        el.dispatchEvent(new Event('blur', { bubbles: true }))
      }

      const u = document.querySelector(
        'input[placeholder*="用户名"], input[placeholder*="工号"], ' +
        'input[name="username"], input[name="j_username"], ' +
        'input[name="account"], input[name="loginName"], ' +
        'input[type="text"]'
      )
      const p = document.querySelector('input[type="password"]')
      if (!u || !p) return 'no-form-fields'

      setVal(u, ${user})
      await delay(300)
      setVal(p, ${pass})
      await delay(300)

      // Step 3: Check checkbox
      const cb = document.querySelector('input[type="checkbox"]')
      if (cb && !cb.checked) cb.click()
      await delay(300)

      // Step 4: Submit — inject hidden submit button to trigger React form handler
      const form = p.closest('form')
      if (form) {
        const hiddenBtn = document.createElement('button')
        hiddenBtn.type = 'submit'
        hiddenBtn.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px'
        form.appendChild(hiddenBtn)
        await delay(100)
        hiddenBtn.click()
        await delay(100)
        form.removeChild(hiddenBtn)
        return 'beisen-btn-injected'
      }
      // No form found - try clicking a visible login/submit button
      const btnSelectors = [
        'button[type="submit"]', 'input[type="submit"]',
        '.login-btn', '#loginBtn', '#submitBtn', 'button'
      ]
      for (const sel of btnSelectors) {
        try {
          const btn = document.querySelector(sel)
          if (btn && btn.offsetParent !== null) {
            const t = (btn.textContent || btn.value || '').trim()
            if (t.includes('登录') || t.includes('登 录') || t === '' || sel === 'button') {
              btn.click()
              await delay(300)
              return 'beisen-btn-clicked'
            }
          }
        } catch(e) { /* bad selector */ }
      }

      // Final fallback: Enter key with keyCode for React synthetic event compatibility
      p.focus()
      const keyEvtInit = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }
      p.dispatchEvent(new KeyboardEvent('keydown', keyEvtInit))
      p.dispatchEvent(new KeyboardEvent('keypress', keyEvtInit))
      p.dispatchEvent(new KeyboardEvent('keyup', keyEvtInit))

      return 'beisen-login-done'
    })()
  ` : `
    (async () => {
      try {
        const u = document.querySelector(
          'input[placeholder*="工号"], input[placeholder*="用户名"], ' +
          'input[name="username"], input[name="j_username"], ' +
          'input[type="text"]'
        )
        const p = document.querySelector(
          'input[placeholder*="密码"], input[name="password"], ' +
          'input[name="j_password"], input[type="password"]'
        )
        if (!u || !p) return 'no-oa-form'

        u.focus(); u.value = ${user}
        u.dispatchEvent(new Event('input', { bubbles: true }))
        p.focus(); p.value = ${pass}
        p.dispatchEvent(new Event('input', { bubbles: true }))

        // Click login button
        const btns = document.querySelectorAll('button, input[type="submit"]')
        for (const b of btns) {
          if (b.offsetParent !== null) {
            const t = (b.textContent || b.value || '').trim()
            if (t === '登录' || t === '登 录' || t.includes('登录')) {
              b.click()
              return 'oa-btn-clicked'
            }
          }
        }
        // Fallback: form submit
        const form = p.closest('form')
        if (form) { form.submit(); return 'oa-form-submitted' }
        return 'oa-no-submit'
      } catch(e) {
        return 'oa-error:' + String(e).substring(0, 200)
      }
    })()
  `

  console.log('[performLogin] executing script, length:', script.length)
  const result = await win.webContents.executeJavaScript(script)
  console.log('[performLogin] result:', result)

  if (isBeisen) {
    await delay(5000)
  } else {
    await delay(2000)
  }

  console.log('[performLogin] after login, URL:', win.webContents.getURL().substring(0, 100))
}

// ---- Beisen extraction via Chrome DevTools Protocol (Network interception) ----
async function extractBeisen(win: BrowserWindow, platform: Platform): Promise<ExtractResult> {
  console.log('[extractor] 北森: setting up CDP network interception')

  const capturedIds: Array<{ requestId: string; url: string }> = []

  // Attach debugger for network monitoring
  const dbg = win.webContents.debugger
  try {
    dbg.attach()
    await dbg.sendCommand('Network.enable')
    console.log('[extractor] CDP debugger attached')
  } catch (err: any) {
    console.error('[extractor] CDP attach failed:', err.message)
    return { workflows: [], error: 'Debugger attach failed: ' + err.message }
  }

  // Listen for network responses
  const onMessage = (_event: any, method: string, params: any) => {
    if (method === 'Network.responseReceived') {
      const mime: string = (params.response?.mimeType || '').toLowerCase()
      if (mime.includes('json')) {
        const respUrl: string = (params.response?.url || '').toLowerCase()
        if (/(todo|task|workflow|pending|approv|process|list|query|search)/.test(respUrl)) {
          capturedIds.push({ requestId: params.requestId, url: params.response.url })
          console.log('[extractor] CDP captured:', params.response.url.substring(0, 120))
        }
      }
    }
  }

  dbg.on('message', onMessage)

  // Navigate to workflow URL
  console.log('[extractor] 北森: navigating to workflowUrl')
  await loadUrl(win, platform.workflowUrl, 30000)

  // Wait for SPA to load and API calls to complete
  await delay(15000)

  dbg.off('message', onMessage)

  console.log('[extractor] 北森: CDP captured', capturedIds.length, 'API endpoints')

  // Fetch response bodies
  const capturedResponses: Array<{ url: string; body: any }> = []
  for (const { requestId, url } of capturedIds) {
    try {
      const result = (await dbg.sendCommand('Network.getResponseBody', { requestId })) as any
      const text: string = result.base64Encoded
        ? Buffer.from(result.body, 'base64').toString('utf-8')
        : result.body
      if (text.length > 64) {
        capturedResponses.push({ url, body: JSON.parse(text) })
        console.log('[extractor] CDP body fetched:', url.substring(0, 80), `(${text.length} bytes)`)
      }
    } catch (err: any) {
      console.warn('[extractor] CDP getBody failed for:', url.substring(0, 80), err.message?.substring(0, 40))
    }
  }

  try { dbg.detach() } catch { /* ignore */ }

  console.log('[extractor] 北森: got', capturedResponses.length, 'response bodies')
  capturedResponses.forEach((r, i) => {
    const keys = typeof r.body === 'object' && r.body !== null
      ? Object.keys(r.body).join(', ')
      : 'non-object'
    console.log(`  [${i}] ${r.url.substring(0, 100)} | keys: ${keys}`)
  })

  const workflows = parseBeisenApiResponses(capturedResponses, platform)

  if (workflows.length > 0) {
    console.log('[extractor] API interception found', workflows.length, 'workflows')
    return { workflows }
  }

  console.log('[extractor] 北森: API interception found no data')
  // Fall through to DOM scraping as fallback
  return await extractViaDOM(win, platform)
}

// ---- OA extraction via DOM table scraping ----
async function extractOA(
  win: BrowserWindow,
  platform: Platform
): Promise<ExtractResult> {
  // Navigate to the configured OA workflow view
  // Force a full page load by navigating to about:blank first,
  // then to the workflow URL. This ensures the JSP server re-renders
  // the correct view (hash-only navigation may not trigger re-render)
  const workflowUrl = platform.workflowUrl
  console.log('[extractor] OA: forcing full page load to workflowUrl')
  await loadUrl(win, 'about:blank', 3000)
  await loadUrl(win, workflowUrl, 15000)

  // Wait for table to load
  await delay(3000)
  for (let i = 0; i < 8; i++) {
    const found = await safeExecuteJavaScript(win, 
      `!!document.querySelector('table.lui_listview_columntable_table')`
    )
    if (found) break
    await delay(1500)
  }

  return await extractViaDOM(win, platform)
}

// ---- Fallback: DOM-based extraction for both OA and Beisen fallback ----
async function extractViaDOM(
  win: BrowserWindow,
  platform: Platform
): Promise<ExtractResult> {
  const allWorkflows = await extractAllPages(win, platform)
  console.log('[extractor] extraction done, workflows:', allWorkflows.length)
  allWorkflows.slice(0, 5).forEach((w, i) => {
    console.log(`[extractor] [${i}] title="${w.title?.substring(0, 50)}" fdId="${w.fdId || 'EMPTY'}"`)
  })
  return { workflows: allWorkflows }
}

// ---- Multi-page extraction ----
async function extractAllPages(
  win: BrowserWindow,
  platform: Platform
): Promise<Omit<Workflow, 'id' | 'extractedAt' | 'llmSummary'>[]> {
  const allWorkflows: Omit<Workflow, 'id' | 'extractedAt' | 'llmSummary'>[] = []
  const maxPages = 50

  for (let pageNum = 0; pageNum < maxPages; pageNum++) {
    await delay(3000)

    const pageData = await extractPageData(win, platform.urlPattern)
    if (pageData.length === 0) break

    allWorkflows.push(...pageData.map(w => ({ ...w, platformId: platform.id })))

    const hasNext = await goToNextPage(win)
    if (!hasNext) break
  }

  return allWorkflows
}

// ---- Extract workflow data from current page via DOM ----
async function extractPageData(
  win: BrowserWindow,
  urlPattern: string
): Promise<Omit<Workflow, 'id' | 'extractedAt' | 'llmSummary'>[]> {
  // Wrapper to safely execute JS and return null on error
  async function safeEval(script: string): Promise<any> {
    try {
      return await win.webContents.executeJavaScript(script)
    } catch (err: any) {
      console.warn('[extractPageData] executeJavaScript error:', err.message?.substring(0, 80))
      return null
    }
  }

  // Strategy 1: table-based (Landray EKP, etc.)
  const tableSelectors = [
    'table.lui_listview_columntable_table',
    'table.listview_table',
    'table.dataTable',
    '.listview-table table',
    'table[id*="list"]'
  ]

  for (const tableSelector of tableSelectors) {
    const data = await safeEval(`
      (() => {
        const selector = ${JSON.stringify(tableSelector)};
        const pattern = ${JSON.stringify(urlPattern)};
        const tables = document.querySelectorAll(selector);
        const allResults = [];

        for (let t = 0; t < tables.length; t++) {
          const rows = tables[t].querySelectorAll('tr');
          if (rows.length < 2) continue;

          for (let i = 1; i < rows.length; i++) {
            const cells = rows[i].querySelectorAll('td');
            if (cells.length < 2) continue;

            const cb = cells[0].querySelector('input[type=checkbox]');
            const fdId = cb ? (cb.value || '') : (cells[0].getAttribute('data-id') || '');

            const getText = (idx) => {
              const el = cells[idx];
              return el ? (el.innerText || '').trim().replace(/\\s+/g, ' ') : '';
            };

            allResults.push({
              fdId: fdId,
              title: getText(2) || getText(1),
              num: getText(3) || getText(2),
              cdate: getText(4) || getText(3),
              edate: getText(5) || getText(4),
              status: getText(6) || getText(5),
              step: getText(7) || getText(6),
              handler: getText(8) || getText(7),
              url: pattern.replace('{fdId}', fdId)
            });
          }
        }
        return allResults;
      })()
    `)

    if (Array.isArray(data) && data.length > 0) {
      return data.map((item: any) => mapToWorkflow(item))
    }
  }

  // Strategy 2: SPA list items (div-based)
  const listSelectors = [
    '[class*="todo"] [class*="item"]',
    '[class*="task"] [class*="item"]',
    '[class*="list"] [class*="item"]',
    '[class*="card"]',
    '.ant-table-row',
    '.el-table__row',
    '[role="row"]'
  ]

  for (const listSelector of listSelectors) {
    const data = await safeEval(`
      (() => {
        const selector = ${JSON.stringify(listSelector)};
        const pattern = ${JSON.stringify(urlPattern)};
        const items = document.querySelectorAll(selector);
        if (items.length < 1) return [];

        const results = [];
        for (let i = 0; i < items.length; i++) {
          const el = items[i];
          const text = (el.innerText || '').trim();
          if (!text || text.length < 2) continue;

          const lines = text.split('\\n').map(l => l.trim()).filter(Boolean);
          const title = lines[0] || '';
          if (!title) continue;

          const link = el.querySelector('a');
          const href = link ? link.href : '';

          const id = el.getAttribute('data-id') || el.getAttribute('data-key') || el.id || '';

          results.push({
            fdId: id,
            title: title.substring(0, 100),
            num: lines[1] || '',
            cdate: lines[2] || '',
            edate: '',
            status: '',
            step: '',
            handler: '',
            url: href || pattern.replace('{fdId}', id)
          });
        }
        return results;
      })()
    `)

    if (Array.isArray(data) && data.length > 0) {
      return data.map((item: any) => mapToWorkflow(item))
    }
  }

  return []
}

function mapToWorkflow(item: any): Omit<Workflow, 'id' | 'extractedAt' | 'llmSummary'> {
  return {
    platformId: '',
    fdId: item.fdId || '',
    title: item.title || '',
    docNumber: item.num || '',
    createDate: item.cdate || '',
    endDate: item.edate || '',
    status: item.status || '',
    currentStep: item.step || '',
    currentHandler: item.handler || '',
    url: item.url || ''
  }
}

// ---- Pagination ----
async function goToNextPage(win: BrowserWindow): Promise<boolean> {
  const pageInfo = await safeExecuteJavaScript(win, `
    (() => {
      const all = document.querySelectorAll('*');
      for (let i = 0; i < all.length; i++) {
        const text = (all[i].textContent || '').trim();
        const match = text.match(/^(\\d+)\\s*\\/\\s*(\\d+)$/);
        if (match) {
          return { current: parseInt(match[1]), total: parseInt(match[2]) };
        }
      }
      return null;
    })()
  `)

  if (pageInfo && (pageInfo as any).current >= (pageInfo as any).total) {
    return false
  }

  // Try common "next page" selectors via executeJavaScript click
  const clicked = await safeExecuteJavaScript(win, `
    (() => {
      const nextSels = [
        'a:has-text("下一页")',
        'a:has-text("下页")',
        'a:has-text(">")',
        '.pagination .next:not(.disabled)',
        'a[title="下一页"]',
        'a[aria-label="Next"]',
        'li.next > a'
      ];

      // Check text content approach
      const all = document.querySelectorAll('a');
      for (let i = 0; i < all.length; i++) {
        const a = all[i] as HTMLAnchorElement;
        const text = (a.textContent || '').trim();
        if ((text === '下一页' || text === '下页' || text === '>') && a.offsetParent !== null) {
          const cls = (a.className || '') + ' ' + ((a.parentElement && a.parentElement.className) || '');
          if (!cls.includes('disabled') && a.getAttribute('disabled') === null) {
            a.click();
            return true;
          }
        }
      }

      // CSS selector approach
      for (const sel of nextSels) {
        try {
          const el = document.querySelector(sel);
          if (el && el.offsetParent !== null) {
            el.click();
            return true;
          }
        } catch(e) { /* invalid selector */ }
      }

      return false;
    })()
  `)

  if (clicked) {
    await delay(1500)
    return true
  }

  return false
}

// ---- Parse Beisen API responses to extract workflow data ----
function parseBeisenApiResponses(
  responses: Array<{ url: string; body: any }>,
  platform: Platform
): Omit<Workflow, 'id' | 'extractedAt' | 'llmSummary'>[] {

  const titleKeys = ['processName', 'title', 'name', 'flowName', 'workflowName', 'subTitle']
  const idKeys = ['taskId', 'workflowId', 'id', 'processId', 'requestId', 'businessId', 'todoId', 'approvalTaskId', 'objId']
  const urlKeys = ['linkUrl', 'url', 'href', 'detailUrl']
  const numKeys = ['businessCode', 'docNumber', 'code', 'flowCode', 'processCode']
  const cdateKeys = ['applyDate', 'createDate', 'startTime', 'createTime', 'submitDate', 'applyTime', 'date', 'originalCreateDate']
  const edateKeys = ['endDate', 'finishDate', 'completeDate', 'doneDate', 'finishTime', 'originalHandedDate']
  const statusKeys = ['status', 'taskStatus', 'workflowStatus', 'processStatus']
  const stepKeys = ['currentStep', 'stepName', 'nodeName', 'activityName', 'taskName']
  const handlerKeys = ['currentHandler', 'handler', 'approver', 'assignee', 'ownerName', 'applyUserName']

  let bestWorkflows: Omit<Workflow, 'id' | 'extractedAt' | 'llmSummary'>[] = []
  let bestScore = 0

  for (const { url, body } of responses) {
    const arrays: any[][] = []

    const findArrays = (obj: any, depth: number) => {
      if (depth > 4 || obj === null || obj === undefined) return
      if (Array.isArray(obj)) {
        arrays.push(obj)
      } else if (typeof obj === 'object') {
        for (const v of Object.values(obj)) {
          findArrays(v, depth + 1)
        }
      }
    }

    findArrays(body, 0)

    for (const arr of arrays) {
      if (arr.length === 0) continue
      if (typeof arr[0] !== 'object' || arr[0] === null) continue

      const itemKeys = Object.keys(arr[0])
      if (itemKeys.length < 2) continue

      const keySet = new Set(itemKeys)
      const hasMatch = (candidates: string[]) => candidates.some(k => keySet.has(k))

      let score = 0
      if (hasMatch(titleKeys)) score += 3
      if (hasMatch(idKeys)) score += 3
      if (hasMatch(cdateKeys)) score += 2
      if (hasMatch(statusKeys)) score += 2
      if (hasMatch(numKeys)) score += 1
      if (hasMatch(stepKeys)) score += 1
      if (hasMatch(handlerKeys)) score += 1
      score += Math.min(arr.length, 100) * 0.05

      if (score > bestScore && score >= 5) {
        const pick = (obj: any, keys: string[]): string => {
          for (const k of keys) {
            const v = obj[k]
            if (v !== undefined && v !== null && v !== '') return String(v)
          }
          return ''
        }

        bestWorkflows = arr.map((item: any) => {
          // Resolve URL: linkUrl from API may be relative; make it absolute
          let rawUrl = pick(item, urlKeys)
          if (rawUrl) {
            if (rawUrl.startsWith('//')) {
            // Protocol-relative URL: prepend https:
            rawUrl = 'https:' + rawUrl
          } else if (rawUrl.startsWith('/')) {
              const baseUrl = platform.workflowUrl || platform.ssoUrl || ''
              try {
                const base = new URL(baseUrl)
                rawUrl = base.origin + rawUrl
              } catch {
                if (baseUrl.includes('italent.cn')) {
                  rawUrl = 'https://www.italent.cn' + rawUrl
                }
              }
            } else if (!rawUrl.startsWith('http')) {
              const baseUrl = platform.workflowUrl || platform.ssoUrl || ''
              try {
                const base = new URL(baseUrl)
                rawUrl = base.origin + '/' + rawUrl
              } catch {}
            }
          }
          if (!rawUrl) {
            rawUrl = platform.urlPattern
              ? platform.urlPattern.replace('{fdId}', pick(item, idKeys))
              : ''
          }
          return {
            platformId: platform.id,
            fdId: pick(item, idKeys),
            title: pick(item, titleKeys),
            docNumber: pick(item, numKeys),
            createDate: pick(item, cdateKeys),
            endDate: pick(item, edateKeys),
            status: pick(item, statusKeys),
            currentStep: pick(item, stepKeys),
            currentHandler: pick(item, handlerKeys),
            url: rawUrl
          }
        })

        bestScore = score
        console.log(`[extractor] best API array: ${bestWorkflows.length} items score=${score.toFixed(1)} url=${url.substring(0, 80)}`)
      }
    }
  }

  return bestWorkflows
}
