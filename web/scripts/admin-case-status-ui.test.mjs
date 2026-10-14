import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const source = await readFile(new URL('../app/pages/admin/cases.vue', import.meta.url), 'utf8')
const template = source.slice(source.indexOf('<template>'))

test('案件列表和编辑表单不展示发布或内部状态字段', () => {
  assert.doesNotMatch(template, /case-publish-filter|<th[^>]*>发布状态<|case-internal-status|case-publish-status|v-model="publishStatus"/)
  assert.doesNotMatch(template, /PUBLISH_STATUS_LABELS\[item\.publishStatus\]/)
})

test('案件普通保存保留原状态，新建默认草稿，发布按钮显式改为已发布', () => {
  assert.match(source, /form\.publishStatus = item\.publishStatus \|\| 'draft'/)
  assert.match(source, /form\.status = record\.status \|\| 'open'/)
  assert.match(source, /publishStatus: publish \? 'published' : form\.publishStatus/)
  assert.match(source, /status: form\.status/)
  assert.match(template, /发布案例/)
})

test('案件其他业务字段和关联编辑仍存在', () => {
  assert.match(template, /case-brand/)
  assert.match(template, /case-law-firm/)
  assert.match(template, /case-ip-type/)
  assert.match(template, /case-filed-at/)
})
