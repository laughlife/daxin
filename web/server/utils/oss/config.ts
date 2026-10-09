// 阿里云 OSS 配置读取。
//
// 约定：
//   - 本模块只在服务端使用。accessKeySecret 属于私密凭据，绝不能出现在任何返回给客户端、
//     写入日志或拼进上传表单的结构中；只有 accessKeyId 与签名后的 policy 可以下发给浏览器。
//   - ALIYUN_OSS_ENDPOINT 只写主机名（不含协议、不含 Bucket 前缀），例如 oss-cn-shenzhen.aliyuncs.com。
//   - host 是 PostObject 表单的提交目标。OSS 同时支持两种访问形式：
//       虚拟主机形式 https://<bucket>.<endpoint> —— Bucket 出现在域名最前面；
//       路径形式     https://<endpoint>          —— 域名里不含 Bucket，Bucket 只出现在 policy 条件里。
//     本项目配置的公网域名（ALIYUN_OSS_PUBLIC_BASE_URL）是 bucket 在前的虚拟主机形式，
//     因此 host 取 https://<bucket>.<endpoint>，与公网域名的主机部分完全一致；
//     Bucket 不会重复出现在 key 中，PostObject 表单里 host 与 policy 的 bucket 条件必须同源。
//   - publicBaseUrl 缺少协议时自动补 https://，并去掉结尾斜杠，保证拼出的公网地址可直接使用。

/** 20MB：与 web/.env 的 UPLOAD_MAX_BYTES 默认值一致。 */
const DEFAULT_UPLOAD_MAX_BYTES = 20 * 1024 * 1024

/** OSS 运行时配置；accessKeySecret 仅限服务端使用，不对外暴露。 */
export type OssConfig = {
  region: string
  bucket: string
  endpoint: string
  accessKeyId: string
  accessKeySecret: string
  publicBaseUrl: string
  uploadMaxBytes: number
  host: string
}

/** 环境变量视图；与 process.env 结构兼容，便于测试注入。 */
type EnvLike = Record<string, string | undefined>

/** 必须显式配置的变量；缺失时给出点名变量的中文错误。 */
const REQUIRED_VARIABLES = [
  'ALIYUN_OSS_REGION',
  'ALIYUN_OSS_BUCKET',
  'ALIYUN_OSS_ENDPOINT',
  'ALIYUN_OSS_ACCESS_KEY_ID',
  'ALIYUN_OSS_ACCESS_KEY_SECRET',
] as const

function envValue(env: EnvLike | undefined, name: string): string {
  return String(env?.[name] ?? '').trim()
}

/** 补协议并去掉结尾斜杠；已显式写 http:// 时保留（本地/自建域名场景）。 */
export function normalizeHttpsUrl(value: string): string {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return ''
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  return withScheme.replace(/\/+$/, '')
}

/** endpoint 只保留主机名：去掉协议、路径与结尾斜杠。 */
function normalizeEndpointHost(endpoint: string): string {
  return endpoint
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .replace(/\/+$/, '')
    .trim()
}

/** 解析上传大小上限；缺失、非数字或非正整数时回落到 20MB。 */
function parseUploadMaxBytes(raw: string): number {
  if (!/^\d+$/.test(raw)) return DEFAULT_UPLOAD_MAX_BYTES
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value <= 0) return DEFAULT_UPLOAD_MAX_BYTES
  return value
}

/** 读取并校验 OSS 配置；缺少必需变量时抛出点名变量的中文错误。 */
export function getOssConfig(env: EnvLike = process.env): OssConfig {
  const missing = REQUIRED_VARIABLES.filter((name) => envValue(env, name) === '')
  if (missing.length > 0) {
    throw new Error(`对象存储配置缺失：环境变量 ${missing.join('、')} 未设置`)
  }

  const region = envValue(env, 'ALIYUN_OSS_REGION')
  const bucket = envValue(env, 'ALIYUN_OSS_BUCKET')
  const endpoint = normalizeEndpointHost(envValue(env, 'ALIYUN_OSS_ENDPOINT'))
  const accessKeyId = envValue(env, 'ALIYUN_OSS_ACCESS_KEY_ID')
  const accessKeySecret = envValue(env, 'ALIYUN_OSS_ACCESS_KEY_SECRET')
  const uploadMaxBytes = parseUploadMaxBytes(envValue(env, 'UPLOAD_MAX_BYTES'))

  const configuredBase = envValue(env, 'ALIYUN_OSS_PUBLIC_BASE_URL')
  const publicBaseUrl = configuredBase
    ? normalizeHttpsUrl(configuredBase)
    : normalizeHttpsUrl(`${bucket}.${endpoint}`)

  // 与公网域名保持同一形式：域名以 <bucket>. 开头即虚拟主机形式，host 与之一致；
  // 否则按路径形式提交，Bucket 只作为 policy 条件。
  const baseHost = normalizeEndpointHost(publicBaseUrl)
  const host = baseHost.startsWith(`${bucket}.`) ? `https://${baseHost}` : `https://${endpoint}`

  return {
    region,
    bucket,
    endpoint,
    accessKeyId,
    accessKeySecret,
    publicBaseUrl,
    uploadMaxBytes,
    host,
  }
}

/** 配置是否齐全；不抛异常，供接口层决定是否返回 503。 */
export function isOssConfigured(env: EnvLike = process.env): boolean {
  return REQUIRED_VARIABLES.every((name) => envValue(env, name) !== '')
}

/**
 * 拼接公网访问地址：base 与 key 之间恰好一个斜杠，key 的前导斜杠会被去掉。
 * 对外统一由 validation.ts 以 buildPublicUrl 名称导出，避免 Nuxt 自动导入出现同名冲突。
 */
export function joinPublicUrl(config: Pick<OssConfig, 'publicBaseUrl'>, objectKey: string): string {
  const base = normalizeHttpsUrl(config?.publicBaseUrl ?? '')
  const key = String(objectKey ?? '').trim().replace(/^\/+/, '')
  if (!base) return key
  return key ? `${base}/${key}` : base
}
