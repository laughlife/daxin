import { queryRows, resolveTargetConnection } from './migrate-legacy/mysql-client.mjs'

const target = resolveTargetConnection()
const rows = await queryRows(target, `
SELECT id, title, object_key, public_url, width, height
FROM media_assets
WHERE legacy_source_table = 'legacy-site' AND deleted_at IS NULL
ORDER BY id`)

const base = 'https://dxfw-oss.oss-cn-shenzhen.aliyuncs.com'
const byName = new Map(rows.map((row) => [row[1], row[3]]))

/** 团队图（关于我们页 hero 与团队区块） */
const teamImages = ['501edefd19e54ff', '5e6b050975d9c6d', '722d045a7422f16']
/** 企业宣讲图：1-4 ~ 1-16 与 1-6-1 */
const lectureNames = [
  '1-4-scaled', '1-5', '1-6', '1-6-1', '1-7', '1-8', '1-9',
  '1-10', '1-11', '1-12', '1-13', '1-14', '1-15', '1-16',
]
/** 我们的小伙伴：合作伙伴墙 */
const partnerImages = ['c5dfa0bb4dca4']

function urls(names) {
  return names.map((name) => {
    const url = byName.get(name)
    if (!url) throw new Error(`缺少素材：${name}`)
    return url
  })
}

console.log('团队图：')
for (const url of urls(teamImages)) console.log('  ' + url)
console.log('企业宣讲图：', urls(lectureNames).length, '张')
console.log('伙伴图：')
for (const url of urls(partnerImages)) console.log('  ' + url)

// 输出成可直接用于配置的 JSON，便于人工核对后再写库
console.log('\nteamJson=' + JSON.stringify(urls(teamImages)))
console.log('\nlectureJson=' + JSON.stringify(urls(lectureNames)))
console.log('\npartnerJson=' + JSON.stringify(urls(partnerImages)))
