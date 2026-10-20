// 把本地图片设为指定站点配置项的图片值（media_id + 公开地址）。
//
// 为什么单独写一个：后台「图片管理」用 SettingImageField 保存时会同时写
// media_id 与 setting_value；脚本侧直接改库时若只写其中一个，
// 页面能显示但后台图片字段会显示「未选择」，运营会以为没生效。
// 两者必须一起写。
//
// 用法：node tools/set-setting-image.mjs <settingKey> <objectKey 或 publicUrl>
import { executeSql, queryRows, quoteLiteral, resolveTargetConnection } from './migrate-legacy/mysql-client.mjs'

const [key, needle] = process.argv.slice(2)
if (!key || !needle) {
  console.error('用法：node tools/set-setting-image.mjs <settingKey> <objectKey 或 publicUrl>')
  process.exit(2)
}

const target = resolveTargetConnection()

const rows = await queryRows(target, `
  SELECT id, public_url, object_key, width, height, byte_size
  FROM media_assets
  WHERE (public_url = ${quoteLiteral(needle)} OR object_key LIKE ${quoteLiteral(`${needle}%`)})
    AND deleted_at IS NULL
  ORDER BY id DESC
  LIMIT 1`)

const media = rows[0]
if (!media) {
  console.error(`未找到媒体记录：${needle}`)
  process.exit(1)
}

const [id, url, objectKey, width, height, bytes] = media

const exists = await queryRows(target,
  `SELECT id FROM site_settings WHERE setting_key = ${quoteLiteral(key)} AND is_current = 1 LIMIT 1`)
if (exists.length === 0) {
  console.error(`未找到当前生效的配置项：${key}（请先确认 key 存在，避免写入孤儿配置）`)
  process.exit(1)
}

await executeSql(target, `
  UPDATE site_settings
  SET setting_value = ${quoteLiteral(url)},
      media_id = ${id},
      updated_at = NOW()
  WHERE setting_key = ${quoteLiteral(key)} AND is_current = 1`)

console.log(`已设置 ${key}`)
console.log(`  media_assets.id = ${id}`)
console.log(`  ${width}x${height}  ${bytes} 字节`)
console.log(`  ${url}`)
