import { millisecondsUntilFirstWorldTroRun, millisecondsUntilNextWorldTroRun } from '../utils/worldtro/schedule.mjs'
import { runWorldTroImport } from '../utils/worldtro/importer'

export default defineNitroPlugin((nitroApp) => {
  if (process.env.NODE_ENV !== 'production' || process.env.NUXT_WORLDTRO_IMPORT_ENABLED === 'false') return

  let timer: ReturnType<typeof setTimeout> | undefined
  const schedule = (firstRun = false) => {
    timer = setTimeout(async () => {
      try {
        const result = await runWorldTroImport()
        if (!result.skipped) console.info('[worldtro-scheduler] 每日列表采集已完成', result)
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
        const result = await runWorldTroImport()
        if (!result.skipped) console.info('[worldtro-scheduler] 启动补跑已完成', result)
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
