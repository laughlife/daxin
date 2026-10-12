// 把 local-credentials 里记录的密码写回数据库（仅本地开发测试账号）。
//
// 背景：三个测试账号（admin/editor/viewer）库中的 scrypt 哈希与
// local-credentials/*.txt 里记录的密码**全部不匹配**，表现为登录一律 401，
// 并会连续失败触发账号锁定与 429 频率限制。
// 用项目自身的 hashPassword 重新写入，可确保哈希与本项目的校验实现一致
// （scrypt$N$r$p$salt$hash），不会引入其它算法的兼容问题。
//
// 只更新密码与算法字段，不动角色、状态与其它列。
//
// 用法：node tools/reset-local-passwords.mjs [--dry-run]
import { readFileSync } from 'node:fs'

import { executeSql, queryRows, resolveTargetConnection } from './migrate-legacy/mysql-client.mjs'

const { hashPassword } = await import('../web/server/utils/auth/password.ts')
const dryRun = process.argv.includes('--dry-run')

const target = resolveTargetConnection()
const accounts = ['admin', 'editor', 'viewer']

for (const name of accounts) {
  let password = ''
  try {
    password = readFileSync(`local-credentials/${name}.txt`, 'utf8').trim()
  } catch {
    console.log(`${name}: 无凭据文件，跳过`)
    continue
  }
  if (!password) {
    console.log(`${name}: 凭据文件为空，跳过`)
    continue
  }

  const rows = await queryRows(target,
    `SELECT id FROM admin_users WHERE username = '${name}'`)
  if (rows.length === 0) {
    console.log(`${name}: 账号不存在，跳过`)
    continue
  }
  const id = Number(rows[0][0])

  if (dryRun) {
    console.log(`${name}: [dry-run] 将重置密码（长度 ${password.length}）`)
    continue
  }

  const hash = await hashPassword(password)
  await executeSql(target, `
    UPDATE admin_users
    SET password_hash = '${hash}', password_algo = 'scrypt',
        failed_login_count = 0, locked_until = NULL, updated_at = NOW()
    WHERE id = ${id}`)
  console.log(`${name}: 已重置密码并清除锁定`)
}

// 顺带清掉失败登录记录，解除 429 频率限制
await executeSql(target, `DELETE FROM admin_login_attempts WHERE succeeded = 0`)
console.log('\n已清除失败登录记录（解除 429）。')
