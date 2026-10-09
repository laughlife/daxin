// 公开接口抽查：确认配置与正文图片、案件字段都来自真实数据且无内部字段泄漏。
const base = process.argv[2] ?? 'http://[::1]:3511'

async function getJson(path) {
  const response = await fetch(base + path, { signal: AbortSignal.timeout(60000) })
  const text = await response.text()
  try {
    return { status: response.status, json: JSON.parse(text) }
  } catch {
    return { status: response.status, json: null, text: text.slice(0, 200) }
  }
}

console.log('== 站点配置（表为空应返回默认值）==')
{
  const { status, json } = await getJson('/api/public/settings')
  console.log(`HTTP ${status}`, JSON.stringify(json?.data ?? json))
}

console.log('\n== 文章详情 ==')
{
  const { status, json } = await getJson('/api/public/articles')
  const slug = json?.data?.[0]?.slug
  console.log(`列表 HTTP ${status}，meta ${JSON.stringify(json?.meta)}`)
  if (slug) {
    const detail = await getJson(`/api/public/articles/${slug}`)
    const html = detail.json?.data?.html ?? ''
    const images = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((match) => match[1])
    console.log(`详情 HTTP ${detail.status}，标题 ${String(detail.json?.data?.article?.title ?? '').slice(0, 36)}`)
    console.log(`正文长度 ${html.length}，图片 ${images.length} 张，全部为 OSS 地址：${images.length > 0 && images.every((url) => url.startsWith('https://dxfw-oss'))}`)
    if (images[0]) console.log(`示例图片 ${images[0]}`)
    console.log(`残留 res/：${html.includes('res/')}；含 script/on* 事件：${/<script|onerror=|onclick=/i.test(html)}`)
  }
}

console.log('\n== 案件列表 ==')
{
  const { status, json } = await getJson('/api/public/cases?pageSize=2')
  console.log(`HTTP ${status}，meta ${JSON.stringify(json?.meta)}`)
  const item = json?.data?.[0]
  if (item) {
    console.log('字段：' + Object.keys(item).join(','))
    console.log(`示例 ${item.caseNumber} | 起诉时间 ${item.filedAt || '(空)'} | 律所 ${item.lawFirm || '(空)'} | 原告 ${item.plaintiffName || '(空)'} | 品牌 ${item.plaintiffBrand || '(空)'} | caseType ${JSON.stringify(item.caseType)} | caseTypes ${JSON.stringify(item.caseTypes)}`)
    console.log('泄漏内部字段：' + Object.keys(item).some((key) => /legacy|migration|verified/i.test(key)))
  }
}

console.log('\n== 案件详情（含来源）==')
{
  const { status, json } = await getJson('/api/public/cases/24-cv-0006')
  console.log(`HTTP ${status}，案件号 ${json?.data?.caseNumber ?? '(无)'}，来源文章 ${json?.data?.source?.title ? '有' : '无'}`)
}

console.log('\n== 品牌 / 律所 caseCount 是否已回填 ==')
{
  const brands = await getJson('/api/public/brands')
  const firms = await getJson('/api/public/law-firms')
  console.log(`品牌 ${brands.json?.data?.length} 个，非零 caseCount ${brands.json?.data?.filter((item) => item.caseCount > 0).length} 个`)
  console.log(`律所 ${firms.json?.data?.length} 家，非零 caseCount ${firms.json?.data?.filter((item) => item.caseCount > 0).length} 家`)
  const keith = firms.json?.data?.find((item) => item.slug === 'law-firm-keith')
  console.log(`Keith caseCount = ${keith?.caseCount}`)
}

console.log('\n== 首页 ==')
{
  const { status, json } = await getJson('/api/public/home')
  console.log(`HTTP ${status}，featuredCases ${json?.data?.featuredCases?.length}，recentArticles ${json?.data?.recentArticles?.length}`)
}
