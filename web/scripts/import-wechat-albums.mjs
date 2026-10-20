import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJiti } from 'jiti'

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

const jiti = createJiti(import.meta.url)
const { runWechatAlbumImport } = await jiti.import('../server/utils/wechat-album/importer.ts')
const result = await runWechatAlbumImport()
console.log(JSON.stringify(result, null, 2))
if (result.failedCount) process.exitCode = 1
