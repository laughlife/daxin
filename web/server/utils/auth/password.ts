// 管理员密码哈希与校验。
//
// 算法选择说明：
//   design 文档要求 Argon2id 或 bcrypt。两者都需要原生扩展依赖，当前部署环境尚未安装，
//   而 Node 内置的 scrypt 同为内存硬（memory-hard）口令派生函数，因此这里先用 scrypt，
//   并把算法前缀写进哈希串。将来引入 argon2id 时，verifyPassword 会优先识别 argon2id 前缀，
//   旧哈希仍可校验，并通过 needsRehash 触发平滑升级，不需要强制全员重置密码。
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)

/** 当前使用的算法标识；写入 admin_users.password_algo。 */
export const PASSWORD_ALGORITHM = 'scrypt'

/** scrypt 参数：N=16384（2^14）、r=8、p=1，默认 32 字节派生密钥。 */
export const SCRYPT_PARAMS = Object.freeze({
  cost: 16384,
  blockSize: 8,
  parallelization: 1,
  keyLength: 32,
  saltBytes: 16,
})

export const MIN_PASSWORD_LENGTH = 8
export const MAX_PASSWORD_LENGTH = 200

const SUPPORTED_PREFIXES = ['scrypt$']

/** 存储格式：scrypt$N$r$p$saltBase64$hashBase64。 */
function encodeHash({ cost, blockSize, parallelization, salt, hash }) {
  return [
    'scrypt',
    cost,
    blockSize,
    parallelization,
    salt.toString('base64'),
    hash.toString('base64'),
  ].join('$')
}

/** 解析哈希串；格式不合法返回 null，绝不抛异常，便于安全地判为校验失败。 */
export function parseHash(encoded) {
  const parts = String(encoded ?? '').split('$')
  if (parts.length !== 6) return null
  const [prefix, rawCost, rawBlockSize, rawParallelization, rawSalt, rawHash] = parts
  if (prefix !== 'scrypt') return null
  const cost = Number.parseInt(rawCost, 10)
  const blockSize = Number.parseInt(rawBlockSize, 10)
  const parallelization = Number.parseInt(rawParallelization, 10)
  if (!Number.isFinite(cost) || !Number.isFinite(blockSize) || !Number.isFinite(parallelization)) return null
  if (cost < 2 || blockSize < 1 || parallelization < 1) return null
  let salt
  let hash
  try {
    salt = Buffer.from(rawSalt, 'base64')
    hash = Buffer.from(rawHash, 'base64')
  } catch {
    return null
  }
  if (salt.length === 0 || hash.length === 0) return null
  return { cost, blockSize, parallelization, salt, hash }
}

/** 是否为当前实现支持的哈希格式。 */
export function isSupportedHash(encoded) {
  const value = String(encoded ?? '')
  if (!SUPPORTED_PREFIXES.some((prefix) => value.startsWith(prefix))) return false
  return parseHash(value) !== null
}

function assertPasswordUsable(password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('密码不能为空')
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`密码长度至少 ${MIN_PASSWORD_LENGTH} 位`)
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new Error(`密码长度不能超过 ${MAX_PASSWORD_LENGTH} 位`)
  }
}

/**
 * 生成密码哈希。
 * 可用 options 指定较低参数，仅用于测试 needsRehash 行为。
 */
export async function hashPassword(password, options = {}) {
  assertPasswordUsable(password)
  const cost = options.cost ?? SCRYPT_PARAMS.cost
  const blockSize = options.blockSize ?? SCRYPT_PARAMS.blockSize
  const parallelization = options.parallelization ?? SCRYPT_PARAMS.parallelization
  const keyLength = options.keyLength ?? SCRYPT_PARAMS.keyLength
  const salt = options.salt ?? randomBytes(SCRYPT_PARAMS.saltBytes)
  const hash = await scrypt(password, salt, keyLength, { N: cost, r: blockSize, p: parallelization, maxmem: 256 * 1024 * 1024 })
  return encodeHash({ cost, blockSize, parallelization, salt, hash })
}

/**
 * 校验密码。
 * 任何格式问题都返回 false，不区分“哈希损坏”和“密码错误”，避免泄漏账号状态。
 */
export async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || password.length === 0) return false
  const parsed = parseHash(encoded)
  if (!parsed) return false
  const derived = await scrypt(password, parsed.salt, parsed.hash.length, {
    N: parsed.cost,
    r: parsed.blockSize,
    p: parsed.parallelization,
    maxmem: 256 * 1024 * 1024,
  })
  if (derived.length !== parsed.hash.length) return false
  return timingSafeEqual(derived, parsed.hash)
}

/** 参数低于当前标准或格式不受支持时，需要重新哈希。 */
export function needsRehash(encoded) {
  const parsed = parseHash(encoded)
  if (!parsed) return true
  return parsed.cost < SCRYPT_PARAMS.cost
    || parsed.blockSize < SCRYPT_PARAMS.blockSize
    || parsed.parallelization < SCRYPT_PARAMS.parallelization
    || parsed.hash.length < SCRYPT_PARAMS.keyLength
}
