import assert from 'node:assert/strict'
import { readdir, readFile, stat } from 'node:fs/promises'
import { resolve, join } from 'node:path'
const root = resolve('.output/public')
async function files(dir) { const entries = await readdir(dir, { withFileTypes:true }); return (await Promise.all(entries.map(item => item.isDirectory() ? files(join(dir,item.name)) : [join(dir,item.name)]))).flat() }
const pages = (await files(root)).filter(path => path.endsWith('index.html'))
const missing = []
let links = 0
let images = 0
async function exists(path) { try { return await stat(path) } catch { return null } }
for (const page of pages) {
  const html = await readFile(page,'utf8')
  assert.equal((html.match(/<main[\s>]/g) || []).length, 1, `单一主内容 landmark：${page}`)
  for (const [,attribute,value] of html.matchAll(/\b(href|src)="([^"#]+)"/g)) {
    if (!value.startsWith('/') || value.startsWith('//')) continue
    const pathname = decodeURIComponent(value.split(/[?#]/)[0])
    const target = resolve(root, `.${pathname}`)
    assert.ok(target.startsWith(root), '资源必须位于静态站点目录')
    const info = await exists(target)
    const ok = info?.isFile() || (info?.isDirectory() && await exists(join(target,'index.html')))
    if (!ok) missing.push({ page:page.slice(root.length), attribute, value })
    if (attribute === 'href') links++; else images++
  }
}
assert.equal(missing.length, 0, JSON.stringify(missing,null,2))
console.log(`静态验收通过：${pages.length} 个页面、${links} 处内部链接、${images} 处资源引用，无缺失。`)
