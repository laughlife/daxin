import {
  millisecondsUntilFirstWechatAlbumRun,
  millisecondsUntilNextWechatAlbumMinute,
  millisecondsUntilNextWechatAlbumRun,
} from '../utils/wechat-album/schedule.mjs'
import { runWechatAlbumDeploymentFullImport, runWechatAlbumImport } from '../utils/wechat-album/importer'

export default defineNitroPlugin((nitroApp) => {
  if (process.env.NODE_ENV !== 'production' || process.env.NUXT_WECHAT_ALBUM_IMPORT_ENABLED === 'false') return

  let fullTimer: ReturnType<typeof setTimeout> | undefined
  let dailyTimer: ReturnType<typeof setTimeout> | undefined
  let resolveFullRun: (() => void) | undefined
  const fullRunSettled = new Promise<void>((resolve) => { resolveFullRun = resolve })

  fullTimer = setTimeout(async () => {
    try {
      const result = await runWechatAlbumDeploymentFullImport()
      if (result.skipped) {
        console.info('[wechat-album-scheduler] 部署后全量任务已跳过', result)
      } else if (result.failedCount) {
        console.error('[wechat-album-scheduler] 部署后全量任务部分失败', result)
      } else {
        console.info('[wechat-album-scheduler] 部署后一次性全量同步完成', result)
      }
    } catch (error) {
      console.error('[wechat-album-scheduler] 部署后全量同步失败', error)
    } finally {
      resolveFullRun?.()
      resolveFullRun = undefined
    }
  }, millisecondsUntilNextWechatAlbumMinute())

  const scheduleDaily = (firstRun = false) => {
    dailyTimer = setTimeout(async () => {
      try {
        // 若部署时间恰逢每日任务，先完成首个整分触发的全量同步。
        await fullRunSettled
        const result = await runWechatAlbumImport()
        if (result.skipped) {
          console.info('[wechat-album-scheduler] 今日任务已跳过', result)
        } else if (result.failedCount) {
          console.error('[wechat-album-scheduler] 部分公众号专辑同步失败', result)
        } else {
          console.info('[wechat-album-scheduler] 每日公众号文章同步完成', result)
        }
      } catch (error) {
        console.error('[wechat-album-scheduler] 每日公众号文章同步失败', error)
      } finally {
        scheduleDaily()
      }
    }, firstRun ? millisecondsUntilFirstWechatAlbumRun() : millisecondsUntilNextWechatAlbumRun())
  }

  scheduleDaily(true)
  nitroApp.hooks.hook('close', () => {
    if (fullTimer) clearTimeout(fullTimer)
    if (dailyTimer) clearTimeout(dailyTimer)
  })
})
