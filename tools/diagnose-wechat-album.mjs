// 诊断公众号专辑页抓取：原样请求一个专辑地址，输出关键特征，判断失败原因。
//
// 问题背景：全量采集报「公众号专辑页面未解析到完整文章条目」。
// 可能原因：① 被跳转/要求验证；② 返回的是 JS 渲染的空壳；③ 页面结构变了。
//
// 用法：node tools/diagnose-wechat-album.mjs [sourceKey]
import { executeSql, queryRows, resolveTargetConnection } from './migrate-legacy/mysql-client.mjs'

const USER_AGENT = 'DaxinWechatAlbumSync/1.0 (+https://daxinfawu.com/)'
const target = resolveTargetConnection()
const sourceKey = process.argv[2] ?? 'tro-2026-album'

const rows = await queryRows(target,
  `SELECT source_key, name, album_url FROM wechat_album_sources WHERE source_key = '${sourceKey}' LIMIT 1`)
if (rows.length === 0) {
  console.error(`未找到来源：${sourceKey}`)
  process.exit(1)
}
const [key, name, albumUrl] = rows[0]
console.log(`来源：${key}（${name}）`)
console.log(`地址：${albumUrl}\n`)

const response = await fetch(albumUrl, {
  headers: {
    'user-agent': USER_AGENT,
    accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.1',
  },
  redirect: 'follow',
  signal: AbortSignal.timeout(30000),
})

const html = await response.text()
console.log('HTTP', response.status)
console.log('最终 URL', response.url)
console.log('Content-Type', response.headers.get('content-type'))
console.log('长度', html.length)

console.log('\n=== 关键标记 ===')
const markers = [
  ['album__content', /album__content/],
  ['album__list-item', /album__list-item/],
  ['__biz', /__biz/],
  ['js_content', /js_content/],
  ['window.__INITIAL_STATE__', /__INITIAL_STATE__/],
  ['continue_flag', /continue_flag/],
  ['环境异常', /环境异常/],
  ['访问过于频繁', /访问过于频繁/],
  ['安全验证', /安全验证/],
  ['请在微信客户端打开', /请在微信客户端打开/],
  ['verifycode/captcha', /captcha|verifycode/i],
  ['该内容已被发布者删除', /该内容已被发布者删除|内容已删除/],
]
for (const [label, re] of markers) {
  console.log(`  ${label.padEnd(24)} ${re.test(html) ? '有' : '无'}`)
}

// 统计 li 标签与其 class，判断结构是否变了
const liTotal = (html.match(/<li\b/gi) ?? []).length
const liClasses = new Map()
for (const m of html.matchAll(/<li\b([^>]*)>/gi)) {
  const classMatch = /class\s*=\s*"([^"]*)"/i.exec(m[1] ?? '')
  const cls = classMatch?.[1]?.trim() ?? '(无 class)'
  liClasses.set(cls, (liClasses.get(cls) ?? 0) + 1)
}
console.log(`\n<li> 总数：${liTotal}`)
console.log('li 的 class 分布（前 10）：')
for (const [cls, count] of [...liClasses.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  console.log(`  ${String(count).padStart(4)}  ${cls.slice(0, 70)}`)
}

// 输出页面标题与开头摘要，便于人眼判断是不是验证页/空壳
const title = /<title>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? '(无 title)'
console.log(`\n<title>：${title}`)

// 关键：把第一个 album__list-item 的完整 HTML 打出来，
// 因为「找到 10 个条目但解析出 0 个完整条目」说明条目内的字段结构变了
const firstItem = /<li\b[^>]*album__list-item[\s\S]*?<\/li\s*>/i.exec(html)
if (firstItem) {
  console.log('\n=== 第一个 album__list-item 的原始 HTML（前 1400 字符）===')
  console.log(firstItem[0].slice(0, 1400))
} else {
  console.log('\n未截取到 album__list-item 块')
}

console.log('\n=== 正文开头 300 字符 ===')
console.log(html.slice(0, 300).replace(/\s+/g, ' '))
