/**
 * 官网路由 Smoke 检查（轻量级，无测试框架依赖，Node 22+ 原生 fetch）。
 *
 * 用法：
 *   1. 先构建并启动预览：
 *        npm run generate          （或 npm run build）
 *        npm run preview           （nitro-prerender 预设默认 http://localhost:3000）
 *      或开发模式：npm run dev     （默认 http://localhost:3000）
 *   2. 另开终端运行：
 *        npm run smoke
 *      可通过环境变量覆盖地址：
 *        SMOKE_BASE_URL=http://127.0.0.1:3123 npm run smoke
 *
 * 预期结果：全部检查项输出 PASS，进程退出码 0；任一失败输出 FAIL 并以退出码 1 结束。
 */

const BASE_URL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000'

const results = []
let failed = false

function record(name, ok, detail = '') {
  results.push({ name, ok, detail })
  if (!ok) failed = true
  const tag = ok ? 'PASS' : 'FAIL'
  console.log(`[${tag}] ${name}${detail ? ` — ${detail}` : ''}`)
}

async function fetchPage(path) {
  const url = `${BASE_URL}${path}`
  const response = await fetch(url)
  const html = await response.text()
  return { status: response.status, html }
}

function checkRoute(path, expectedStatus = 200) {
  return { path, expectedStatus }
}

const routes = [
  checkRoute('/'),
  checkRoute('/tro/cases'),
  checkRoute('/about'),
  checkRoute('/infringement-check')
]

const homeMarkers = [
  '跨境有我，法律无忧',
  '查询 TRO 案件',
  '大信法务',
  '核心业务',
  '24 小时'
]

const casesMarkers = [
  'TRO 案件查询',
  '案件号',
  '品牌名',
  '代理律所'
]

/**
 * 需求明确要求前台不展示数据来源提示。
 * 这些字样一旦出现在公开页面即为缺陷，因此列入禁止标记。
 */
const forbiddenMarkers = [
  'NuxtWelcome',
  '站点壳层预览',
  '官网基础框架预览',
  '旧站数据库',
  '旧站历史资料',
  '静态快照',
  'Mock 演示数据',
  '【演示数据】'
]

async function main() {
  console.log(`Smoke 检查开始：${BASE_URL}\n`)

  const pages = new Map()

  for (const route of routes) {
    try {
      const { status, html } = await fetchPage(route.path)
      pages.set(route.path, html)
      record(
        `GET ${route.path} 返回 ${route.expectedStatus}`,
        status === route.expectedStatus,
        `实际 ${status}`
      )
    } catch (error) {
      record(`GET ${route.path} 可访问`, false, String(error?.message ?? error))
    }
  }

  const home = pages.get('/') ?? ''
  for (const marker of homeMarkers) {
    record(`首页包含「${marker}」`, home.includes(marker))
  }

  // 需求（2026-10-10 修订）：首页顶部保留「联系我们可领取 TRO 侵权大礼包」引导；
  // 需要删除的是关于我们页面里的扫码大礼包区域，前台其余位置仍应展示该公告。
  record('首页包含「TRO 侵权大礼包」公告', home.includes('TRO 侵权大礼包'))
  record('关于我们不含扫码大礼包区域', !(pages.get('/about') ?? '').includes('扫码领取'))

  const cases = pages.get('/tro/cases') ?? ''
  for (const marker of casesMarkers) {
    record(`案件查询页包含「${marker}」`, cases.includes(marker))
  }

  for (const [path, html] of pages) {
    for (const marker of forbiddenMarkers) {
      record(`${path} 不包含「${marker}」`, !html.includes(marker))
    }
  }

  const passed = results.filter(item => item.ok).length
  console.log(`\nSmoke 检查结束：${passed}/${results.length} 通过`)

  if (failed) {
    console.error('存在失败项，请检查上方 FAIL 记录。')
    process.exit(1)
  }
}

main().catch(error => {
  console.error('Smoke 检查异常终止：', error)
  process.exit(1)
})
