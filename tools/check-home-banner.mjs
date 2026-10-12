// 确认首页 Banner 区块是否渲染、用的是哪个图片地址。
const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3002'

const html = await (await fetch(`${base}/`, { signal: AbortSignal.timeout(60000) })).text()
console.log(`首页 HTML 长度 ${html.length}`)

const at = html.indexOf('home-banner__img')
if (at < 0) {
  console.log('banner 区块：未渲染')
} else {
  console.log(`banner 区块：已渲染 (@${at})`)
  const slice = html.slice(at, at + 500)
  const match = slice.match(/src="([^"]+)"/)
  console.log(`banner 图片地址：${match ? match[1] : '(未找到 src)'}`)
}

// 顺带确认页脚微信在电话之前
const footerAt = html.indexOf('site-footer__contact-list')
if (footerAt >= 0) {
  const block = html.slice(footerAt, footerAt + 1200)
  const order = ['微信', '电话', '邮箱', '地址']
    .map((label) => ({ label, at: block.indexOf(`>${label}<`) }))
    .filter((item) => item.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((item) => item.label)
  console.log(`页脚「联系我们」顺序：${order.join(' → ')}`)
}
