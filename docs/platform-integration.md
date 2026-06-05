# 平台接入技术文档

本文档记录 WorkflowAI 对各 OA 平台的登录和数据提取实现方式。

---

## 目录

1. [架构总览](#架构总览)
2. [蓝凌 EKP](#蓝凌-ekp)
3. [北森 iTalent](#北森-italent)
4. [新增平台接入指南](#新增平台接入指南)
5. [流程详情打开（内嵌浏览器）](#流程详情打开内嵌浏览器)
6. [已踩坑点](#已踩坑点)

---

## 架构总览

### 提取流程

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐     ┌──────────────┐
│  启动浏览器   │ ──→ │  SSO 登录     │ ──→ │  跳转待办列表   │ ──→ │  提取流程数据  │
│  (Playwright)│     │  (performLogin)│     │  (workflowUrl) │     │  (分页遍历)   │
└─────────────┘     └──────────────┘     └───────────────┘     └──────────────┘
```

### 关键文件

| 文件 | 职责 |
|---|---|
| `electron/services/extractor.ts` | Playwright 提取器：登录 + 数据抓取 |
| `electron/main.ts` | IPC handler，内嵌浏览器打开流程 |
| `electron/db.ts` | 数据存储，session 持久化 |

### Session 管理

- **提取器**：每次提取用全新的浏览器实例（`chromium.launch()`），不复用 session
- **内嵌浏览器**：按账号持久化 session（`persist:account-${accountId}`），同一账号复用登录态

---

## 蓝凌 EKP

### 平台特征

- SSO 登录页：`https://sso.ztn.cn/cas/login?service=...`
- 待办列表：`https://oawf.ztn.cn/km/review/index.jsp`
- 数据在 HTML `<table>` 中，class 为 `lui_listview_columntable_table`

### 登录实现

```typescript
// 1. 查找输入框
usernameInput = await page.$('input[placeholder*="工号"]')
passwordInput = await page.$('input[type="password"]')

// 2. 填充凭证（Playwright fill 自动触发事件）
await usernameInput.fill(account.username)
await passwordInput.fill(account.password)

// 3. 点击登录按钮
await page.locator('text=登录').click()

// 4. 等待跳转
await page.waitForTimeout(3000)
```

### 数据提取

```typescript
// 表格选择器优先级
const tableSelectors = [
  'table.lui_listview_columntable_table',  // 蓝凌 EKP 专用
  'table.listview_table',
  'table.dataTable',
  'table[id*="list"]',
  'table'                                    // 兜底
]

// 列映射（EKP 典型结构）
// cells[0]: checkbox（含 fdId）
// cells[1]: 标题
// cells[2]: 编号
// cells[3]: 创建时间
// cells[4]: 结束时间
// cells[5]: 状态
// cells[6]: 当前环节
// cells[7]: 当前处理人
```

### 分页

```typescript
// 查找 "下一页" 链接
const nextSelectors = [
  'a:has-text("下一页")',
  'a[title="下一页"]',
  '.pagination .next:not(.disabled)',
  'li.next > a'
]
```

### 配置示例

| 字段 | 值 |
|---|---|
| 平台名称 | `oa` |
| SSO 地址 | `https://sso.ztn.cn/cas/login?service=https%3A%2F%2Foawf.ztn.cn...` |
| 流程列表地址 | `https://oawf.ztn.cn/km/review/index.jsp?j_module=true...` |
| URL 模板 | `https://oawf.ztn.cn/km/review/km_review_main/kmReviewMain.do?method=view&fdId={fdId}` |
| 平台类型 | `landray` |

---

## 北森 iTalent

### 平台特征

- 登录页：`https://www.italent.cn/Login?entrytype=1&tid=...`
- 主页：`https://www.italent.cn/portal/iTalentHome/...`
- SPA 架构（React），数据在 iframe 或 div 列表中
- **默认登录方式是「手机号+验证码」，需要切换到「密码登录」**

### 登录实现（关键差异）

```typescript
// 1. 查找输入框
usernameInput = await page.$('input[placeholder*="用户名"]')
passwordInput = await page.$('input[type="password"]')

// 2. ★ 关键：切换到密码登录模式 ★
//    北森默认是「手机号+验证码」，必须先点「切换到密码验证」
const switchBtn = page.locator('text=切换到密码验证')
if (await switchBtn.isVisible({ timeout: 2000 })) {
  await switchBtn.click()
  await page.waitForTimeout(2000)
  // DOM 变化后重新查找输入框
  usernameInput = await page.$('input[placeholder*="用户名"]')
  passwordInput = await page.$('input[type="password"]')
}

// 3. ★ 关键：用键盘模拟输入（不用 fill）★
//    React 受控组件对 page.fill() 不响应
await usernameInput.click()
await page.keyboard.down('Meta')
await page.keyboard.press('a')      // 全选
await page.keyboard.up('Meta')
await page.keyboard.press('Backspace') // 清空
await page.keyboard.type(account.username, { delay: 80 }) // 逐字符输入

// 4. ★ 关键：用 Playwright locator 勾选 checkbox ★
const checkboxLoc = page.locator('input[type="checkbox"]').first()
await checkboxLoc.check({ force: true })

// 5. ★ 关键：用 Enter 提交（不用点击按钮）★
//    page.locator('text=登录') 会匹配到「账号登录」标签而非按钮
await passwordInput.press('Enter')

// 6. 等待跳转
await page.waitForTimeout(5000)
```

### 数据提取

```typescript
// 北森用 SPA div 列表，不是 table
const listSelectors = [
  '[class*="todo"] [class*="item"]',
  '[class*="task"] [class*="item"]',
  '[class*="list"] [class*="item"]',
  '[class*="card"]',
  '.ant-table-row',
  '.el-table__row',
  '[role="row"]'
]

// 也支持 iframe 内提取
for (const frame of page.frames()) {
  // 在每个 frame 里尝试提取
}
```

### 配置示例

| 字段 | 值 |
|---|---|
| 平台名称 | `北森系统` |
| SSO 地址 | `https://www.italent.cn/Login?entrytype=1&tid=109025&...` |
| 流程列表地址 | `https://www.italent.cn/portal/convoy/BeiseniTalent?quark_s=...` |
| URL 模板 | `https://www.italent.cn/portal/iTalentHome/?quark_s=...#{fdId}` |
| 平台类型 | `landray`（暂未区分） |

---

## 新增平台接入指南

### 步骤 1：分析登录页

1. 用浏览器打开 SSO 登录页，F12 检查：
   - 用户名输入框的选择器（placeholder/name/type）
   - 密码输入框的选择器
   - 登录按钮的选择器
   - 是否有 checkbox（同意协议等）
   - 是否需要切换登录模式

2. 在 `performLogin()` 中添加对应的选择器：

```typescript
const usernameSelectors = [
  // 已有选择器...
  'input[placeholder*="你的平台特征"]',  // 新增
]
```

### 步骤 2：分析数据页

1. 打开待办列表页，检查：
   - 数据在 `table` 还是 `div` 列表中？
   - 是否在 `iframe` 内？
   - 列的顺序（标题、编号、时间、状态等）
   - 分页方式

2. 在 `extractPageData()` 中添加对应的选择器：

```typescript
const tableSelectors = [
  // 已有选择器...
  'table.your-platform-class',  // 新增
]
```

### 步骤 3：特殊处理

如果平台有特殊行为（如北森的模式切换），在 `performLogin()` 中添加：

```typescript
// 示例：平台需要先点击某个按钮
const specialBtn = page.locator('text=特殊按钮')
if (await specialBtn.isVisible({ timeout: 2000 })) {
  await specialBtn.click()
  await page.waitForTimeout(2000)
}
```

### 步骤 4：配置

在应用的 **设置 → 账号与平台** 中添加：
- 平台名称
- SSO 登录地址
- 流程列表地址
- URL 模板（`{fdId}` 为流程 ID 占位符）

---

## 流程详情打开（内嵌浏览器）

### 实现方式

用 Electron 内置 `BrowserWindow` 替代系统浏览器，每个账号独立 session。

```typescript
// 按账号持久化 session
const ses = session.fromPartition(`persist:account-${account.id}`)

const win = new BrowserWindow({
  width: 1280, height: 800,
  title: `${account.name} - 流程详情`,
  webPreferences: { session: ses, contextIsolation: true, nodeIntegration: false }
})

// 先尝试直接打开流程 URL
win.loadURL(workflowUrl)

// 如果被重定向到登录页，自动注入凭证
win.webContents.once('did-finish-load', () => {
  const currentUrl = win.webContents.getURL()
  if (isLoginPage(currentUrl)) {
    // 注入登录脚本（与提取器类似的逻辑）
    injectLoginScript(win, account)
  }
})
```

### Session 隔离

| 场景 | Session 策略 |
|---|---|
| 提取器 | 每次全新浏览器（`chromium.launch()`） |
| 内嵌浏览器 | `persist:account-${accountId}`（按账号持久化） |
| 不同账号 | 完全隔离，cookies 不共享 |
| 同一账号 | 复用 session，不需重复登录 |

---

## 已踩坑点

### 1. React 受控组件不响应 `page.fill()`

**问题**：Playwright 的 `page.fill()` 直接设置 DOM value，但 React 的 state 不更新。

**解决**：用 `page.keyboard.type()` 逐字符输入，触发完整的键盘事件链。

```typescript
// ❌ 不生效
await input.fill('value')

// ✅ 生效
await input.click()
await page.keyboard.type('value', { delay: 80 })
```

### 2. `text=登录` 匹配到标签而非按钮

**问题**：`page.locator('text=登录')` 匹配到了「账号登录」tab 标签，而不是登录提交按钮。

**解决**：用 `passwordInput.press('Enter')` 直接提交表单。

```typescript
// ❌ 匹配到 tab 标签
await page.locator('text=登录').click()

// ✅ 直接按 Enter
await passwordInput.press('Enter')
```

### 3. `page.evaluate` 返回的元素不能调用 `.click()`

**问题**：`page.evaluate(() => el)` 返回的是序列化对象，不是 Playwright ElementHandle。

**解决**：在 `evaluate` 内部直接点击，或用 Playwright locator。

```typescript
// ❌ 报错
const btn = await page.evaluate(() => document.querySelector('button'))
btn.click()  // TypeError: not a function

// ✅ 在 evaluate 内部点击
await page.evaluate(() => { document.querySelector('button').click() })

// ✅ 用 Playwright locator
await page.locator('button').click()
```

### 4. NodeListOf 不能用 `for...of` 遍历

**问题**：TypeScript 的 `ES2020` target 不支持 `NodeListOf[Symbol.iterator]`。

**解决**：用索引循环。

```typescript
// ❌ 编译报错
for (const el of document.querySelectorAll('div')) {}

// ✅ 用索引
const els = document.querySelectorAll('div')
for (let i = 0; i < els.length; i++) {}
```

### 5. 北森默认是验证码登录

**问题**：北森登录页默认是「手机号+验证码」模式，不是「账号+密码」。

**解决**：检测到「切换到密码验证」按钮时，先点击切换模式。

```typescript
const switchBtn = page.locator('text=切换到密码验证')
if (await switchBtn.isVisible({ timeout: 2000 })) {
  await switchBtn.click()
  await page.waitForTimeout(2000)
  // 重新查找输入框（DOM 可能变化）
}
```

### 6. `shell.openExternal` 安全风险

**问题**：未校验 URL 协议，可能执行 `file://` 或 `javascript:`。

**解决**：校验 `https?://` 协议。

```typescript
const parsed = new URL(url)
if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
  shell.openExternal(url)
}
```
