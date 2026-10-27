import { millisecondsUntilFirstWorldTroRun, millisecondsUntilNextWorldTroRun } from '../utils/worldtro/schedule.mjs'
import { runWorldTroImport } from '../utils/worldtro/importer'
import { runCaseDetailSync } from '../utils/worldtro/detail'

export default defineNitroPlugin((nitroApp) => {
  if (process.env.NODE_ENV !== 'production' || process.env.NUXT_WORLDTRO_IMPORT_ENABLED === 'false') return

  /** 列表采集 + 详情抓取（限量、慢速；详情命中滑块会自动停止，不影响列表结果）。 */
  async function runDailySync() {
    const result = await runWorldTroImport()
    if (result.skipped) return { result, detail: null }
    console.info('[worldtro-scheduler] 每日列表采集已完成', result)
    try {
      const detail = await runCaseDetailSync({
        limit: Number(process.env.WORLDTRO_DETAIL_LIMIT ?? 20),
        delayMs: Number(process.env.WORLDTRO_DETAIL_DELAY_MS ?? 25000),
      })
      console.info('[worldtro-scheduler] 案件详情抓取完成', detail)
      return { result, detail }
    } catch (error) {
      console.error('[worldtro-scheduler] 案件详情抓取失败', error)
      return { result, detail: null }
    }
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  const schedule = (firstRun = false) => {
    timer = setTimeout(async () => {
      try {
        await runDailySync()
      } catch (error) {
        console.error('[worldtro-scheduler] 每日列表采集失败', error)
      } finally {
        schedule()
      }
    }, firstRun ? millisecondsUntilFirstWorldTroRun() : millisecondsUntilNextWorldTroRun())
  }

  /*
   * 部署后立即跑一次：设置 WORLDTRO_RUN_ON_START=true 时，启动 60 秒后先执行一次，
   * 之后仍按每日计划继续。用于发布后立刻补齐当天数据，不必等到计划时间。
   */
  const runOnStart = process.env.WORLDTRO_RUN_ON_START === 'true'
  if (runOnStart) {
    timer = setTimeout(async () => {
      try {
        await runDailySync()
      } catch (error) {
        console.error('[worldtro-scheduler] 启动补跑失败', error)
      } finally {
        schedule(true)
      }
    }, 60_000)
  } else {
    schedule(true)
  }
  nitroApp.hooks.hook('close', () => {
    if (timer) clearTimeout(timer)
  })
})
