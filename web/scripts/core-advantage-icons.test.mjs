import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'

const advantages = await readFile(new URL('../app/components/home/HomeCoreAdvantages.vue', import.meta.url), 'utf8')

test('core advantage icon assets exist for every category', async () => {
  for (const key of ['team', 'experience', 'efficiency', 'protection']) {
    await Promise.all([
      stat(new URL(`../public/images/icons/core-${key}-black.png`, import.meta.url)),
      stat(new URL(`../public/images/icons/core-${key}-red.png`, import.meta.url))
    ])
  }
  assert.match(advantages, /core-\$\{iconKey\(item\.title\)\}-black\.png/)
})

/*
 * 需求 2026-10-20「整体配色统一为金色系」后，展开态不再切换到红色素材
 * （金色主题下突然冒红会串色），改为隐藏红色素材、把黑色素材用滤镜染成金色。
 * 这条断言守住新决策，防止红色素材被重新启用。
 */
test('expanded advantage icon is tinted gold instead of switching to the red asset', () => {
  assert.match(advantages, /home-core-advantages__icon--red/)
  assert.match(advantages, /home-core-advantages__card--expanded/)
  // 红色素材必须保持隐藏
  assert.match(advantages, /\.home-core-advantages__icon--red img:last-child\s*\{\s*opacity:\s*0/s)
  // 黑色素材在展开态显示并被染色
  assert.match(advantages, /\.home-core-advantages__icon--red img:first-child\s*\{[^}]*opacity:\s*1/s)
  assert.match(advantages, /\.home-core-advantages__icon--red img:first-child\s*\{[^}]*filter:\s*sepia/s)
})
