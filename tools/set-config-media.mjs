// 把已登记的 media_assets 关联到站点配置项或页脚二维码（只更新/新建指定键）。
//
// 配置层规则（与后台保存逻辑一致）：
//   - 写入时就地 UPDATE 当前行（is_current=1），保持「每个 key 恰好一行 current」；
//     若不存在则 INSERT 一行 version=1 的当前行。
//   - 图片类配置把 media_id 指向 media_assets，公开接口会自动用 public_url 覆盖取值。
//
// 用法：
//   node tools/set-config-media.mjs --set site_logo=3714 --set about_team_image=3690
//   node tools/set-config-media.mjs --qr tro-public=3719 --qr labor-public=3720
//   node tools/set-config-media.mjs --list
import { executeSql, queryRows, quoteLiteral, resolveTargetConnection } from './migrate-legacy/mysql-client.mjs'

function parseArgs(argv) {
  const options = { sets: [], qr: [], list: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--set') options.sets.push(argv[++index] ?? '')
    else if (arg === '--qr') options.qr.push(argv[++index] ?? '')
    else if (arg === '--list') options.list = true
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`未知参数：${arg}`)
  }
  return options
}

/** 校验 media_assets 里存在该 id 且未删除，返回 public_url。 */
async function requireMedia(target, mediaId) {
  const rows = await queryRows(target, `
SELECT id, public_url, title FROM media_assets
WHERE id = ${Number(mediaId)} AND deleted_at IS NULL`)
  if (rows.length === 0) throw new Error(`media_assets 中没有可用的 id=${mediaId}（不存在或已删除）`)
  return { id: rows[0][0], url: rows[0][1], title: rows[0][2] }
}

async function setSettingMedia(target, key, mediaId) {
  const media = await requireMedia(target, mediaId)
  const current = await queryRows(target, `
SELECT id FROM site_settings WHERE setting_key = ${quoteLiteral(key)} AND is_current = 1`)

  if (current.length > 0) {
    // 就地更新：不新增 version，保持唯一 current 不变式
    await executeSql(target, `
UPDATE site_settings
SET media_id = ${media.id}, value_type = 'image', updated_at = NOW()
WHERE setting_key = ${quoteLiteral(key)} AND is_current = 1`)
    console.log(`  ✔ ${key} → media_id=${media.id}（就地更新）  ${media.title}`)
    return
  }

  await executeSql(target, `
INSERT INTO site_settings
  (setting_key, setting_group, setting_value, value_type, media_id, version, is_current, status, created_at, updated_at)
VALUES
  (${quoteLiteral(key)}, 'general', '', 'image', ${media.id}, 1, 1, 'published', NOW(), NOW())`)
  console.log(`  ✔ ${key} → media_id=${media.id}（新建）  ${media.title}`)
}

async function setQrMedia(target, itemKey, mediaId) {
  const media = await requireMedia(target, mediaId)
  const existing = await queryRows(target, `
SELECT id FROM qr_assets WHERE item_key = ${quoteLiteral(itemKey)}`)
  if (existing.length === 0) throw new Error(`qr_assets 中没有 item_key=${itemKey}`)
  await executeSql(target, `
UPDATE qr_assets SET media_id = ${media.id}, updated_at = NOW()
WHERE item_key = ${quoteLiteral(itemKey)}`)
  console.log(`  ✔ qr_assets[${itemKey}] → media_id=${media.id}  ${media.title}`)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log('用法：node tools/set-config-media.mjs --set <key>=<mediaId> [--qr <itemKey>=<mediaId>] [--list]')
    return
  }
  const target = resolveTargetConnection()
  if (!target) {
    console.error('无法解析目标库连接')
    process.exitCode = 2
    return
  }

  if (options.list) {
    console.log('图片类配置项：')
    const settings = await queryRows(target, `
SELECT setting_key, value_type, media_id FROM site_settings
WHERE is_current = 1 AND (value_type = 'image' OR media_id IS NOT NULL) ORDER BY setting_key`)
    for (const row of settings) console.log(`  ${String(row[0]).padEnd(24)} type=${row[1]} media_id=${row[2]}`)
    console.log('二维码：')
    const qr = await queryRows(target, 'SELECT item_key, title, media_id FROM qr_assets ORDER BY sort_order')
    for (const row of qr) console.log(`  ${String(row[0]).padEnd(20)} media_id=${row[2]}  ${row[1]}`)
    return
  }

  for (const pair of options.sets) {
    const [key, id] = pair.split('=')
    if (!key || !id) throw new Error(`--set 需要 <key>=<mediaId> 形式，收到：${pair}`)
    await setSettingMedia(target, key.trim(), id.trim())
  }
  for (const pair of options.qr) {
    const [key, id] = pair.split('=')
    if (!key || !id) throw new Error(`--qr 需要 <itemKey>=<mediaId> 形式，收到：${pair}`)
    await setQrMedia(target, key.trim(), id.trim())
  }
}

main().catch((error) => {
  console.error(`设置失败：${error.message}`)
  process.exitCode = 1
})
