import { chromium, type BrowserContext, type Page } from 'playwright'
import type { Platform, Account, Workflow } from '../../types'

export interface ExtractResult {
  workflows: Omit<Workflow, 'id' | 'extractedAt' | 'llmSummary'>[]
  error?: string
}

// ---- Main extraction entry point ----
// Each extraction uses a fresh browser with an isolated context — no shared cookies/tokens between accounts
export async function extractWorkflows(account: Account, platform: Platform): Promise<ExtractResult> {
  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  })

  try {
    // Create an isolated context (separate cookies/storage per account)
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      locale: 'zh-CN'
    })

    const page = await context.newPage()

    // Step 1: Navigate to SSO login
    await page.goto(platform.ssoUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })

    // Step 2: Wait for page to stabilize, then try to login
    await page.waitForTimeout(2000)
    await performLogin(page, account)

    // Step 3: Navigate to workflow list
    await page.waitForTimeout(2000)
    const currentUrl = page.url()
    console.log('[extractor] after login URL:', currentUrl.substring(0, 100))

    const isBeisen = platform.platformType === 'beisen' || platform.ssoUrl.includes('italent.cn')

    if (isBeisen) {
      // 北森: navigate to workflowUrl, then extract from the PCTodoCenter iframe
      console.log('[extractor] 北森: navigating to workflowUrl')
      await page.goto(platform.workflowUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await page.waitForTimeout(8000)

      // Try extracting from ALL frames (including nested cross-origin iframes)
      const frames = page.frames()
      console.log('[extractor] 北森: total frames:', frames.length)
      frames.forEach((f, i) => console.log(`  [${i}] ${f.url().substring(0, 120)}`))

      // Wait longer for SPA content to load
      await page.waitForTimeout(5000)

      let allIframeData: any[] = []
      // 北森 SPA 选择器：待办列表可能是 tr/row 或 div item
      const BEISEN_SELECTOR = 'tr, [role="row"], [class*="todo"] [class*="item"], [class*="task"] [class*="item"], [class*="list"] [class*="item"], [class*="card"]'

      // 等待 PCTodoCenter 待办数据加载
      const todoFrame = frames.find(f => f.url().includes('PCTodoCenter'))
      if (todoFrame) {
        // 等待 global-task-list-wrapper 有子元素
        console.log('[extractor] waiting for PCTodoCenter task list to load...')
        for (let wait = 0; wait < 10; wait++) {
          await page.waitForTimeout(2000)
          const childCount = await todoFrame.evaluate(() => {
            const wrapper = document.querySelector('.global-task-list-wrapper')
            return wrapper ? wrapper.children.length : -1
          }).catch(() => -2)
          console.log(`[extractor] task-list-wrapper children: ${childCount} (wait ${wait + 1})`)
          if (childCount > 0) break
        }

        // dump 加载后的 DOM
        try {
          const domInfo = await todoFrame.evaluate(() => {
            const body = document.body
            if (!body) return '(no body)'
            const containers: string[] = []
            const all = body.querySelectorAll('*')
            for (let i = 0; i < all.length; i++) {
              const el = all[i] as HTMLElement
              const cls = el.className || ''
              const tag = el.tagName.toLowerCase()
              if (typeof cls === 'string' && (cls.includes('task') || cls.includes('todo') || cls.includes('pending'))) {
                const childCount = el.children.length
                const text = (el.innerText || '').substring(0, 80).replace(/\n/g, '|')
                containers.push(`<${tag} class="${cls.substring(0, 80)}" children=${childCount}> "${text}"`)
              }
            }
            return containers.slice(0, 20).join('\n')
          })
          console.log('[extractor] PCTodoCenter task DOM:')
          domInfo.split('\n').forEach((line: string) => console.log(`  ${line}`))
        } catch (err: any) {
          console.log('[extractor] DOM dump error:', err.message?.substring(0, 60))
        }
      }

      for (let fi = 0; fi < frames.length; fi++) {
        const frame = frames[fi]
        try {
          // 等 SPA 内容稳定后再提取（避免多次 evaluate 之间 DOM 变化）
          await frame.waitForTimeout(2000)

          const result = await frame.evaluate((selector: string) => {
            const items = document.querySelectorAll(selector)
            const count = items.length
            if (count < 1) return { count: 0, samples: [], data: [] }

            const skipTitles = ['批量同意', '批量不同意', '流程委托', '流程管理', '接收时间', '发起人', '操作']
            const samples: string[] = []
            const data: any[] = []

            for (let i = 0; i < items.length; i++) {
              const el = items[i] as HTMLElement
              const text = (el.innerText || '').trim()
              if (!text || text.length < 3) continue
              const lines = text.split('\n').map((l: string) => l.trim()).filter(Boolean)
              const title = lines[0] || ''
              if (!title || title.length < 2) continue

              // 记录前 5 条原始内容用于调试
              if (samples.length < 5) {
                const link = el.querySelector('a') as HTMLAnchorElement | null
                const href = link?.href?.substring(0, 80) || '(no-link)'
                samples.push(`"${title.substring(0, 60)}" | href=${href}`)
              }

              if (skipTitles.includes(title)) continue

              const link = el.querySelector('a') as HTMLAnchorElement | null
              const href = link?.href || ''
              // 北森是 SPA，行元素没有 data-id 等属性，用 href 作为唯一标识
              const id = href || el.getAttribute('data-id') || el.getAttribute('data-key') || el.getAttribute('data-row-key') || ''

              data.push({ fdId: id, title: title.substring(0, 100), num: lines[1] || '', cdate: lines[2] || '', url: href })
            }

            return { count, samples, data }
          }, BEISEN_SELECTOR)

          console.log(`[extractor] frame[${fi}] items=${result.count} data=${result.data.length} url=${frame.url().substring(0, 80)}`)
          result.samples.forEach((s: string) => console.log(`  sample: ${s}`))

          if (result.data.length > 0) {
            result.data.slice(0, 3).forEach((w: any, i: number) => console.log(`  [${i}] "${w.title?.substring(0, 40)}" fdId="${(w.fdId || '').substring(0, 40) || 'EMPTY'}"`))
            allIframeData = result.data
            break
          }
        } catch (err: any) {
          console.log(`[extractor] frame[${fi}] error:`, err.message?.substring(0, 60))
        }
      }

      if (allIframeData.length > 0) {
        const allWorkflows = allIframeData.map((item: any) => ({
          platformId: platform.id, fdId: item.fdId || '', title: item.title || '',
          docNumber: item.num || '', createDate: item.cdate || '', endDate: '',
          status: '', currentStep: '', currentHandler: '', url: item.url || ''
        }))
        console.log('[extractor] extraction done, workflows:', allWorkflows.length)
        await browser.close()
        return { workflows: allWorkflows }
      }
      console.log('[extractor] 北森: no workflow data found in any frame')
    } else {
      // OA: navigate to workflowUrl
      const workflowUrl = platform.workflowUrl.replace(/ticket=[^&#]+&?/, '')
      const baseUrl = workflowUrl.split('#')[0]
      if (!currentUrl.startsWith(baseUrl)) {
        console.log('[extractor] navigating to workflowUrl')
        await page.goto(workflowUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
      }

      // Wait for table to load
      await page.waitForTimeout(3000)
      for (let i = 0; i < 8; i++) {
        const state = await page.evaluate(() => {
          const table = document.querySelector('table.lui_listview_columntable_table')
          if (!table) return { found: false }
          const rows = table.querySelectorAll('tr')
          return { found: true, rows: rows.length }
        })
        if (state.found) break
        await page.waitForTimeout(1500)
      }
    }

    // Step 4: Extract data from all pages
    const allWorkflows = await extractAllPages(page, platform)

    console.log('[extractor] extraction done, workflows:', allWorkflows.length)
    // Debug: log first 5 items
    allWorkflows.slice(0, 5).forEach((w, i) => {
      console.log(`[extractor] [${i}] title="${w.title?.substring(0, 50)}" fdId="${w.fdId || 'EMPTY'}"`)
    })
    await browser.close()
    return { workflows: allWorkflows }
  } catch (err: any) {
    console.error('[extractor] error:', err.message)
    try { await browser.close() } catch { /* ignore */ }
    return { workflows: [], error: err.message }
  }
}

// ---- Login logic ----
async function performLogin(page: Page, account: Account): Promise<void> {
  console.log('[performLogin] starting login for:', account.username)
  console.log('[performLogin] page URL:', page.url())

  // Try common login form selectors
  const usernameSelectors = [
    'input[placeholder*="工号"]',
    'input[placeholder*="用户名"]',
    'input[placeholder*="username" i]',
    'input[placeholder*="账号" i]',
    'input[name="username"]',
    'input[name="j_username"]',
    'input[name="account"]',
    'input[name="loginName"]',
    'input[type="text"]',
    'input[type="tel"]'
  ]

  const passwordSelectors = [
    'input[placeholder*="密码"]',
    'input[placeholder*="password" i]',
    'input[name="password"]',
    'input[name="j_password"]',
    'input[type="password"]'
  ]

  // Find username field
  let usernameInput = null
  for (const sel of usernameSelectors) {
    try {
      const el = await page.$(sel)
      if (el && await el.isVisible()) {
        usernameInput = el
        console.log('[performLogin] found username input:', sel)
        break
      }
    } catch { /* selector invalid, try next */ }
  }

  // Find password field
  let passwordInput = null
  for (const sel of passwordSelectors) {
    try {
      const el = await page.$(sel)
      if (el && await el.isVisible()) {
        passwordInput = el
        console.log('[performLogin] found password input:', sel)
        break
      }
    } catch { /* selector invalid, try next */ }
  }

  if (!usernameInput || !passwordInput) {
    console.warn('[performLogin] login form not found, skipping login')
    return
  }

  // Detect platform type
  const pageUrl = page.url()
  const isBeisen = pageUrl.includes('italent.cn')

  if (isBeisen) {
    // ---- 北森: switch to password mode ----
    try {
      const switchBtn = page.locator('text=切换到密码验证')
      if (await switchBtn.isVisible({ timeout: 2000 })) {
        await switchBtn.click()
        console.log('[performLogin] clicked 切换到密码验证')
        await page.waitForTimeout(2000)
        usernameInput = await page.$('input[placeholder*="用户名"]') || await page.$('input[type="text"]')
        passwordInput = await page.$('input[type="password"]')
      }
    } catch { /* not found, skip */ }

    // Use nativeInputValueSetter (same as embedded browser, more reliable)
    await page.evaluate(({ user, pass }) => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
      function setVal(el: HTMLInputElement, val: string) {
        el.focus()
        nativeSetter.call(el, val)
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
        el.dispatchEvent(new Event('blur', { bubbles: true }))
      }
      const u = document.querySelector('input[placeholder*="用户名"], input[type="text"]') as HTMLInputElement
      const p = document.querySelector('input[type="password"]') as HTMLInputElement
      if (u) setVal(u, user)
      if (p) setVal(p, pass)
    }, { user: account.username, pass: account.password })
    console.log('[performLogin] filled via nativeInputValueSetter (北森)')
  } else {
    // ---- OA: fill() 快速填充 ----
    await usernameInput.fill(account.username)
    await passwordInput.fill(account.password)
    console.log('[performLogin] filled via fill() (fast)')
  }

  await page.waitForTimeout(500)

  // Check "agree to terms" checkbox
  try {
    const checkboxLoc = page.locator('input[type="checkbox"]').first()
    if (await checkboxLoc.isVisible({ timeout: 1000 })) {
      const isChecked = await checkboxLoc.isChecked()
      if (!isChecked) {
        await checkboxLoc.check({ force: true })
        console.log('[performLogin] checkbox checked')
      }
    }
  } catch { /* no checkbox */ }

  // Submit login
  if (isBeisen) {
    // 北森: press Enter
    if (passwordInput) await passwordInput.press('Enter')
    console.log('[performLogin] pressed Enter (北森)')
    await page.waitForTimeout(5000)
  } else {
    // OA: try button click, fallback to Enter
    let clicked = false
    try {
      const loginBtn = page.locator('button:has-text("登录"), input[type="submit"], button[type="submit"]').first()
      if (await loginBtn.isVisible({ timeout: 1000 })) {
        await loginBtn.click()
        clicked = true
        console.log('[performLogin] clicked login button (OA)')
      }
    } catch { /* not found */ }
    if (!clicked && passwordInput) {
      await passwordInput.press('Enter')
      console.log('[performLogin] pressed Enter (OA fallback)')
    }
    await page.waitForTimeout(2000)
  }

  console.log('[performLogin] after login, URL:', page.url())
}

// ---- Multi-page extraction ----
async function extractAllPages(
  page: Page,
  platform: Platform
): Promise<Omit<Workflow, 'id' | 'extractedAt' | 'llmSummary'>[]> {
  const allWorkflows: Omit<Workflow, 'id' | 'extractedAt' | 'llmSummary'>[] = []
  const maxPages = 50 // safety limit
  let pageNum = 0

  while (pageNum < maxPages) {
    pageNum++
    // Wait longer for SPA content to render (especially 北森 etc.)
    await page.waitForTimeout(3000)

    const pageData = await extractPageData(page, platform.urlPattern)

    if (pageData.length === 0) break

    allWorkflows.push(...pageData.map(w => ({ ...w, platformId: platform.id })))

    // Try to go to next page
    const hasNext = await goToNextPage(page)
    if (!hasNext) break
  }

  return allWorkflows
}

// ---- Extract workflow data from current page ----
async function extractPageData(
  page: Page,
  urlPattern: string
): Promise<Omit<Workflow, 'id' | 'extractedAt' | 'llmSummary'>[]> {
  // Try main page first, then iframes
  const targets: Page[] = [page]

  // Add all iframes as potential targets
  for (const frame of page.frames()) {
    if (frame !== page.mainFrame()) {
      targets.push(frame as unknown as Page)
    }
  }

  for (const target of targets) {
    // Strategy 1: table-based (Landray EKP, etc.)
    // Only use specific selectors, NOT generic 'table' (too broad, matches wrong tables)
    const tableSelectors = [
      'table.lui_listview_columntable_table',
      'table.listview_table',
      'table.dataTable',
      '.listview-table table',
      'table[id*="list"]'
    ]

    for (const tableSelector of tableSelectors) {
      try {
        const data = await target.evaluate(
          ({ selector, pattern }: { selector: string; pattern: string }) => {
            const tables = document.querySelectorAll(selector)
            const allResults: any[] = []

            for (let t = 0; t < tables.length; t++) {
              const rows = tables[t].querySelectorAll('tr')
              if (rows.length < 2) continue

              for (let i = 1; i < rows.length; i++) {
                const cells = rows[i].querySelectorAll('td')
                if (cells.length < 2) continue

                const checkbox = cells[0]?.querySelector('input[type=checkbox]') as HTMLInputElement | null
                const fdId = checkbox?.value || cells[0]?.getAttribute('data-id') || ''

                const getText = (idx: number) => {
                  const el = cells[idx]
                  return el ? (el.innerText || '').trim().replace(/\s+/g, ' ') : ''
                }

                allResults.push({
                  fdId,
                  title: getText(2) || getText(1),
                  num: getText(3) || getText(2),
                  cdate: getText(4) || getText(3),
                  edate: getText(5) || getText(4),
                  status: getText(6) || getText(5),
                  step: getText(7) || getText(6),
                  handler: getText(8) || getText(7),
                  url: pattern.replace('{fdId}', fdId)
                })
              }
            }

            return allResults
          },
          { selector: tableSelector, pattern: urlPattern }
        )

        if (data.length > 0) {
          return data.map((item: any) => mapToWorkflow(item))
        }
      } catch { /* frame may not be accessible */ }
    }

    // Strategy 2: SPA list items (div-based, 北森 etc.)
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
      try {
        const data = await target.evaluate(
          ({ selector, pattern }: { selector: string; pattern: string }) => {
            const items = document.querySelectorAll(selector)
            if (items.length < 1) return []

            const results: any[] = []
            for (let i = 0; i < items.length; i++) {
              const el = items[i]
              const text = ((el as HTMLElement).innerText || '').trim()
              if (!text || text.length < 2) continue

              // Try to extract title from first meaningful text
              const lines = text.split('\n').map((l: string) => l.trim()).filter(Boolean)
              const title = lines[0] || ''
              if (!title) continue

              // Try to find a link
              const link = el.querySelector('a') as HTMLAnchorElement | null
              const href = link?.href || ''

              // Try to extract ID from data attributes
              const id = el.getAttribute('data-id') || el.getAttribute('data-key') || el.id || ''

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
              })
            }

            return results
          },
          { selector: listSelector, pattern: urlPattern }
        )

        if (data.length > 0) {
          return data.map((item: any) => mapToWorkflow(item))
        }
      } catch { /* frame may not be accessible */ }
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
async function goToNextPage(page: Page): Promise<boolean> {
  try {
    // Look for pagination info
    const pageInfo = await page.evaluate(() => {
      // Check for page indicator like "1/5"
      const pageTexts = document.querySelectorAll('*')
      for (let i = 0; i < pageTexts.length; i++) {
        const text = (pageTexts[i].textContent || '').trim()
        const match = text.match(/^(\d+)\s*\/\s*(\d+)$/)
        if (match) {
          return { current: parseInt(match[1]), total: parseInt(match[2]) }
        }
      }
      return null
    })

    // If we found page info and we're on the last page, stop
    if (pageInfo && pageInfo.current >= pageInfo.total) {
      return false
    }

    // Try common "next page" selectors
    const nextSelectors = [
      'a:has-text("下一页")',
      'a:has-text("下页")',
      'a:has-text(">")',
      '.pagination .next:not(.disabled)',
      'a[title="下一页"]',
      'a[aria-label="Next"]',
      'li.next > a'
    ]

    for (const sel of nextSelectors) {
      try {
        const btn = await page.$(sel)
        if (btn) {
          const isDisabled = await btn.evaluate(el => {
            return el.classList.contains('disabled') ||
                   el.getAttribute('disabled') !== null ||
                   (el.parentElement?.classList.contains('disabled') || false)
          })
          if (!isDisabled) {
            await btn.click()
            await page.waitForTimeout(1500)
            return true
          }
        }
      } catch { /* try next selector */ }
    }

    return false
  } catch {
    return false
  }
}
