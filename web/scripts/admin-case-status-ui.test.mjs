import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const source = await readFile(new URL('../app/pages/admin/cases.vue', import.meta.url), 'utf8')
const createApi = await readFile(new URL('../server/api/admin/cases.post.ts', import.meta.url), 'utf8')
const bulkPublishApi = await readFile(new URL('../server/api/admin/cases/bulk-publish.post.ts', import.meta.url), 'utf8')
const template = source.slice(source.indexOf('<template>'))

test('案件管理显示发布状态，不显示内部状态和内部标题', () => {
  assert.match(template, /<th scope="col">状态<\/th>/)
  assert.match(template, /item\.publishStatus === 'published' \? '已发布'/)
  assert.doesNotMatch(template, /内部标题|case-title|case-internal-status|v-model="publishStatus"/)
})

test('案件可逐条发布，也可全选本页并批量发布草稿', () => {
  assert.match(template, /全选本页/)
  assert.match(template, /发布已选草稿/)
  assert.match(template, /@click="onPublishOne\(item\)"/)
  assert.match(source, /\/api\/admin\/cases\/bulk-publish/)
  assert.match(bulkPublishApi, /body\.ids\.length > 50/)
  assert.match(bulkPublishApi, /row\.publish_status === 'draft'/)
  assert.match(bulkPublishApi, /action: 'case_publish'/)
})

test('案件普通保存保留原状态，新建默认草稿，编辑不再校验案件号格式', () => {
  assert.match(source, /form\.publishStatus = item\.publishStatus \|\| 'draft'/)
  assert.match(source, /form\.status = record\.status \|\| 'open'/)
  assert.match(source, /publishStatus: publish \? 'published' : form\.publishStatus/)
  assert.match(source, /status: form\.status/)
  assert.match(template, /发布案例/)
  assert.doesNotMatch(source, /isValidCaseNumber|CASE_NUMBER_HINT|caseNumberError/)
  assert.match(createApi, /normalizeCaseNumberText/)
  assert.doesNotMatch(createApi, /案件号格式不正确/)
})

test('案件其他业务字段和关联编辑仍存在', () => {
  assert.match(template, /case-brand/)
  assert.match(template, /case-law-firm/)
  assert.match(template, /case-ip-type/)
  assert.match(template, /case-filed-at/)
  assert.match(template, /:model-label="form\.brandName"/)
  assert.match(template, /:model-label="form\.lawFirmName"/)
})
