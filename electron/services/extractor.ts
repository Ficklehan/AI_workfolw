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
    headless: true,
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

    // Step 3: Navigate to workflow list by clicking the view tab
    await page.waitForTimeout(1500)
    console.log('[extractor] after login URL:', page.url().substring(0, 100))

    // Determine target view from URL hash
    const workflowUrl = platform.workflowUrl.replace(/ticket=[^&#]+&?/, '')
    const hashIdx = workflowUrl.indexOf('#')
    const targetHash = hashIdx > 0 ? workflowUrl.substring(hashIdx + 1) : ''

    let viewName = ''
    if (targetHash.includes('listApproval') || targetHash.includes('mydoc=approval')) viewName = '待办'
    else if (targetHash.includes('listCreate') || targetHash.includes('mydoc=create')) viewName = '我发起的'
    else if (targetHash.includes('listReviewed') || targetHash.includes('mydoc=reviewed')) viewName = '我已审的'

    if (viewName) {
      console.log('[extractor] clicking view tab:', viewName)
      // Find and click the navigation link for the target view
      const clickResult = await page.evaluate((name) => {
        // Try finding links with href containing the view key
        const viewKey = name === '待办' ? 'listApproval' :
                        name === '我发起的' ? 'listCreate' :
                        name === '我已审的' ? 'listReviewed' : ''
        // Method 1: Find by href
        if (viewKey) {
          const links = document.querySelectorAll('a[href*="' + viewKey + '"]')
          if (links.length > 0) { (links[0] as HTMLElement).click(); return 'href-link: ' + viewKey }
        }
        // Method 2: Find by exact text
        const allEls = document.querySelectorAll('a, li, span, div')
        for (let i = 0; i < allEls.length; i++) {
          const text = (allEls[i].textContent || '').trim()
          if (text === name) { (allEls[i] as HTMLElement).click(); return 'text: ' + name }
        }
        return 'not-found'
      }, viewName)
      console.log('[extractor] tab click result:', clickResult)
      await page.waitForTimeout(3000)
    } else {
      await page.goto(workflowUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
      await page.waitForTimeout(3000)
    }

    // Step 4: Extract data from all pages
    const allWorkflows = await extractAllPages(page, platform)

    console.log('[extractor] extraction done, workflows:', allWorkflows.length)
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
    // ---- 北森: switch to password mode + keyboard simulation ----
    try {
      const switchBtn = page.locator('text=切换到密码验证')
      if (await switchBtn.isVisible({ timeout: 2000 })) {
        await switchBtn.click()
        console.log('[performLogin] clicked 切换到密码验证')
        await page.waitForTimeout(2000)
        usernameInput = await page.$('input[placeholder*="用户名"]') || await page.$('input[type="text"]')
        passwordInput = await page.$('input[type="password"]')
        if (usernameInput) console.log('[performLogin] re-found username after mode switch')
        if (passwordInput) console.log('[performLogin] re-found password after mode switch')
      }
    } catch { /* not found, skip */ }

    // Keyboard simulation (React compatible, 北森 must use this)
    if (usernameInput) {
      await usernameInput.click()
      await page.waitForTimeout(100)
      await page.keyboard.down('Meta')
      await page.keyboard.press('a')
      await page.keyboard.up('Meta')
      await page.keyboard.press('Backspace')
      await page.waitForTimeout(100)
      await page.keyboard.type(account.username, { delay: 80 })
    }
    if (passwordInput) {
      await passwordInput.click()
      await page.waitForTimeout(100)
      await page.keyboard.down('Meta')
      await page.keyboard.press('a')
      await page.keyboard.up('Meta')
      await page.keyboard.press('Backspace')
      await page.waitForTimeout(100)
      await page.keyboard.type(account.password, { delay: 80 })
    }
    console.log('[performLogin] filled via keyboard simulation (北森)')
  } else {
    // ---- OA 等标准系统: fill() 快速填充 ----
    await usernameInput.fill(account.username)
    await passwordInput.fill(account.password)
    console.log('[performLogin] filled via fill() (fast)')
  }

  await page.waitForTimeout(300)

  // Check "agree to terms" checkbox using Playwright locator
  try {
    const checkboxLoc = page.locator('input[type="checkbox"]').first()
    if (await checkboxLoc.isVisible({ timeout: 1000 })) {
      const isChecked = await checkboxLoc.isChecked()
      if (!isChecked) {
        await checkboxLoc.check({ force: true })
        console.log('[performLogin] checkbox checked via Playwright')
      } else {
        console.log('[performLogin] checkbox already checked')
      }
    }
  } catch (err) {
    console.warn('[performLogin] checkbox error:', err)
  }

  // Submit login
  if (isBeisen) {
    // 北森: press Enter (button click unreliable)
    console.log('[performLogin] pressing Enter to submit (北森)')
    if (passwordInput) await passwordInput.press('Enter')
    await page.waitForTimeout(5000)
  } else {
    // OA: try button click first, fallback to Enter
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
