// 把关于我们的图片数组写入 site_settings（value_type='json'）。
//
// 关于我们页按旧站结构需要多张图片：团队图、企业宣讲图、伙伴 logo 墙。
// site_settings 的图片类配置（value_type='image'）只支持单个 media_id，
// 不适合图片列表，因此这几项用 json 数组保存 OSS 地址，语义清晰且无需改表结构。
//
// 写入规则与后台保存一致：存在 is_current=1 就地 UPDATE，否则 INSERT。
//
// 用法：node tools/set-about-image-arrays.mjs [--dry-run]
import { executeSql, queryRows, quoteLiteral, resolveTargetConnection } from './migrate-legacy/mysql-client.mjs'

const OSS = 'https://dxfw-oss.oss-cn-shenzhen.aliyuncs.com/legacy-site/20261010'

/** 关于我们 hero 右侧的法庭天平图（旧站同位置使用）。 */
const TEAM_IMAGE = `${OSS}/8dc25f08-1caf-55aa-9591-4752f03b96b6.jpg`

/** 企业宣讲图（旧站 14 张，同为 4 列网格）。 */
const LECTURE_IMAGES = [
  `${OSS}/7f58fbd6-f8ab-54aa-8deb-445012563d41.webp`,
  `${OSS}/a7a2116e-33cb-5a51-82e4-d89fe305dd5c.jpg`,
  `${OSS}/5e41193d-d9a2-5349-ad22-eaff06b911d6.jpg`,
  `${OSS}/ea41213f-db4a-5a48-9413-cac7d884c852.jpg`,
  `${OSS}/4c65e112-dc42-5ee6-b17c-778ddd5f5778.jpg`,
  `${OSS}/bb3c41a3-5b12-564a-935d-cfbbc951a149.jpg`,
  `${OSS}/233cab7d-98d3-5de6-ad57-534409f2984f.jpg`,
  `${OSS}/32e3ee9e-d057-53d6-9b04-7201d6c81bce.jpg`,
  `${OSS}/ed01b4ee-11c6-5c1d-b1e3-5da67f525b2c.jpg`,
  `${OSS}/7db4f061-e408-51c4-acc3-d59b05855497.jpg`,
  `${OSS}/f9abf15a-afa9-5b6a-91b6-af236a5dfa64.jpg`,
  `${OSS}/564f9de5-9a08-525b-b18a-45e4b49de439.jpg`,
  `${OSS}/93ef0c40-7e28-5b2a-8730-87ceb6356e5d.jpg`,
  `${OSS}/c4b4c4b4-948a-5261-a706-945127232244.jpg`,
]

/** 我们的小伙伴：合作伙伴 logo 墙（旧站为一张拼好的九宫格图）。 */
const PARTNER_IMAGES = [`${OSS}/e430637f-13f4-57f6-9b5d-59663cd525ce.jpg`]

const dryRun = process.argv.includes('--dry-run')

async function upsertJson(target, key, group, value) {
  const json = JSON.stringify(value)
  const current = await queryRows(target, `
SELECT id FROM site_settings WHERE setting_key = ${quoteLiteral(key)} AND is_current = 1`)
  if (dryRun) {
    console.log(`  [dry-run] ${key} (${value.length} 项)`)
    return
  }
  if (current.length > 0) {
    await executeSql(target, `
UPDATE site_settings SET setting_value = ${quoteLiteral(json)}, value_type = 'json', updated_at = NOW()
WHERE setting_key = ${quoteLiteral(key)} AND is_current = 1`)
    console.log(`  ✔ ${key}（就地更新，${value.length} 项）`)
    return
  }
  await executeSql(target, `
INSERT INTO site_settings
  (setting_key, setting_group, setting_value, value_type, media_id, version, is_current, status, created_at, updated_at)
VALUES
  (${quoteLiteral(key)}, ${quoteLiteral(group)}, ${quoteLiteral(json)}, 'json', NULL, 1, 1, 'published', NOW(), NOW())`)
  console.log(`  ✔ ${key}（新建，${value.length} 项）`)
}

const target = resolveTargetConnection()
if (!target) {
  console.error('无法解析目标库连接')
  process.exitCode = 2
} else {
  console.log('写入关于我们图片配置：')
  await upsertJson(target, 'about_hero_image', 'about', [TEAM_IMAGE])
  await upsertJson(target, 'about_lecture_images', 'about', LECTURE_IMAGES)
  await upsertJson(target, 'about_partner_images', 'about', PARTNER_IMAGES)
}
