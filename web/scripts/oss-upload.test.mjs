// OSS 配置、PostObject 策略与上传校验的验收测试。
//
// 纯逻辑测试：不连数据库、不访问网络，密钥全部为测试用假值。
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { test } from 'node:test'

import { getOssConfig, isOssConfigured, normalizeHttpsUrl } from '../server/utils/oss/config.ts'
import {
  UPLOAD_SCOPES,
  allowedMimeTypesFor,
  buildObjectKey,
  createPostObjectPolicy,
  isAllowedMimeType,
} from '../server/utils/oss/policy.ts'
import {
  buildPublicUrl,
  isWithinUploadLimit,
  validateMediaRegistration,
  validateUploadRequest,
} from '../server/utils/oss/validation.ts'

const TEST_SECRET = 'test-secret-not-a-real-credential'
const PUBLIC_HOST = 'dxfw-oss.oss-cn-shenzhen.aliyuncs.com'

const baseEnv = {
  ALIYUN_OSS_REGION: 'cn-shenzhen',
  ALIYUN_OSS_BUCKET: 'dxfw-oss',
  ALIYUN_OSS_ENDPOINT: 'oss-cn-shenzhen.aliyuncs.com',
  ALIYUN_OSS_ACCESS_KEY_ID: 'LTAI5tTESTKEYID00000000',
  ALIYUN_OSS_ACCESS_KEY_SECRET: TEST_SECRET,
  UPLOAD_MAX_BYTES: '20971520',
}

const config = getOssConfig(baseEnv)

const UUID = '9f1c2b3a-4d5e-6f70-8192-a3b4c5d6e7f8'
const OBJECT_KEY = `20261009/${UUID}.png`

// 北京时间 2026-10-09 12:00（UTC 04:00），用于日期窗口测试。
const BEIJING_NOON = new Date('2026-10-09T04:00:00Z')

function decodePolicy(policy) {
  return JSON.parse(Buffer.from(policy, 'base64').toString('utf8'))
}

test('缺少 OSS 环境变量时抛出点名变量的中文错误', () => {
  assert.throws(
    () => getOssConfig({}),
    (error) => /对象存储配置缺失/.test(error.message) && /ALIYUN_OSS_REGION/.test(error.message),
  )
  for (const name of [
    'ALIYUN_OSS_REGION',
    'ALIYUN_OSS_BUCKET',
    'ALIYUN_OSS_ENDPOINT',
    'ALIYUN_OSS_ACCESS_KEY_ID',
    'ALIYUN_OSS_ACCESS_KEY_SECRET',
  ]) {
    assert.throws(
      () => getOssConfig({ ...baseEnv, [name]: '  ' }),
      (error) => error.message.includes(name),
      `缺失 ${name} 时应点名该变量`,
    )
  }
})

test('isOssConfigured 在缺少变量时返回 false 而不抛异常', () => {
  assert.equal(isOssConfigured({}), false)
  assert.equal(isOssConfigured({ ...baseEnv, ALIYUN_OSS_BUCKET: '' }), false)
  assert.equal(isOssConfigured(baseEnv), true)
})

test('PUBLIC_BASE_URL 无协议时自动补 https 并去掉结尾斜杠', () => {
  const noScheme = getOssConfig({ ...baseEnv, ALIYUN_OSS_PUBLIC_BASE_URL: `${PUBLIC_HOST}/` })
  assert.equal(noScheme.publicBaseUrl, `https://${PUBLIC_HOST}`)

  const withScheme = getOssConfig({ ...baseEnv, ALIYUN_OSS_PUBLIC_BASE_URL: `https://${PUBLIC_HOST}/` })
  assert.equal(withScheme.publicBaseUrl, `https://${PUBLIC_HOST}`)

  const fallback = getOssConfig(baseEnv)
  assert.equal(fallback.publicBaseUrl, `https://${PUBLIC_HOST}`)
  assert.equal(fallback.publicBaseUrl, `https://${fallback.bucket}.${fallback.endpoint}`)

  assert.equal(normalizeHttpsUrl('example.com/'), 'https://example.com')
  assert.equal(normalizeHttpsUrl(''), '')
})

test('host 为 bucket 在前的虚拟主机形式，且与公网域名主机部分一致', () => {
  assert.equal(config.host, `https://${PUBLIC_HOST}`)
  assert.ok(config.host.startsWith(`https://${config.bucket}.`), 'host 必须带 bucket 前缀，否则 policy 的 bucket 条件不匹配')
  const base = new URL(config.publicBaseUrl)
  assert.equal(config.host, `${base.protocol}//${base.host}`)
})

test('UPLOAD_MAX_BYTES 缺失或非法时回落到 20MB', () => {
  assert.equal(getOssConfig({ ...baseEnv, UPLOAD_MAX_BYTES: undefined }).uploadMaxBytes, 20971520)
  assert.equal(getOssConfig({ ...baseEnv, UPLOAD_MAX_BYTES: '0' }).uploadMaxBytes, 20971520)
  assert.equal(getOssConfig({ ...baseEnv, UPLOAD_MAX_BYTES: '-1' }).uploadMaxBytes, 20971520)
  assert.equal(getOssConfig({ ...baseEnv, UPLOAD_MAX_BYTES: 'abc' }).uploadMaxBytes, 20971520)
  assert.equal(getOssConfig({ ...baseEnv, UPLOAD_MAX_BYTES: '1024' }).uploadMaxBytes, 1024)
})

test('对象键使用北京日期（UTC 17:00 已是次日）且扩展名小写', () => {
  // UTC 2026-10-09T17:00:00Z == 北京 2026-10-10 01:00，目录必须是 20261010。
  const key = buildObjectKey({ date: new Date('2026-10-09T17:00:00Z'), uuid: UUID, extension: 'PNG' })
  assert.equal(key, `20261010/${UUID}.png`)
  assert.match(key, /^\d{8}\/[0-9a-fA-F-]{8,64}\.png$/)

  // 北京 2026-10-10 00:00:00 == UTC 2026-10-09T16:00:00Z，边界前仍属 10-09。
  assert.equal(
    buildObjectKey({ date: new Date('2026-10-09T15:59:59Z'), uuid: UUID, extension: '.jpg' }).slice(0, 8),
    '20261009',
  )
  assert.equal(
    buildObjectKey({ date: new Date('2026-10-09T16:00:00Z'), uuid: UUID, extension: 'jpg' }).slice(0, 8),
    '20261010',
  )
  assert.throws(() => buildObjectKey({ date: new Date(), uuid: '', extension: 'png' }), /uuid/)
  assert.throws(() => buildObjectKey({ date: new Date(), uuid: UUID, extension: '' }), /扩展名/)
})

test('PostObject 策略：UTC Z 过期时间、必要条件与独立重算签名一致', () => {
  const policy = createPostObjectPolicy({ config, objectKey: OBJECT_KEY })
  const decoded = decodePolicy(policy.policy)

  assert.equal(typeof decoded.expiration, 'string')
  assert.match(decoded.expiration, /Z$/)
  assert.doesNotMatch(decoded.expiration, /\+08:00/)

  const conditions = decoded.conditions
  assert.deepEqual(conditions[0], { bucket: config.bucket })
  assert.deepEqual(conditions[1], ['eq', '$key', OBJECT_KEY])
  assert.deepEqual(conditions[2], ['content-length-range', 1, 20971520])
  assert.deepEqual(conditions[3], ['starts-with', '$Content-Type', ''])

  // 阿里云 PostObject 使用 HMAC-SHA1(base64 policy)：
  // 实测该桶对 HMAC-SHA256 及十六进制/URL 编码等变体一律返回 403 SignatureDoesNotMatch，
  // 而 SHA1 可正常上传；同一 AccessKey 的 Signature V1 直连请求也能读写，说明凭据无误。
  const expected = createHmac('sha1', TEST_SECRET).update(policy.policy).digest('base64')
  assert.equal(policy.signature, expected)
  const sha256Signature = createHmac('sha256', TEST_SECRET).update(policy.policy).digest('base64')
  assert.notEqual(policy.signature, sha256Signature, '签名必须使用 SHA1 而非 SHA256')
  assert.equal(policy.accessKeyId, baseEnv.ALIYUN_OSS_ACCESS_KEY_ID)
  assert.equal(policy.host, config.host)
  assert.equal(policy.key, OBJECT_KEY)
  assert.equal(policy.maxBytes, 20971520)
  assert.equal(policy.publicUrl, `https://${PUBLIC_HOST}/${OBJECT_KEY}`)
  assert.ok(policy.allowedMimeTypes.includes('image/png'))

  const serialized = JSON.stringify(policy)
  assert.equal(serialized.includes(TEST_SECRET), false, '策略对象不得包含 AccessKey Secret')
  assert.equal('accessKeySecret' in policy, false)

  const other = createPostObjectPolicy({ config, objectKey: `20261009/${UUID}.jpg` })
  assert.notEqual(other.signature, policy.signature)
})

test('策略过期：过去签发的凭证已过期，默认有效期为 300 秒', () => {
  const issuedAt = new Date('2020-01-01T00:00:00Z')
  const policy = createPostObjectPolicy({ config, objectKey: OBJECT_KEY, now: issuedAt, expireSeconds: 300 })
  assert.equal(policy.expireAt, issuedAt.getTime() + 300000)
  assert.ok(policy.expireAt < Date.now(), '过去签发的策略必须已过期')
  assert.equal(decodePolicy(policy.policy).expiration, '2020-01-01T00:05:00.000Z')

  const withDefault = createPostObjectPolicy({ config, objectKey: OBJECT_KEY, now: issuedAt })
  assert.equal(withDefault.expireAt, issuedAt.getTime() + 300000)

  const custom = createPostObjectPolicy({ config, objectKey: OBJECT_KEY, now: issuedAt, expireSeconds: 60, maxBytes: 1024 })
  assert.equal(custom.expireAt, issuedAt.getTime() + 60000)
  assert.deepEqual(decodePolicy(custom.policy).conditions[2], ['content-length-range', 1, 1024])
  assert.equal(custom.maxBytes, 1024)
})

test('20MB 边界：恰好等于上限通过，多 1 字节失败', () => {
  assert.equal(isWithinUploadLimit(20971520, config), true)
  assert.equal(isWithinUploadLimit(20971521, config), false)
  assert.equal(isWithinUploadLimit(0, config), false)

  const payload = { fileName: 'logo.png', mimeType: 'image/png', usageScope: 'logo' }
  assert.equal(validateUploadRequest({ ...payload, byteSize: 20971520 }, config).ok, true)

  const tooLarge = validateUploadRequest({ ...payload, byteSize: 20971521 }, config)
  assert.equal(tooLarge.ok, false)
  assert.equal(tooLarge.error.code, 'byte_size_too_large')
  assert.match(tooLarge.error.message, /20971520/)
})

test('上传请求校验：文件名、大小与用途的非法输入被拒绝', () => {
  const valid = { fileName: 'banner.webp', byteSize: 2048, mimeType: 'image/webp', usageScope: 'banner' }
  assert.deepEqual(validateUploadRequest(valid, config), { ok: true })

  const emptyName = validateUploadRequest({ ...valid, fileName: '   ' }, config)
  assert.equal(emptyName.error.code, 'file_name_required')

  const longName = validateUploadRequest({ ...valid, fileName: `${'a'.repeat(256)}.png` }, config)
  assert.equal(longName.error.code, 'file_name_too_long')
  assert.equal(validateUploadRequest({ ...valid, fileName: `${'a'.repeat(251)}.png` }, config).ok, true)

  assert.equal(validateUploadRequest({ ...valid, byteSize: 0 }, config).error.code, 'byte_size_invalid')
  assert.equal(validateUploadRequest({ ...valid, byteSize: -5 }, config).error.code, 'byte_size_invalid')
  assert.equal(validateUploadRequest({ ...valid, byteSize: 1.5 }, config).error.code, 'byte_size_invalid')
  assert.equal(validateUploadRequest({ ...valid, byteSize: 'abc' }, config).error.code, 'byte_size_invalid')
  assert.equal(validateUploadRequest({ ...valid, byteSize: '2048' }, config).ok, true)

  const badScope = validateUploadRequest({ ...valid, usageScope: 'shell' }, config)
  assert.equal(badScope.error.code, 'usage_scope_invalid')
  assert.match(badScope.error.message, /用途/)

  assert.deepEqual([...UPLOAD_SCOPES].includes('article'), true)
})

test('MIME 白名单：位图放行，SVG/HTML/可执行文件拒绝，PDF 仅限文章', () => {
  const imageScopes = ['logo', 'background', 'banner', 'article', 'about', 'qr', 'general']
  for (const mimeType of ['image/jpeg', 'image/png', 'image/webp', 'image/gif']) {
    for (const scope of imageScopes) {
      assert.equal(isAllowedMimeType(scope, mimeType), true, `${scope} 应允许 ${mimeType}`)
    }
  }

  assert.deepEqual(allowedMimeTypesFor('banner'), ['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
  assert.deepEqual(allowedMimeTypesFor('article'), ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'])

  for (const mimeType of ['text/html', 'image/svg+xml', 'application/x-msdownload', 'text/javascript', '']) {
    assert.equal(isAllowedMimeType('general', mimeType), false, `不应允许 ${mimeType || '（空）'}`)
  }

  assert.equal(validateUploadRequest(
    { fileName: 'doc.pdf', byteSize: 1024, mimeType: 'application/pdf', usageScope: 'article' },
    config,
  ).ok, true)
  const pdfOutsideArticle = validateUploadRequest(
    { fileName: 'doc.pdf', byteSize: 1024, mimeType: 'application/pdf', usageScope: 'general' },
    config,
  )
  assert.equal(pdfOutsideArticle.ok, false)
  assert.equal(pdfOutsideArticle.error.code, 'mime_type_not_allowed')
})

test('媒体登记：合法对象键通过', () => {
  assert.deepEqual(
    validateMediaRegistration({ objectKey: OBJECT_KEY, byteSize: 4096, mimeType: 'image/png' }, config, { now: BEIJING_NOON }),
    { ok: true },
  )
  assert.equal(
    validateMediaRegistration(
      { objectKey: `20261009/${UUID}.pdf`, byteSize: 4096, mimeType: 'application/pdf' },
      config,
      { now: BEIJING_NOON },
    ).ok,
    true,
  )
  // 7 天前仍在窗口内，8 天前过期。
  assert.equal(
    validateMediaRegistration(
      { objectKey: `20261002/${UUID}.jpg`, byteSize: 1, mimeType: 'image/jpeg' },
      config,
      { now: BEIJING_NOON },
    ).ok,
    true,
  )
  assert.equal(
    validateMediaRegistration(
      { objectKey: `20261001/${UUID}.jpg`, byteSize: 1, mimeType: 'image/jpeg' },
      config,
      { now: BEIJING_NOON },
    ).error.code,
    'object_key_date_expired',
  )
})

test('媒体登记：路径穿越、绝对路径、外链与非法日期全部拒绝', () => {
  const request = (objectKey) => validateMediaRegistration(
    { objectKey, byteSize: 4096, mimeType: 'image/png' },
    config,
    { now: BEIJING_NOON },
  )

  assert.equal(request('../etc/passwd').error.code, 'object_key_unsafe')
  assert.equal(request('20261009/../../etc/passwd.png').error.code, 'object_key_unsafe')
  assert.equal(request('\\20261009\\x.png').error.code, 'object_key_unsafe')
  assert.equal(request('/abs/path.jpg').error.code, 'object_key_unsafe')
  assert.equal(request('https://evil.example/x.jpg').error.code, 'object_key_unsafe')
  assert.equal(request('').error.code, 'object_key_required')

  // 未来日期与超过 7 天的旧日期。
  assert.equal(request(`20261010/${UUID}.png`).error.code, 'object_key_date_future')
  assert.equal(request(`20261001/${UUID}.png`).error.code, 'object_key_date_expired')
  // 非法日历日期与格式错误。
  assert.equal(request(`20261332/${UUID}.png`).error.code, 'object_key_date_invalid')
  assert.equal(request('20260230/aaaaaaaa.png').error.code, 'object_key_date_invalid')
  assert.equal(request('20261009/short.png').error.code, 'object_key_invalid')
  assert.equal(request(`20261009/${UUID}.svg`).error.code, 'object_key_invalid')
  assert.equal(request(`202610091/${UUID}.png`).error.code, 'object_key_invalid')

  // 大小与类型仍然受同一套规则约束。
  assert.equal(
    validateMediaRegistration({ objectKey: OBJECT_KEY, byteSize: 20971521, mimeType: 'image/png' }, config, { now: BEIJING_NOON }).error.code,
    'byte_size_too_large',
  )
  assert.equal(
    validateMediaRegistration({ objectKey: OBJECT_KEY, byteSize: 1, mimeType: 'text/html' }, config, { now: BEIJING_NOON }).error.code,
    'mime_type_not_allowed',
  )
  assert.equal(
    validateMediaRegistration({ objectKey: OBJECT_KEY, byteSize: 1, mimeType: 'application/pdf' }, config, { now: BEIJING_NOON }).error.code,
    'mime_type_not_allowed',
  )
})

test('buildPublicUrl 只会产生一个斜杠且始终带协议', () => {
  assert.equal(buildPublicUrl(config, OBJECT_KEY), `https://${PUBLIC_HOST}/${OBJECT_KEY}`)
  assert.equal(buildPublicUrl(config, `/${OBJECT_KEY}`), `https://${PUBLIC_HOST}/${OBJECT_KEY}`)
  assert.equal(buildPublicUrl({ publicBaseUrl: `https://${PUBLIC_HOST}/` }, `/${OBJECT_KEY}`), `https://${PUBLIC_HOST}/${OBJECT_KEY}`)
  assert.equal(buildPublicUrl({ publicBaseUrl: PUBLIC_HOST }, OBJECT_KEY), `https://${PUBLIC_HOST}/${OBJECT_KEY}`)
  assert.doesNotMatch(buildPublicUrl(config, `/${OBJECT_KEY}`), /[^:]\/\//)
})
