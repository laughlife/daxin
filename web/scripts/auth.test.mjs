// Task 4 验收测试：密码哈希、Session 令牌与角色权限。
//
// 这些测试只覆盖纯逻辑，不需要数据库连接，因此可以在任何环境运行。
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  PASSWORD_ALGORITHM,
  hashPassword,
  isSupportedHash,
  needsRehash,
  verifyPassword,
} from '../server/utils/auth/password.ts'

import {
  DEFAULT_SESSION_TTL_SECONDS,
  SESSION_COOKIE_NAME,
  buildSessionCookie,
  createSessionToken,
  hashSessionToken,
  isSessionExpired,
  parseSessionCookie,
} from '../server/utils/auth/session.ts'

import {
  ROLE_CODES,
  canAccessPath,
  defaultRouteForRoles,
  hasPermission,
  permissionsForRoles,
  requirePermission,
} from '../server/utils/auth/permissions.ts'

test('密码哈希使用 scrypt 并产生可校验的编码格式', async () => {
  const hash = await hashPassword('S3cret-密码-长口令')
  assert.match(hash, /^scrypt\$/)
  assert.equal(isSupportedHash(hash), true)
  assert.equal(await verifyPassword('S3cret-密码-长口令', hash), true)
  assert.equal(await verifyPassword('错误密码', hash), false)
  assert.equal(PASSWORD_ALGORITHM, 'scrypt')
})

test('相同密码每次哈希不同（随机盐）', async () => {
  const first = await hashPassword('same-password')
  const second = await hashPassword('same-password')
  assert.notEqual(first, second)
  assert.equal(await verifyPassword('same-password', first), true)
  assert.equal(await verifyPassword('same-password', second), true)
})

test('空密码与过短密码被拒绝', async () => {
  await assert.rejects(() => hashPassword(''), /密码/)
  await assert.rejects(() => hashPassword('short'), /长度/)
})

test('非法哈希格式不会被误判通过', async () => {
  assert.equal(isSupportedHash('plaintext'), false)
  assert.equal(await verifyPassword('任意密码', 'plaintext'), false)
  assert.equal(await verifyPassword('任意密码', ''), false)
  assert.equal(await verifyPassword('任意密码', 'scrypt$broken'), false)
  assert.equal(await verifyPassword('任意密码', 'bcrypt$1$abc'), false)
})

test('参数低于当前标准时要求重新哈希', async () => {
  const weak = await hashPassword('another-password', { cost: 1024 })
  assert.equal(await verifyPassword('another-password', weak), true)
  assert.equal(needsRehash(weak), true)
  const strong = await hashPassword('another-password')
  assert.equal(needsRehash(strong), false)
  assert.equal(needsRehash('not-a-hash'), true)
})

test('Session 令牌随机、足够长且只以哈希入库', () => {
  const first = createSessionToken()
  const second = createSessionToken()
  assert.notEqual(first, second)
  assert.ok(first.length >= 43, `令牌长度不足：${first.length}`)
  assert.match(first, /^[A-Za-z0-9_-]+$/)

  const hash = hashSessionToken(first)
  assert.match(hash, /^[0-9a-f]{64}$/)
  assert.notEqual(hash, first)
  assert.equal(hashSessionToken(first), hash)
})

test('Session 过期判断使用服务端时间，边界为到期即失效', () => {
  const now = new Date('2026-10-09T12:00:00Z')
  assert.equal(isSessionExpired(new Date('2026-10-09T12:00:01Z'), now), false)
  assert.equal(isSessionExpired(new Date('2026-10-09T12:00:00Z'), now), true)
  assert.equal(isSessionExpired(new Date('2026-10-08T12:00:00Z'), now), true)
  assert.equal(isSessionExpired('2026-10-09T12:00:01Z', now), false)
})

test('Session Cookie 使用 HttpOnly 与 SameSite，并支持解析', () => {
  const cookie = buildSessionCookie('token-value', { maxAgeSeconds: 3600, secure: true })
  assert.match(cookie, new RegExp(SESSION_COOKIE_NAME))
  assert.match(cookie, /HttpOnly/)
  assert.match(cookie, /SameSite=Lax/)
  assert.match(cookie, /Path=\//)
  assert.match(cookie, /Max-Age=3600/)
  assert.match(cookie, /Secure/)

  const insecure = buildSessionCookie('token-value', { maxAgeSeconds: 3600, secure: false })
  assert.doesNotMatch(insecure, /Secure/)

  const cleared = buildSessionCookie('', { maxAgeSeconds: 0 })
  assert.match(cleared, /Max-Age=0/)

  assert.equal(parseSessionCookie(`${SESSION_COOKIE_NAME}=abc123; other=1`), 'abc123')
  assert.equal(parseSessionCookie('other=1'), '')
  assert.equal(parseSessionCookie(undefined), '')
  assert.equal(parseSessionCookie(`${SESSION_COOKIE_NAME}=`), '')
  assert.equal(DEFAULT_SESSION_TTL_SECONDS >= 1800, true)
})

test('权限规则：admin 全量、editor 内容与媒体、viewer 只读', () => {
  assert.equal(hasPermission(['admin'], 'admin:user:write'), true)
  assert.equal(hasPermission(['admin'], 'article:write'), true)
  assert.equal(hasPermission(['editor'], 'article:write'), true)
  assert.equal(hasPermission(['editor'], 'media:write'), true)
  assert.equal(hasPermission(['editor'], 'admin:user:write'), false)
  assert.equal(hasPermission(['viewer'], 'article:read'), true)
  assert.equal(hasPermission(['viewer'], 'article:write'), false)
  assert.equal(hasPermission([], 'article:read'), false)
  assert.equal(hasPermission(['unknown-role'], 'article:read'), false)
})

test('多角色合并权限，且不重复', () => {
  const permissions = permissionsForRoles(['editor', 'viewer'])
  assert.equal(permissions.filter((item) => item === 'article:read').length, 1)
  assert.equal(hasPermission(['editor', 'viewer'], 'article:write'), true)
  assert.equal(hasPermission(['editor', 'viewer'], 'admin:user:write'), false)
})

test('requirePermission 对缺权限抛出可识别错误', () => {
  assert.doesNotThrow(() => requirePermission(['editor'], 'article:write'))
  assert.throws(
    () => requirePermission(['viewer'], 'article:write'),
    (error) => error.statusCode === 403 && /权限/.test(error.message),
  )
  assert.throws(
    () => requirePermission([], 'article:read'),
    (error) => error.statusCode === 401,
  )
})

test('登录后跳转路径按角色区分，且拒绝后台外部路径', () => {
  assert.equal(defaultRouteForRoles(['admin']), '/admin')
  assert.equal(defaultRouteForRoles(['editor']), '/admin')
  assert.equal(defaultRouteForRoles(['viewer']), '/admin')
  assert.equal(defaultRouteForRoles([]), '/admin/login')

  assert.equal(canAccessPath(['viewer'], '/admin/articles'), true)
  assert.equal(canAccessPath(['viewer'], '/admin/articles/new'), false)
  assert.equal(canAccessPath(['editor'], '/admin/articles/new'), true)
  assert.equal(canAccessPath(['viewer'], '/admin/users'), false)
  assert.equal(canAccessPath(['admin'], '/admin/users'), true)
  assert.equal(canAccessPath(['admin'], '/'), true)
  assert.equal(canAccessPath(['admin'], '/admin/settings'), true)
  assert.equal(canAccessPath(['editor'], '/admin/settings'), true)
})

test('角色常量与设计文档一致', () => {
  assert.deepEqual([...ROLE_CODES].sort(), ['admin', 'editor', 'viewer'])
})
