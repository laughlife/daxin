import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const sectionTabsSource = await readFile(new URL('../app/components/content/ContentSectionTabs.vue', import.meta.url), 'utf8')
const siteConfigSource = await readFile(new URL('../app/config/site.ts', import.meta.url), 'utf8')

test('FAQ 页面标签顺序与常见问题菜单项顺序一致', () => {
  const faqNavigation = siteConfigSource.match(/label:\s*'常见问题',\s*children:\s*\[([\s\S]*?)\]\s*\n\s*\}/)?.[1] ?? ''
  const menuItems = [...faqNavigation.matchAll(/label:\s*'([^']+)'/g)].map(match => match[1])

  assert.deepEqual(menuItems, ['TRO 常见问题', 'TRO 原告律所', '劳动争议', '跨境干货'])
  assert.match(sectionTabsSource, /siteConfig\.mainNav/)
  assert.match(sectionTabsSource, /group\s*===\s*'faq'/)
  assert.match(sectionTabsSource, /label\s*===\s*'常见问题'/)
  assert.doesNotMatch(sectionTabsSource, /sections\.push\(\{\s*path:\s*'\/faq\/plaintiff-firms'/)
})
