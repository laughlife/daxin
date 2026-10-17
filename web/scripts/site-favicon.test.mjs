import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const appSource = await readFile(new URL('../app/app.vue', import.meta.url), 'utf8')

test('全站网页图标使用独立提取的书剑 PNG 与 ICO 图标', async () => {
  assert.match(appSource, /href:\s*['"]\/favicon\.png['"]/)
  assert.match(appSource, /rel:\s*['"]shortcut icon['"]/)
  assert.match(appSource, /href:\s*['"]\/favicon\.ico['"]/)
  assert.doesNotMatch(appSource, /logoFavicon|site_logo/)

  const png = await readFile(new URL('../public/favicon.png', import.meta.url))
  assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a')
  assert.equal(png.readUInt32BE(16), 512)
  assert.equal(png.readUInt32BE(20), 512)

  const ico = await readFile(new URL('../public/favicon.ico', import.meta.url))
  assert.equal(ico.readUInt16LE(0), 0)
  assert.equal(ico.readUInt16LE(2), 1)
  const iconCount = ico.readUInt16LE(4)
  assert.equal(iconCount, 7)
  for (let index = 0; index < iconCount; index++) {
    const entryOffset = 6 + index * 16
    const imageOffset = ico.readUInt32LE(entryOffset + 12)
    assert.equal(ico.toString('hex', imageOffset, imageOffset + 8), '89504e470d0a1a0a')
  }
})
