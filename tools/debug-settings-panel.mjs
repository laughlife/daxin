// 统计 /admin/settings 中多图字段控件实际渲染出的张数。
// 用于确认「关于我们」6 个 json 图片键都换成了图片列表控件，且张数与库里一致。
import { readFileSync } from 'node:fs'

const base = 'http://127.0.0.1:3002'
const jar = new Map()

async function call(path, options = {}) {
  const headers = {}
  if (jar.size) headers.cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
  if (options.body !== undefined) headers['content-type'] = 'application/json'
  const response = await fetch(base + path, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  for (const raw of response.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(';')
    const eq = pair.indexOf('=')
    const name = pair.slice(0, eq).trim()
    const value = pair.slice(eq + 1).trim()
    if (value) jar.set(name, value)
    else jar.delete(name)
  }
  return { status: response.status, text: await response.text() }
}

const password = readFileSync('local-credentials/admin.txt', 'utf8').trim()
await call('/api/admin/login', { method: 'POST', body: { username: 'admin', password } })
const response = await call('/admin/settings')

// 把页面按「字段块」切开：每个块从 setting-about-<key> 的 label 开始
const keys = ['about_business_images', 'about_success_images', 'about_lecture_images',
  'about_partner_images', 'about_honors_images', 'about_hero_image']

console.log(`页面 HTTP ${response.status}，长度 ${response.text.length}`)
console.log('多图字段渲染情况：')
for (const key of keys) {
  const at = response.text.indexOf(`setting-about-${key}`)
  if (at < 0) {
    console.log(`  ✖ ${key.padEnd(26)} 未渲染`)
    continue
  }
  // 取该字段之后的 600 字符，在里面找「共 N 张」
  const slice = response.text.slice(at, at + 900)
  const match = slice.match(/共 (\d+) 张/)
  const hasList = slice.includes('admin-image-list')
  console.log(`  ${hasList ? '✔' : '✖'} ${key.padEnd(26)} 共 ${match ? match[1] : '?'} 张`)
}

const failCount = (response.text.match(/配置加载失败/g) ?? []).length
console.log(`\n加载失败提示出现 ${failCount} 次（应为 0）`)
const fileButtonCount = (response.text.match(/选择文件/g) ?? []).length
console.log(`「选择文件」共出现 ${fileButtonCount} 次`)
