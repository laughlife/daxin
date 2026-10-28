import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 小程序后台的品牌/律所同步。
 *
 * 复用命令行工具 tools/import-mini-program.mjs（登录、解析、入库都在里面），
 * 这里只负责找到脚本并以子进程方式执行，避免把逻辑复制到服务端。
 *
 * 开关：MINIPROGRAM_IMPORT_ENABLED=false 可关闭；缺少账号密码时直接跳过。
 */
export interface MiniProgramImportResult {
  ok: boolean
  skipped?: boolean
  reason?: string
  code?: number | null
  tail?: string
}

function locateScript(): string | null {
  const candidates = [
    process.env.WX_IMPORT_SCRIPT,
    resolve(process.cwd(), '../tools/import-mini-program.mjs'),
    resolve(process.cwd(), 'tools/import-mini-program.mjs'),
    resolve(process.cwd(), '../../tools/import-mini-program.mjs'),
  ].filter((value): value is string => Boolean(value))
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

export async function runMiniProgramImport(): Promise<MiniProgramImportResult> {
  if (process.env.MINIPROGRAM_IMPORT_ENABLED === 'false') {
    return { ok: true, skipped: true, reason: 'disabled' }
  }
  if (!process.env.WX_ADMIN_USER && !process.env.WX_ADMIN_COOKIE) {
    // 凭据在 web/.env.local，由脚本自己读取；这里只做粗判
    const hasLocalFile = existsSync(resolve(process.cwd(), '.env.local'))
    if (!hasLocalFile && !process.env.WX_ADMIN_USER) {
      return { ok: true, skipped: true, reason: 'no-credentials' }
    }
  }

  const script = locateScript()
  if (!script) return { ok: false, reason: 'script-not-found' }

  return await new Promise<MiniProgramImportResult>((resolvePromise) => {
    const child = spawn(process.execPath, [script], {
      cwd: resolve(script, '../..'),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString()
      if (output.length > 8000) output = output.slice(-8000)
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      output += chunk.toString()
      if (output.length > 8000) output = output.slice(-8000)
    })
    child.on('error', (error) => resolvePromise({ ok: false, reason: String(error), tail: output.slice(-500) }))
    child.on('close', (code) => {
      resolvePromise({ ok: code === 0, code, tail: output.split('\n').slice(-3).join(' | ') })
    })
  })
}
