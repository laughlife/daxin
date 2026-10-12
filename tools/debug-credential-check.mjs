// 直接调用项目的密码校验函数，确认凭据文件里的密码是否与库中哈希匹配。
// 避免通过 HTTP 登录来排查（那还会触发登录频率限制）。
import { readFileSync } from 'node:fs'
import { queryRows, resolveTargetConnection } from './migrate-legacy/mysql-client.mjs'

const { verifyPassword } = await import('../web/server/utils/auth/password.ts').catch(() => ({}))

const target = resolveTargetConnection()

for (const name of ['admin', 'editor', 'viewer']) {
  const rows = await queryRows(target,
    `SELECT password_hash FROM admin_users WHERE username = '${name}'`)
  if (rows.length === 0) {
    console.log(`${name}: 账号不存在`)
    continue
  }
  const hash = String(rows[0][0])
  let password = ''
  try {
    password = readFileSync(`local-credentials/${name}.txt`, 'utf8').trim()
  } catch {
    console.log(`${name}: 读取凭据文件失败`)
    continue
  }
  console.log(`${name}: 密码长度=${password.length} 哈希前缀=${hash.slice(0, 24)}…`)
  if (typeof verifyPassword !== 'function') {
    console.log('  （无法直接导入 verifyPassword，改用 HTTP 方式）')
    continue
  }
  const ok = await verifyPassword(password, hash)
  console.log(`  直接校验结果: ${ok ? '匹配' : '不匹配'}`)
}
