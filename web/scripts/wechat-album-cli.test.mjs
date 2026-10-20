import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const cli = await readFile(new URL('./import-wechat-albums.mjs', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const readme = await readFile(new URL('../../README.md', import.meta.url), 'utf8')

test('manual first import loads the existing web environment and runs the shared idempotent importer', () => {
  assert.match(cli, /resolve\(WEB_ROOT, '\.env'\)/)
  assert.match(cli, /process\.env\[key\] \?\?= value/)
  assert.match(cli, /await import\('\.\.\/server\/utils\/wechat-album\/importer\.ts'\)/)
  assert.match(cli, /runWechatAlbumImport\(\)/)
  assert.equal(packageJson.scripts['import:wechat-albums'], 'node --experimental-strip-types scripts/import-wechat-albums.mjs')
  assert.match(readme, /npm run import:wechat-albums/)
})
