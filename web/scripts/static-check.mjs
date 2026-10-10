/**
 * 静态/SSR 内部链接与资源完整性检查。
 *
 * 背景：站点从「纯静态展示」升级为「数据库驱动的 SSR」后，预渲染的只有固定页面
 * （首页、关于我们、案件/品牌/律所目录等），案件与文章的**详情页改为按需 SSR**，
 * 产物目录里本来就没有对应的 .html 文件。原先的实现要求每个内部链接都能在
 * .output/public 下找到文件，因此在 SSR 详情页上必然误报。
 *
 * 现在的判定方式：
 *   - 预渲染页面：读取 .output/public 下的 index.html，断言单一 <main> landmark；
 *   - 资源引用（src，以及 /_nuxt、/images 等文件型 href）：仍要求文件存在；
 *   - 路由型 href（页面链接）：请求运行中的服务确认返回 200，不再要求预渲染文件。
 *
 * 因此需要一个运行中的服务地址：
 *   SMOKE_BASE_URL=http://127.0.0.1:3002 npm run check:static
 *   （开发模式或 `npm run preview` 均可；未提供地址时脚本会直接报错说明原因。）
 */
import assert from 'node:assert/strict'
import { readdir, readFile, stat } from 'node:fs/promises'
import { resolve, join } from 'node:path'

const base = process.env.SMOKE_BASE_URL || process.env.STATIC_BASE_URL || ''
const root = resolve('.output/public')

if (!base) {
  console.error('缺少服务地址：请设置 SMOKE_BASE_URL（例如 http://[::1]:4311），')
  console.error('因为详情页改为按需 SSR，路由链接需要在真实服务上验证，不能只看产物目录。')
  process.exit(2)
}

// `npm run generate` 与 `npm run build` 都写 .output，但产物性质相反：
// generate 只产出静态文件（Nitro preset=static），此时用 npm run preview 起的是静态文件服务，
// 所有未预渲染的 SSR 路由都会 404。若不提示，会把它误判成「应用出现大量坏链」。
// 这里检测产物形态，若显然是静态产物则直接说明原因并退出。
const hasServerBundle = await exists(join(root, '..', 'server', 'index.mjs'))
const hasStaticIndex = await exists(join(root, 'index.html'))
if (hasStaticIndex && !hasServerBundle) {
  console.error('当前 .output 是静态产物（Nitro preset=static），不是 SSR 服务产物。')
  console.error('静态产物只有预渲染页面，案件/文章/品牌等按需 SSR 路由必然 404。')
  console.error('请先重新构建 SSR 产物再运行本检查：')
  console.error('  npm run build && npm run preview')
  process.exit(2)
}

async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  return (await Promise.all(entries.map(item => item.isDirectory() ? files(join(dir, item.name)) : [join(dir, item.name)]))).flat()
}

async function exists(path) {
  try {
    return await stat(path)
  } catch {
    return null
  }
}

/** 资源型链接：产物里必须有对应文件。 */
function isAssetPath(pathname) {
  return pathname.startsWith('/_nuxt/') || pathname.startsWith('/images/') || /\.[a-z0-9]{2,5}$/i.test(pathname)
}

const pages = (await files(root)).filter(path => path.endsWith('index.html'))
const missingAssets = []
const brokenRoutes = []
let assetCount = 0
let routeCount = 0

// 同一路由可能被多个页面引用，缓存请求结果避免重复请求
const routeCache = new Map()
async function checkRoute(pathname) {
  if (routeCache.has(pathname)) return routeCache.get(pathname)
  let status = 0
  try {
    const response = await fetch(`${base}${pathname}`, { redirect: 'follow', signal: AbortSignal.timeout(30000) })
    status = response.status
  } catch {
    status = 0
  }
  routeCache.set(pathname, status)
  return status
}

for (const page of pages) {
  const html = await readFile(page, 'utf8')
  assert.equal((html.match(/<main[\s>]/g) || []).length, 1, `单一主内容 landmark：${page}`)

  for (const [, attribute, value] of html.matchAll(/\b(href|src)="([^"#]+)"/g)) {
    if (!value.startsWith('/') || value.startsWith('//')) continue
    const pathname = decodeURIComponent(value.split(/[?#]/)[0])

    if (attribute === 'src' || isAssetPath(pathname)) {
      const target = resolve(root, `.${pathname}`)
      assert.ok(target.startsWith(root), '资源必须位于静态站点目录')
      const info = await exists(target)
      const ok = info?.isFile() || (info?.isDirectory() && await exists(join(target, 'index.html')))
      if (!ok) missingAssets.push({ page: page.slice(root.length), attribute, value })
      assetCount += 1
      continue
    }

    routeCount += 1
    const status = await checkRoute(pathname)
    if (status !== 200) brokenRoutes.push({ page: page.slice(root.length), value, status })
  }
}

assert.equal(missingAssets.length, 0, `缺失的静态资源：\n${JSON.stringify(missingAssets, null, 2)}`)
assert.equal(brokenRoutes.length, 0, `路由链接未返回 200：\n${JSON.stringify(brokenRoutes, null, 2)}`)

console.log(`静态/SSR 检查通过：${pages.length} 个预渲染页面、${assetCount} 处资源引用、`
  + `${routeCount} 处路由链接（${routeCache.size} 个唯一路径）全部可访问。`)
