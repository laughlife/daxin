import { millisecondsUntilNextWorldTroRun } from '../utils/worldtro/schedule.mjs'
import { runWorldTroImport } from '../utils/worldtro/importer'

export default defineNitroPlugin((nitroApp) => {
  if (process.env.NODE_ENV !== 'production' || process.env.NUXT_WORLDTRO_IMPORT_ENABLED === 'false') return

  let timer: ReturnType<typeof setTimeout> | undefined
  const schedule = () => {
    timer = setTimeout(async () => {
      try {
        const result = await runWorldTroImport()
        if (!result.skipped) console.info('[worldtro-scheduler] 每日列表采集已完成', result)
      } catch (error) {
        console.error('[worldtro-scheduler] 每日列表采集失败', error)
      } finally {
        schedule()
      }
    }, millisecondsUntilNextWorldTroRun())
  }

  schedule()
  nitroApp.hooks.hook('close', () => {
    if (timer) clearTimeout(timer)
  })
})
