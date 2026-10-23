import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

/**
 * 浏览器标签页图标（2026-10-21 改为后台可配置）：
 * - 布局层在配置了 site_favicon 时输出 icon / shortcut icon / apple-touch-icon
 * - 未配置时不输出，回退到 public 下的静态兜底文件
 * - 静态兜底必须是 512x512 PNG 与多尺寸 ICO，避免某些浏览器仍读兜底时变成空白
 */
test('浏览器标签页图标由后台配置驱动，并保留静态兜底', async () => {
  const layout = await readFile(new URL('../app/layouts/default.vue', import.meta.url), 'utf8')

  assert.match(layout, /site_favicon/)
  assert.match(layout, /rel:\s*'icon'/)
  assert.match(layout, /rel:\s*'shortcut icon'/)
  assert.match(layout, /rel:\s*'apple-touch-icon'/)
  // 未配置时不输出 link，避免把 favicon 覆盖成空
  assert.match(layout, /:\s*\{\s*\}|:\s*\{\s*\r?\n/)

  const png = await readFile(new URL('../public/favicon.png', import.meta.url))
  assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a')
  assert.equal(png.readUInt32BE(16), 512)
  assert.equal(png.readUInt32BE(20), 512)

  const ico = await readFile(new URL('../public/favicon.ico', import.meta.url))
  assert.equal(ico.readUInt16LE(0), 0)
  assert.equal(ico.readUInt16LE(2), 1)
  const iconCount = ico.readUInt16LE(4)
  assert.ok(iconCount >= 3, `ICO 应包含多个尺寸，实际 ${iconCount}`)
  for (let index = 0; index < iconCount; index++) {
    const entryOffset = 6 + index * 16
    const imageOffset = ico.readUInt32LE(entryOffset + 12)
    assert.equal(ico.toString('hex', imageOffset, imageOffset + 8), '89504e470d0a1a0a')
  }
})
