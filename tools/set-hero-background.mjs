// 把首屏动态背景（动画 WebP）与其静帧写入站点配置。
//
// 用法：node tools/set-hero-background.mjs [--clear]
import { executeSql, queryRows, resolveTargetConnection } from './migrate-legacy/mysql-client.mjs'

const clear = process.argv.includes('--clear')
const target = resolveTargetConnection()

/** 按 object_key 前缀 + 可选后缀取最新媒体记录。 */
async function findMedia(prefix, suffix = '') {
  const rows = await queryRows(target, `
    SELECT id, public_url, width, height, byte_size
    FROM media_assets
    WHERE object_key LIKE '${prefix}%'
      ${suffix ? `AND object_key LIKE '%${suffix}'` : ''}
      AND deleted_at IS NULL
    ORDER BY id DESC LIMIT 1`)
  return rows[0] ?? null
}

async function setKey(key, media) {
  if (!media) {
    await executeSql(target, `
      UPDATE site_settings SET media_id = NULL, setting_value = '', updated_at = NOW()
      WHERE setting_key = '${key}' AND is_current = 1`)
    console.log(`  ${key} → 已清空`)
    return
  }
  const [id, url, width, height, bytes] = media
  await executeSql(target, `
    UPDATE site_settings
    SET media_id = ${Number(id)}, setting_value = '${String(url)}', updated_at = NOW()
    WHERE setting_key = '${key}' AND is_current = 1`)
  console.log(`  ${key} → id=${id} ${width}x${height} ${Math.round(Number(bytes) / 1024)}KB`)
  console.log(`      ${url}`)
}

if (clear) {
  await setKey('home_hero_background', null)
  await setKey('home_hero_background_poster', null)
  console.log('已清空首屏背景配置（页面将回退到原来的 CSS 渐变背景）')
} else {
  // 动画是 .webp、静帧是 .jpg，必须按扩展名区分：
  // 两者 object_key 同属 hero/ 前缀，只按前缀取会拿到 id 更大的那一张（曾错取成 poster）。
  const animated = await findMedia('hero/', '.webp')
  const poster = await findMedia('hero/', '.jpg')

  if (!animated) {
    console.error('未找到 hero/ 前缀的媒体记录，请先上传')
    process.exitCode = 1
  } else {
    await setKey('home_hero_background', animated)
    await setKey('home_hero_background_poster', poster)
  }
}

// 核对：每个键必须只有一行现行记录
const dup = await queryRows(target, `
  SELECT setting_key, COUNT(*) AS c
  FROM site_settings
  WHERE is_current = 1 AND setting_key IN ('home_hero_background', 'home_hero_background_poster')
  GROUP BY setting_key`)
console.log('\n现行行数核对：')
for (const [key, count] of dup) {
  console.log(`  ${key}: ${count}${Number(count) === 1 ? '' : '  ← 异常，应为 1'}`)
}
