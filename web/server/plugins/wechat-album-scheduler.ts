import {
  millisecondsUntilFirstWechatAlbumRun,
  millisecondsUntilNextWechatAlbumRun,
} from '../utils/wechat-album/schedule.mjs'
import { runWechatAlbumImport } from '../utils/wechat-album/importer'

export default defineNitroPlugin((nitroApp) => {
  if (process.env.NODE_ENV !== 'production' || process.env.NUXT_WECHAT_ALBUM_IMPORT_ENABLED === 'false') return

  let timer: ReturnType<typeof setTimeout> | undefined
  const schedule = (firstRun = false) => {
    timer = setTimeout(async () => {
      try {
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
        schedule()
      }
    }, firstRun ? millisecondsUntilFirstWechatAlbumRun() : millisecondsUntilNextWechatAlbumRun())
  }

  schedule(true)
  nitroApp.hooks.hook('close', () => {
    if (timer) clearTimeout(timer)
  })
})
