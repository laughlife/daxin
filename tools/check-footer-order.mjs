// 检查页脚「联系我们」四项的实际渲染顺序，并核对后台设置页的 general 组顺序。
const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3002'

const html = await (await fetch(`${base}/`, { signal: AbortSignal.timeout(60000) })).text()
console.log(`首页 HTML 长度 ${html.length}`)

const anchor = html.indexOf('site-footer__contact-list')
if (anchor < 0) {
  console.log('未找到 site-footer__contact-list')
} else {
  const block = html.slice(anchor, anchor + 1200)
  console.log('\n页脚「联系我们」各项出现位置：')
  const positions = []
  for (const label of ['微信', '电话', '邮箱', '地址']) {
    const at = block.indexOf(`>${label}<`)
    positions.push({ label, at })
    console.log(`  ${label}  ${at >= 0 ? `@${at}` : '未找到'}`)
  }
  const found = positions.filter((item) => item.at >= 0)
  const sorted = [...found].sort((a, b) => a.at - b.at).map((item) => item.label)
  console.log(`\n实际顺序：${sorted.join(' → ')}`)
  console.log(`期望顺序：微信 → 电话 → 邮箱 → 地址`)
  console.log(JSON.stringify(sorted) === JSON.stringify(['微信', '电话', '邮箱', '地址']) ? '✔ 顺序正确' : '✖ 顺序不符')
}
