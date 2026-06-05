import https from 'https'
import http from 'http'
import type { LLMConfig, Workflow } from '../../types'

export async function chatCompletion(config: LLMConfig, messages: { role: string; content: string }[]): Promise<string> {
  const maxRetries = 3
  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await _doRequest(config, messages)
    } catch (err: any) {
      lastError = err
      // Don't retry on client errors (4xx except 429)
      const msg = err.message || ''
      if (msg.includes('400') || msg.includes('401') || msg.includes('403')) throw err
      // Wait before retry (exponential backoff)
      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
      }
    }
  }
  throw lastError || new Error('LLM request failed after retries')
}

function _doRequest(config: LLMConfig, messages: { role: string; content: string }[]): Promise<string> {
  const url = new URL(config.baseUrl.replace(/\/$/, '') + '/chat/completions')
  const isHttps = url.protocol === 'https:'
  const mod = isHttps ? https : http

  const body = JSON.stringify({
    model: config.modelName,
    messages,
    temperature: 0.3,
    max_tokens: 2000
  })

  return new Promise((resolve, reject) => {
    const req = mod.request({
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          if (json.error) reject(new Error(json.error.message || JSON.stringify(json.error)))
          else resolve(json.choices?.[0]?.message?.content || '')
        } catch (e) {
          reject(new Error(`Failed to parse LLM response: ${data.substring(0, 200)}`))
        }
      })
    })
    req.on('error', reject)
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('LLM request timeout')) })
    req.write(body)
    req.end()
  })
}

export async function summarizeWorkflow(config: LLMConfig, workflow: Workflow): Promise<string> {
  const prompt = `你是一个 OA 流程分析助手。请分析以下待办流程，给出简洁的摘要和建议操作：

流程标题：${workflow.title}
申请单编号：${workflow.docNumber || '无'}
创建时间：${workflow.createDate}
当前状态：${workflow.status}
当前环节：${workflow.currentStep}
当前处理人：${workflow.currentHandler}

请用1-2句话总结这个流程是什么事情，并给出建议操作（如：需要尽快审批、可以稍后处理、建议联系处理人等）。`

  return chatCompletion(config, [
    { role: 'system', content: '你是 OA 流程分析助手，擅长分析审批流程并给出简洁建议。' },
    { role: 'user', content: prompt }
  ])
}

export async function batchSummarize(config: LLMConfig, workflows: Workflow[]): Promise<Map<string, string>> {
  const results = new Map<string, string>()

  const prompt = `你是 OA 流程分析助手。请分析以下 ${workflows.length} 个待办流程，对每个流程给出1句话摘要和建议。

${workflows.map((w, i) => `[${i + 1}] 标题：${w.title} | 编号：${w.docNumber || '无'} | 状态：${w.status} | 环节：${w.currentStep} | 处理人：${w.currentHandler} | 创建：${w.createDate}`).join('\n')}

请按序号逐一回复，格式为：
[序号] 摘要 | 建议`

  try {
    const response = await chatCompletion(config, [
      { role: 'system', content: '你是 OA 流程分析助手。简洁分析每个流程，给出一句话摘要和操作建议。' },
      { role: 'user', content: prompt }
    ])

    // Parse response
    const lines = response.split('\n').filter(l => l.trim())
    for (const line of lines) {
      const match = line.match(/\[(\d+)\]\s*(.+)/)
      if (match) {
        const idx = parseInt(match[1]) - 1
        if (idx >= 0 && idx < workflows.length) {
          results.set(workflows[idx].id, match[2].trim())
        }
      }
    }
  } catch (err: any) {
    // If batch fails, try individual
    for (const w of workflows) {
      try {
        const summary = await summarizeWorkflow(config, w)
        results.set(w.id, summary)
      } catch {
        results.set(w.id, '分析失败')
      }
    }
  }

  return results
}
