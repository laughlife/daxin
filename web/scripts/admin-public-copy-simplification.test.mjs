import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

async function read(path) {
  return readFile(new URL(path, import.meta.url), 'utf8')
}

test('公开页面移除模板生成的眉题、副标题与配置使用说明', async () => {
  const about = await read('../app/pages/about.vue')
  const home = await read('../app/pages/index.vue')
  const cases = await read('../app/pages/tro/cases/index.vue')
  const check = await read('../app/pages/infringement-check.vue')
  const header = await read('../app/components/layout/SiteHeader.vue')

  assert.doesNotMatch(about, /eyebrow=|description="|可在「后台 → 站点设置/)
  assert.doesNotMatch(home, /eyebrow="About US"/)
  assert.doesNotMatch(cases, /description="检索 TRO 案件/)
  assert.doesNotMatch(check, /description="填写待检测的品牌/)
  assert.doesNotMatch(header, /class="site-header__subtitle"/)
  assert.match(header, /class="site-header__name"/)
})
