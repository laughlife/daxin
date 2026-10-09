import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'

/**
 * 静态守卫：公开页面与组件必须通过仓储层取数，
 * 不得再 import `~/data/mock/*` 或 `~/data/legacy/*`。
 */
const root = resolve(import.meta.dirname, '..')
const targets = [join(root, 'app/pages'), join(root, 'app/components')]

/** 命中 import / import() / from 语句中的 mock 或 legacy 数据路径。 */
const FORBIDDEN = /(?:from|import)\s*\(?\s*['"]([^'"]*(?:data\/mock|data\/legacy)[^'"]*)['"]/g

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(entries.map(entry => entry.isDirectory()
    ? collectFiles(join(dir, entry.name))
    : [join(dir, entry.name)]))
  return nested.flat()
}

test('页面与组件不再引用 Mock / 旧站数据', async () => {
  const scanned = []
  const offenders = []

  for (const dir of targets) {
    for (const file of await collectFiles(dir)) {
      scanned.push(file)
      const source = await readFile(file, 'utf8')
      for (const match of source.matchAll(FORBIDDEN)) {
        offenders.push(`${relative(root, file)} → ${match[1]}`)
      }
    }
  }

  assert.ok(scanned.length > 0, '应至少扫描到一个页面或组件文件')
  assert.deepEqual(offenders, [], `以下文件仍在引用 Mock / 旧站数据：\n${offenders.join('\n')}`)
})
