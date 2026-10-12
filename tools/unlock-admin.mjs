// 开发期解锁 admin 账号（清除登录锁定与失败计数）。
//
// 背景：反复用错误密码调登录接口会触发两道限制——
//   1) admin_users 表上的 failed_login_count / locked_until（账号级锁定）
//   2) admin_login_attempts 上的 IP/用户名频率限制（返回 429）
// 调试脚本时很容易把自己锁在外面，这个脚本用于本地开发环境快速恢复。
//
// 用法：node tools/unlock-admin.mjs [用户名]
import { executeSql, queryRows, resolveTargetConnection } from './migrate-legacy/mysql-client.mjs'

const username = process.argv[2] ?? 'admin'
const target = resolveTargetConnection()

const before = await queryRows(target,
  `SELECT username, status, failed_login_count, locked_until FROM admin_users WHERE username = '${username}'`)
if (before.length === 0) {
  console.error(`未找到账号：${username}`)
  process.exitCode = 1
} else {
  console.log('解锁前:', JSON.stringify(before[0]))

  // 1) 清除账号级锁定
  await executeSql(target, `
    UPDATE admin_users
    SET failed_login_count = 0, locked_until = NULL
    WHERE username = '${username}'`)

  // 2) 清除频率限制所依赖的失败记录，让 429 立即解除
  //    注意列名是 succeeded（不是 success）
  await executeSql(target, `
    DELETE FROM admin_login_attempts
    WHERE username = '${username}' AND succeeded = 0`)

  const after = await queryRows(target,
    `SELECT username, status, failed_login_count, locked_until FROM admin_users WHERE username = '${username}'`)
  console.log('解锁后:', JSON.stringify(after[0]))
  console.log('已清除该账号的失败登录记录，429 频率限制随之解除。')
}
