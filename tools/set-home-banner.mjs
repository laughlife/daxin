// 把首页 Banner 图片写入站点配置（home_banner_image）。
//
// 按项目约定就地更新 is_current=1 的现行行（保持 version 不变），
// 不新增版本行——site_settings 的唯一键是 (setting_key, version)，
// 用 INSERT ... version+1 会造成同一 key 多行现行，这正是迁移 004 修过的问题。
//
// 用法：node tools/set-home-banner.mjs <object_key 前缀> [--clear]
import { executeSql, queryRows, resolveTargetConnection } from './migrate-legacy/mysql-client.mjs'

const prefix = process.argv[2] ?? 'home/20261012/'
const clear = process.argv.includes('--clear')
const target = resolveTargetConnection()

if (clear) {
  await executeSql(target, `
    UPDATE site_settings
    SET media_id = NULL, setting_value = '', updated_at = NOW()
    WHERE setting_key = 'home_banner_image' AND is_current = 1`)
  console.log('已清空 home_banner_image')
} else {
  const rows = await queryRows(target, `
    SELECT id, public_url, byte_size, width, height
    FROM media_assets
    WHERE object_key LIKE '${prefix}%' AND deleted_at IS NULL
    ORDER BY id DESC LIMIT 1`)
  if (rows.length === 0) {
    console.error(`未找到 object_key 以 ${prefix} 开头的媒体记录`)
    process.exitCode = 1
  } else {
    const [id, url, bytes, width, height] = rows[0]
    console.log(`媒体记录：id=${id} ${width}x${height} ${Math.round(Number(bytes) / 1024)}KB`)
    console.log(`地址：${url}`)

    const affected = await executeSql(target, `
      UPDATE site_settings
      SET media_id = ${Number(id)}, setting_value = '${String(url)}', updated_at = NOW()
      WHERE setting_key = 'home_banner_image' AND is_current = 1`)
    console.log(`已更新配置行：${JSON.stringify(affected)}`)

    const check = await queryRows(target,
      `SELECT setting_key, media_id, setting_value FROM site_settings WHERE setting_key = 'home_banner_image' AND is_current = 1`)
    console.log(`核对：${JSON.stringify(check[0])}`)

    // 确认该 key 只有一行现行记录
    const dup = await queryRows(target,
      `SELECT COUNT(*) AS c FROM site_settings WHERE setting_key = 'home_banner_image' AND is_current = 1`)
    console.log(`现行行数：${dup[0][0]}（必须为 1）`)
  }
}
