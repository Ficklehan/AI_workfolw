import { chromium, type Page } from 'playwright'
import type { Account, Platform, Workflow, ApprovalResult } from '../../types'

/**
 * Approve or reject a workflow in the OA system.
 * Reuses the same login flow as extractor.ts, then navigates to the workflow detail page.
 */
export async function approveWorkflow(
  account: Account,
  platform: Platform,
  workflow: Workflow,
  action: 'approve' | 'reject',
  comment?: string
): Promise<ApprovalResult> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  })

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      locale: 'zh-CN'
    })
    const page = await context.newPage()

    // Step 1: Login (same as extractor)
    await page.goto(platform.ssoUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
    await page.waitForTimeout(2000)
    await performLogin(page, account)

    // Step 2: Navigate to workflow detail page
    await page.waitForTimeout(1500)
    const detailUrl = workflow.url
    console.log('[approver] navigating to:', detailUrl.substring(0, 120))
    await page.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForTimeout(4000)

    // Step 3: Fill comment if provided
    if (comment) {
      await fillApprovalComment(page, platform.platformType, comment)
    }

    // Step 4: Click approve/reject button
    const result = await clickApprovalButton(page, platform.platformType, action)

    await browser.close()
    return result
  } catch (err: any) {
    console.error('[approver] error:', err.message)
    try { await browser.close() } catch { /* ignore */ }
    return { success: false, message: err.message }
  }
}

// ---- Login (copied from extractor, same logic) ----
async function performLogin(page: Page, account: Account): Promise<void> {
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

  let usernameInput = null
  for (const sel of usernameSelectors) {
    try {
      const el = await page.$(sel)
      if (el && await el.isVisible()) { usernameInput = el; break }
    } catch { /* skip */ }
  }

  let passwordInput = null
  for (const sel of passwordSelectors) {
    try {
      const el = await page.$(sel)
      if (el && await el.isVisible()) { passwordInput = el; break }
    } catch { /* skip */ }
  }

  if (!usernameInput || !passwordInput) return

  const pageUrl = page.url()
  const isBeisen = pageUrl.includes('italent.cn')

  if (isBeisen) {
    try {
      const switchBtn = page.locator('text=切换到密码验证')
      if (await switchBtn.isVisible({ timeout: 2000 })) {
        await switchBtn.click()
        await page.waitForTimeout(2000)
        usernameInput = await page.$('input[placeholder*="用户名"]') || await page.$('input[type="text"]')
        passwordInput = await page.$('input[type="password"]')
      }
    } catch { /* skip */ }

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
  } else {
    await usernameInput.fill(account.username)
    await passwordInput.fill(account.password)
  }

  await page.waitForTimeout(300)

  try {
    const checkboxLoc = page.locator('input[type="checkbox"]').first()
    if (await checkboxLoc.isVisible({ timeout: 1000 })) {
      const isChecked = await checkboxLoc.isChecked()
      if (!isChecked) await checkboxLoc.check({ force: true })
    }
  } catch { /* skip */ }

  if (isBeisen) {
    if (passwordInput) await passwordInput.press('Enter')
    await page.waitForTimeout(5000)
  } else {
    let clicked = false
    try {
      const loginBtn = page.locator('button:has-text("登录"), input[type="submit"], button[type="submit"]').first()
      if (await loginBtn.isVisible({ timeout: 1000 })) {
        await loginBtn.click()
        clicked = true
      }
    } catch { /* skip */ }
    if (!clicked && passwordInput) await passwordInput.press('Enter')
    await page.waitForTimeout(2000)
  }
}

// ---- Fill approval comment ----
async function fillApprovalComment(page: Page, platformType: string, comment: string): Promise<void> {
  // Try common comment/textarea selectors across both platforms
  const commentSelectors = [
    // 蓝凌 EKP
    'textarea[name*="comment"]',
    'textarea[name*="opinion"]',
    'textarea[name*="remark"]',
    'textarea[placeholder*="意见"]',
    'textarea[placeholder*="审批"]',
    '#approvalOpinion',
    '.approval-opinion textarea',
    // 北森 / generic
    'textarea.ant-input',
    '[contenteditable="true"]',
    'textarea'
  ]

  for (const sel of commentSelectors) {
    try {
      const el = await page.$(sel)
      if (el && await el.isVisible()) {
        await el.click()
        await page.waitForTimeout(200)
        // Clear existing text
        await page.keyboard.down('Meta')
        await page.keyboard.press('a')
        await page.keyboard.up('Meta')
        await page.keyboard.press('Backspace')
        await page.waitForTimeout(100)
        // Type comment
        if (sel.includes('contenteditable')) {
          await page.keyboard.type(comment, { delay: 30 })
        } else {
          await el.fill(comment)
        }
        console.log('[approver] comment filled via:', sel)
        return
      }
    } catch { /* try next */ }
  }

  console.warn('[approver] comment field not found, skipping')
}

// ---- Click approve/reject button ----
async function clickApprovalButton(
  page: Page,
  platformType: string,
  action: 'approve' | 'reject'
): Promise<ApprovalResult> {
  const isBeisen = platformType === 'beisen'

  if (isBeisen) {
    return clickBeisenApproval(page, action)
  } else {
    return clickEkpApproval(page, action)
  }
}

// ---- 蓝凌 EKP approval ----
async function clickEkpApproval(page: Page, action: 'approve' | 'reject'): Promise<ApprovalResult> {
  // EKP uses various button texts and sometimes iframes
  const approveTexts = ['同意', '审批通过', '通过', '批准']
  const rejectTexts = ['不同意', '驳回', '退回', '拒绝', '否决']

  const targetTexts = action === 'approve' ? approveTexts : rejectTexts

  // Search in main page and iframes
  const targets: Page[] = [page]
  for (const frame of page.frames()) {
    if (frame !== page.mainFrame()) targets.push(frame as unknown as Page)
  }

  for (const target of targets) {
    for (const text of targetTexts) {
      try {
        // Try button/a with exact text
        const btn = await target.evaluate((t: string) => {
          const candidates = document.querySelectorAll('button, a, input[type="button"], input[type="submit"], span, div')
          for (let i = 0; i < candidates.length; i++) {
            const el = candidates[i] as HTMLElement
            const elText = (el.textContent || '').trim()
            if (elText === t || elText.includes(t)) {
              // Skip elements that are too large (likely containers)
              if (el.offsetWidth < 300 && el.offsetHeight < 100 && el.offsetParent !== null) {
                el.click()
                return 'clicked: ' + t
              }
            }
          }
          return 'not-found'
        }, text)

        if (btn.startsWith('clicked')) {
          console.log('[approver] EKP button clicked:', text)
          await page.waitForTimeout(2000)
          await handleConfirmation(page)
          await page.waitForTimeout(2000)
          return { success: true, message: action === 'approve' ? '已同意' : '已驳回' }
        }
      } catch { /* try next */ }
    }
  }

  return { success: false, message: '未找到审批按钮，请检查流程页面' }
}

// ---- 北森 approval ----
async function clickBeisenApproval(page: Page, action: 'approve' | 'reject'): Promise<ApprovalResult> {
  const approveTexts = ['同意', '通过', '批准', '审批通过']
  const rejectTexts = ['不同意', '驳回', '退回', '拒绝']

  const targetTexts = action === 'approve' ? approveTexts : rejectTexts

  for (const text of targetTexts) {
    try {
      // 北森 uses Ant Design buttons
      const btn = await page.evaluate((t: string) => {
        const candidates = document.querySelectorAll('button, .ant-btn, a, span')
        for (let i = 0; i < candidates.length; i++) {
          const el = candidates[i] as HTMLElement
          const elText = (el.textContent || '').trim()
          if (elText === t || elText.includes(t)) {
            if (el.offsetWidth > 0 && el.offsetHeight > 0 && el.offsetParent !== null) {
              el.click()
              return 'clicked: ' + t
            }
          }
        }
        return 'not-found'
      }, text)

      if (btn.startsWith('clicked')) {
        console.log('[approver] 北森 button clicked:', text)
        await page.waitForTimeout(2000)
        await handleConfirmation(page)
        await page.waitForTimeout(2000)
        return { success: true, message: action === 'approve' ? '已同意' : '已驳回' }
      }
    } catch { /* try next */ }
  }

  return { success: false, message: '未找到审批按钮，请检查流程页面' }
}

// ---- Handle confirmation dialogs ----
async function handleConfirmation(page: Page): Promise<void> {
  // Common confirmation button texts
  const confirmTexts = ['确定', '确认', '是', '提交', 'OK', 'ok']

  // Search in all frames
  const targets: Page[] = [page]
  for (const frame of page.frames()) {
    if (frame !== page.mainFrame()) targets.push(frame as unknown as Page)
  }

  for (const target of targets) {
    for (const text of confirmTexts) {
      try {
        const found = await target.evaluate((t: string) => {
          const candidates = document.querySelectorAll('button, .ant-btn, a, input[type="button"]')
          for (let i = 0; i < candidates.length; i++) {
            const el = candidates[i] as HTMLElement
            const elText = (el.textContent || '').trim()
            // Check for modal/overlay context (confirm dialog)
            const isInModal = el.closest('.ant-modal') || el.closest('.modal') || el.closest('[role="dialog"]')
            if (isInModal && (elText === t || elText.includes(t))) {
              el.click()
              return 'confirmed'
            }
          }
          return 'not-found'
        }, text)

        if (found === 'confirmed') {
          console.log('[approver] confirmation clicked:', text)
          await page.waitForTimeout(1500)
          return
        }
      } catch { /* try next */ }
    }
  }
}
