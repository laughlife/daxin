import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function parseEnvFile(contents) {
  const values = new Map()
  for (const line of contents.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line)
    if (!match) continue
    let value = match[2] ?? ''
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    } else {
      value = value.replace(/\s+#.*$/, '')
    }
    values.set(match[1], value)
  }
  return values
}

try {
  const contents = await readFile(resolve(WEB_ROOT, '.env'), 'utf8')
  for (const [key, value] of parseEnvFile(contents)) process.env[key] ??= value
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
}

// 公众号专辑采集入口。
//
// 用法：
//   node --experimental-strip-types scripts/import-wechat-albums.mjs          # 每日增量
//   node --experimental-strip-types scripts/import-wechat-albums.mjs --full   # 部署全量
//
// --full 对应部署时的全量同步（runWechatAlbumDeploymentFullImport），
// 会逐个来源从第 1 页抓到最后一页，用于首次填充文章。
const full = process.argv.includes('--full')

const { runWechatAlbumImport, runWechatAlbumDeploymentFullImport } = await import('../server/utils/wechat-album/importer.ts')
const { closeDbPools } = await import('../server/utils/db/pool.ts')
try {
  const result = full
    ? await runWechatAlbumDeploymentFullImport()
    : await runWechatAlbumImport()
  console.log(JSON.stringify(result, null, 2))
  if (result.failedCount) process.exitCode = 1
} finally {
  await closeDbPools()
}
