# WorkflowAI — 智能流程待办管理

OA 流程待办自动提取与 AI 智能分析桌面应用。

## 功能

- **自动提取待办流程** — 通过 Playwright 浏览器自动化，从 OA 系统（蓝凌 EKP 等）自动抓取待办流程数据
- **AI 智能摘要** — 接入 OpenAI 兼容 API，对流程进行摘要分析并给出建议操作
- **多账号多平台** — 支持配置多个 OA 账号和平台
- **定时自动提取** — 可配置定时任务，自动获取最新流程
- **凭证加密存储** — 使用 Electron safeStorage 加密存储密码和 API Key

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面壳 | Electron 42 |
| 前端 | React 18 + TypeScript + Tailwind CSS 4 |
| 状态管理 | Zustand |
| 浏览器自动化 | Playwright |
| LLM | OpenAI 兼容 API |
| 数据存储 | JSON 文件 |

## 开发

```bash
# 安装依赖
npm install

# 安装 Playwright 浏览器
npx playwright install chromium

# 开发模式（前端 + Electron）
npm run dev:app

# 构建
npm run build

# 打包 macOS DMG
npm run pack
```

## 项目结构

```
electron/           # Electron 主进程
  main.ts           # 入口、IPC 注册、编排
  preload.ts        # contextBridge 暴露 API
  db.ts             # JSON 文件数据库 + 加密
  services/
    extractor.ts    # Playwright 流程提取
    llm.ts          # LLM API 调用
    scheduler.ts    # 定时任务
src/                # React 前端
  pages/
    Dashboard.tsx   # 工作台（流程列表）
    Settings.tsx    # 设置（账号/平台/LLM/定时）
    Logs.tsx        # 执行日志
  store/            # Zustand 状态
types/              # 共享 TypeScript 类型
```

## 配置说明

1. **账号** — OA 系统的登录工号和密码
2. **平台** — OA 系统的 SSO 地址、流程列表地址、URL 模板
3. **LLM** — OpenAI 兼容 API 的地址、Key、模型名
4. **定时** — 自动提取的开关和间隔时间
