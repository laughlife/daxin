// 核对 site_settings 各字段是否真的被前端或服务端使用。
//
// 目的：需求要求「该模块调整一下字段，一些字段现在不用了」。
// 判断依据只能是代码里是否引用了该 key，不能凭印象删——误删会让页面丢内容。
//
// 用法：node tools/check-setting-usage.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'

import { queryRows, resolveTargetConnection } from './migrate-legacy/mysql-client.mjs'

const SEARCH_DIRS = ['web/app', 'web/server']
const EXT = new Set(['.vue', '.ts', '.mjs', '.js'])

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (EXT.has(extname(full))) out.push(full)
  }
  return out
}

const files = SEARCH_DIRS.flatMap((dir) => walk(dir))
const contents = files.map((file) => ({ file, text: readFileSync(file, 'utf8') }))

const target = resolveTargetConnection()
const rows = await queryRows(target, `
SELECT setting_group, setting_key, value_type
FROM site_settings WHERE is_current = 1
ORDER BY setting_group, setting_key`)

console.log(`共 ${rows.length} 个字段，扫描 ${files.length} 个源码文件。\n`)

const unused = []
for (const row of rows) {
  const group = String(row[0])
  const key = String(row[1])
  const hits = contents.filter((entry) => entry.text.includes(key))
  if (hits.length === 0) {
    unused.push({ group, key, type: String(row[2]) })
    console.log(`  ✖ ${group.padEnd(8)} ${key.padEnd(28)} ${row[2]}  —— 代码中无引用`)
  } else {
    const where = hits.slice(0, 3).map((entry) => entry.file.replace(/\\/g, '/').replace(/^.*?web\//, '')).join(', ')
    console.log(`  ✔ ${group.padEnd(8)} ${key.padEnd(28)} ${row[2]}  ${hits.length} 处：${where}`)
  }
}

console.log(`\n未被引用的字段：${unused.length} 个`)
for (const item of unused) console.log(`  - ${item.group}/${item.key} (${item.type})`)
