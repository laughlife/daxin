import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'

/**
 * 静态守卫：前台与仓储层必须通过公开 API 取数。
 *
 * 1. 页面与组件不得 import `~/data/mock/*` 或 `~/data/legacy/*`；
 * 2. 整个 web/app 也不得引用它们——mock 数据层已随页面切换而删除，
 *    任何残留引用都会在构建期直接失败，这里提前用测试拦住。
 */
const root = resolve(import.meta.dirname, '..')
const targets = [join(root, 'app/pages'), join(root, 'app/components')]
const wholeApp = [join(root, 'app')]

/** 命中 import / import() / from 语句中的 mock 或 legacy 数据路径。 */
const FORBIDDEN = /(?:from|import)\s*\(?\s*['"]([^'"]*(?:data\/mock|data\/legacy)[^'"]*)['"]/g

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(entries.map(entry => entry.isDirectory()
    ? collectFiles(join(dir, entry.name))
    : [join(dir, entry.name)]))
  return nested.flat()
}

async function findOffenders(dirs) {
  const scanned = []
  const offenders = []
  for (const dir of dirs) {
    for (const file of await collectFiles(dir)) {
      scanned.push(file)
      const source = await readFile(file, 'utf8')
      for (const match of source.matchAll(FORBIDDEN)) {
        offenders.push(`${relative(root, file)} → ${match[1]}`)
      }
    }
  }
  return { scanned, offenders }
}

test('页面与组件不再引用 Mock / 旧站数据', async () => {
  const { scanned, offenders } = await findOffenders(targets)
  assert.ok(scanned.length > 0, '应至少扫描到一个页面或组件文件')
  assert.deepEqual(offenders, [], `以下文件仍在引用 Mock / 旧站数据：\n${offenders.join('\n')}`)
})

test('整个 app 目录不再引用 Mock / 旧站数据层', async () => {
  const { scanned, offenders } = await findOffenders(wholeApp)
  assert.ok(scanned.length > 0, '应至少扫描到一个 app 文件')
  assert.deepEqual(offenders, [], `以下文件仍在引用已删除的数据层：\n${offenders.join('\n')}`)
})
