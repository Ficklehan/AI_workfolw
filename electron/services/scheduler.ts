import { getScheduleConfig } from '../db'

let timer: ReturnType<typeof setInterval> | null = null
let callback: (() => Promise<void>) | null = null

export function startScheduler(cb: () => Promise<void>) {
  callback = cb
  restart()
}

export function restart() {
  stop()
  const config = getScheduleConfig()
  if (config.enabled && config.intervalMinutes > 0) {
    timer = setInterval(async () => {
      if (callback) {
        try { await callback() } catch (e) { console.error('Scheduler error:', e) }
      }
    }, config.intervalMinutes * 60 * 1000)
    console.log(`Scheduler started: every ${config.intervalMinutes} minutes`)
  }
}

export function stop() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

export function isRunning(): boolean {
  return timer !== null
}
