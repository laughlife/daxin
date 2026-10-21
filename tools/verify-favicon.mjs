// 验证 favicon 配置是否端到端生效：
// 临时把 site_favicon 指向已有 logo 地址，看页面是否输出 <link rel="icon">，然后还原为空。
import { execFileSync } from 'node:child_process'

const MYSQL = 'C:\\Environment\\mysql-8.4.9\\bin\\mysql.exe'

function sql(statement) {
  return execFileSync(MYSQL, [
    '--login-path=daxin', '--host=127.0.0.1', '--port=3306', '--user=root',
    '--connect-timeout=5', '--batch', '--skip-column-names', '--default-character-set=utf8mb4',
    '--execute', `USE daxin; ${statement}`,
  ], { encoding: 'utf8' }).trim()
}

// site_logo 的 setting_value 可能为空（只写了 media_id），
// 退而用合作伙伴图片里的一张真实 OSS 地址来验证链路。
const logoSrc = sql("SELECT setting_value FROM site_settings WHERE setting_key='site_logo' AND is_current=1")
  || JSON.parse(sql("SELECT setting_value FROM site_settings WHERE setting_key='about_partner_images' AND is_current=1") || '[]')[0]
  || ''
if (!logoSrc) {
  console.log('没有 site_logo 可用于验证，跳过')
  process.exit(0)
}

async function iconLinks() {
  const html = await (await fetch('http://127.0.0.1:3002/')).text()
  const found = []
  let index = html.indexOf('rel="icon"')
  while (index !== -1) {
    found.push(html.slice(Math.max(0, index - 120), index + 40).replace(/\s+/g, ' '))
    index = html.indexOf('rel="icon"', index + 1)
  }
  return found
}

try {
  console.log('=== 1) 未配置时 ===')
  console.log('icon 标签数:', (await iconLinks()).length)

  sql(`UPDATE site_settings SET setting_value='${logoSrc}', updated_at=NOW() WHERE setting_key='site_favicon' AND is_current=1`)
  // 等待 dev 服务重新取设置（公开接口有缓存时可能需要几秒）
  await new Promise((resolve) => setTimeout(resolve, 3000))
  console.log('=== 2) 配置后 ===')
  const links = await iconLinks()
  console.log('icon 标签数:', links.length)
  links.slice(0, 1).forEach((text) => console.log('  ', text.slice(0, 140)))
  console.log('引用的地址是否为配置的 logo:', links.some((text) => text.includes(logoSrc.slice(-24))))
} finally {
  sql("UPDATE site_settings SET setting_value='', updated_at=NOW() WHERE setting_key='site_favicon' AND is_current=1")
  console.log('=== 3) 已还原为空 ===')
}
