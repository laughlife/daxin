#!/usr/bin/env node
// 一次性创建或更新首个管理员账号。
//
// 密码来源（按优先级）：
//   1. --password-stdin：从标准输入读取（适合 CI：`echo "$PASSWORD" | node tools/create-admin.mjs --password-stdin`）
//   2. 环境变量 DAXIN_ADMIN_PASSWORD
//   3. 环境变量 DAXIN_ADMIN_PASSWORD_FILE 指向的文件内容
// 没有可用来源时直接报错退出：不交互提示、不生成随机密码、不写默认密码。
//
// 哈希格式必须与 web/server/utils/auth/password.ts 保持完全一致：
//   scrypt$N$r$p$saltBase64$hashBase64（N=16384、r=8、p=1、32 字节派生密钥、16 字节盐）
// 任何一侧改动格式都会导致在线登录校验失败，修改时务必同步。
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { promisify } from 'node:util'

import { executeSql, queryRows, quoteLiteral, resolveTargetConnection } from './migrate-legacy/mysql-client.mjs'

const scrypt = promisify(scryptCallback)

const SCRYPT_PARAMS = { cost: 16384, blockSize: 8, parallelization: 1, keyLength: 32, saltBytes: 16 }
const PASSWORD_ALGORITHM = 'scrypt'
const MIN_PASSWORD_LENGTH = 8
const MAX_PASSWORD_LENGTH = 200
const USERNAME_PATTERN = /^[A-Za-z0-9._-]{1,64}$/
const ROLE_PATTERN = /^[A-Za-z0-9_-]{1,32}$/

const USAGE = `用法：node tools/create-admin.mjs [选项]

选项：
  --username <name>       管理员登录名，默认 admin
  --display-name <name>   显示名，默认与登录名一致
  --role <code>           角色码（admin/editor/viewer），默认 admin
  --password-stdin        从标准输入读取密码
  -h, --help              显示帮助

密码来源优先级：--password-stdin > DAXIN_ADMIN_PASSWORD > DAXIN_ADMIN_PASSWORD_FILE`

function fail(message) {
  console.error(`✖ ${message}`)
  process.exit(1)
}

function parseArgs(argv) {
  const options = { username: 'admin', displayName: '', role: 'admin', passwordStdin: false, help: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = String(argv[index])
    const separator = arg.indexOf('=')
    const name = separator === -1 ? arg : arg.slice(0, separator)
    const inlineValue = separator === -1 ? null : arg.slice(separator + 1)
    const takeValue = () => {
      if (inlineValue !== null) return inlineValue
      index += 1
      return argv[index] ?? ''
    }
    switch (name) {
      case '--username':
        options.username = String(takeValue()).trim()
        break
      case '--display-name':
        options.displayName = String(takeValue()).trim()
        break
      case '--role':
        options.role = String(takeValue()).trim()
        break
      case '--password-stdin':
        options.passwordStdin = true
        break
      case '--help':
      case '-h':
        options.help = true
        break
      default:
        fail(`未知参数：${arg}\n\n${USAGE}`)
    }
  }
  return options
}

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

/** 解析密码与其来源说明；读到的密码只保留末尾换行以外的原始内容。 */
async function resolvePassword(options) {
  if (options.passwordStdin) {
    if (process.stdin.isTTY) fail('--password-stdin 需要管道输入，例如：printf %s "$PASSWORD" | node tools/create-admin.mjs --password-stdin')
    const value = (await readStdin()).replace(/\r?\n$/, '')
    if (value) return { password: value, source: '标准输入' }
    return { password: '', source: '' }
  }

  const fromEnv = process.env.DAXIN_ADMIN_PASSWORD ?? ''
  if (fromEnv) return { password: fromEnv, source: '环境变量 DAXIN_ADMIN_PASSWORD' }

  const file = process.env.DAXIN_ADMIN_PASSWORD_FILE ?? ''
  if (file) {
    if (!existsSync(file)) fail(`DAXIN_ADMIN_PASSWORD_FILE 指向的文件不存在：${file}`)
    const value = readFileSync(file, 'utf8').replace(/\r?\n$/, '')
    if (value) return { password: value, source: `密码文件 ${file}` }
  }

  return { password: '', source: '' }
}

/** 生成 scrypt 哈希，格式与 web/server/utils/auth/password.ts 完全一致。 */
async function hashPassword(password) {
  const salt = randomBytes(SCRYPT_PARAMS.saltBytes)
  const hash = await scrypt(password, salt, SCRYPT_PARAMS.keyLength, {
    N: SCRYPT_PARAMS.cost,
    r: SCRYPT_PARAMS.blockSize,
    p: SCRYPT_PARAMS.parallelization,
    maxmem: 256 * 1024 * 1024,
  })
  return [
    PASSWORD_ALGORITHM,
    SCRYPT_PARAMS.cost,
    SCRYPT_PARAMS.blockSize,
    SCRYPT_PARAMS.parallelization,
    salt.toString('base64'),
    hash.toString('base64'),
  ].join('$')
}

/** 自检：确保写入的哈希能被同一算法校验通过（只比较派生密钥，不涉及明文输出）。 */
async function verifyHash(password, encoded) {
  const parts = String(encoded).split('$')
  if (parts.length !== 6) return false
  const salt = Buffer.from(parts[4], 'base64')
  const expected = Buffer.from(parts[5], 'base64')
  const derived = await scrypt(password, salt, expected.length, {
    N: Number(parts[1]),
    r: Number(parts[2]),
    p: Number(parts[3]),
    maxmem: 256 * 1024 * 1024,
  })
  return derived.length === expected.length && timingSafeEqual(derived, expected)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(USAGE)
    return
  }

  if (!USERNAME_PATTERN.test(options.username)) fail('登录名只能是 1-64 位的字母、数字、点、下划线或连字符')
  if (!ROLE_PATTERN.test(options.role)) fail('角色码只能是 1-32 位的字母、数字、下划线或连字符')

  const { password, source } = await resolvePassword(options)
  if (!password) {
    fail(`未提供管理员密码。请设置 DAXIN_ADMIN_PASSWORD 或 DAXIN_ADMIN_PASSWORD_FILE，或使用 --password-stdin。\n\n${USAGE}`)
  }
  if (password.length < MIN_PASSWORD_LENGTH) fail(`密码长度至少 ${MIN_PASSWORD_LENGTH} 位`)
  if (password.length > MAX_PASSWORD_LENGTH) fail(`密码长度不能超过 ${MAX_PASSWORD_LENGTH} 位`)

  const connection = resolveTargetConnection()
  if (!connection) {
    fail('未找到目标数据库连接：请在 web/.env 配置 DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME，或使用同名环境变量。')
  }

  const displayName = options.displayName || options.username
  const roleRows = await queryRows(connection, `SELECT id FROM admin_roles WHERE code = ${quoteLiteral(options.role)} LIMIT 1`)
  const roleId = roleRows[0]?.[0]
  if (!roleId) fail(`角色 ${options.role} 不存在，请先执行 database/migrations 下的初始化脚本`)

  const encodedHash = await hashPassword(password)
  if (!(await verifyHash(password, encodedHash))) fail('密码哈希自检失败，已中止写入')

  const existingRows = await queryRows(connection, `SELECT id FROM admin_users WHERE username = ${quoteLiteral(options.username)} LIMIT 1`)
  const existingId = existingRows[0]?.[0]
  let action = '新建'
  let userId = existingId

  if (existingId) {
    action = '更新'
    await executeSql(connection, `UPDATE admin_users
SET display_name = ${quoteLiteral(displayName)},
    password_hash = ${quoteLiteral(encodedHash)},
    password_algo = ${quoteLiteral(PASSWORD_ALGORITHM)},
    status = 'active',
    failed_login_count = 0,
    locked_until = NULL,
    updated_at = NOW()
WHERE id = ${quoteLiteral(existingId)}`)
  } else {
    await executeSql(connection, `INSERT INTO admin_users
  (username, display_name, password_hash, password_algo, email, status, failed_login_count, created_at, updated_at)
VALUES
  (${quoteLiteral(options.username)}, ${quoteLiteral(displayName)}, ${quoteLiteral(encodedHash)},
   ${quoteLiteral(PASSWORD_ALGORITHM)}, '', 'active', 0, NOW(), NOW())`)
    const insertedRows = await queryRows(connection, `SELECT id FROM admin_users WHERE username = ${quoteLiteral(options.username)} LIMIT 1`)
    userId = insertedRows[0]?.[0]
    if (!userId) fail('管理员写入后未能读取到主键，请检查数据库权限')
  }

  await executeSql(connection, `INSERT IGNORE INTO admin_user_roles (user_id, role_id, created_at)
VALUES (${quoteLiteral(userId)}, ${quoteLiteral(roleId)}, NOW())`)

  console.log('✔ 管理员账号已就绪')
  console.log(`  操作：${action}`)
  console.log(`  登录名：${options.username}`)
  console.log(`  显示名：${displayName}`)
  console.log(`  角色：${options.role}`)
  console.log(`  密码来源：${source}（未打印密码）`)
  console.log(`  密码算法：${PASSWORD_ALGORITHM}（哈希已写入 admin_users.password_hash）`)
  console.log('  请使用该账号登录 /admin/login，并在首次登录后妥善保管密码。')
}

main().catch((error) => {
  fail(error?.message ? String(error.message) : String(error))
})
