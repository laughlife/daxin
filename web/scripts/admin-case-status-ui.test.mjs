import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const source = await readFile(new URL('../app/pages/admin/cases.vue', import.meta.url), 'utf8')
const createApi = await readFile(new URL('../server/api/admin/cases.post.ts', import.meta.url), 'utf8')
const template = source.slice(source.indexOf('<template>'))

test('案件列表不再展示发布状态，也不显示内部状态和内部标题', () => {
  assert.doesNotMatch(template, /<th scope="col">状态<\/th>/)
  assert.doesNotMatch(template, /item\.publishStatus === 'published' \? '已发布'/)
  assert.doesNotMatch(template, /内部标题|case-title|case-internal-status|v-model="publishStatus"/)
})

test('案件页移除逐条发布、全选与批量发布', () => {
  // 采集已直接发布，后台不再提供任何发布入口
  assert.doesNotMatch(template, /全选本页/)
  assert.doesNotMatch(template, /发布已选草稿/)
  assert.doesNotMatch(template, /发布案例/)
  assert.doesNotMatch(template, /onPublishOne|onPublishSelected/)
  assert.doesNotMatch(template, /type="checkbox"/)
  assert.doesNotMatch(source, /selectedCaseIds|selectedDraftCount|allVisibleSelected/)
  assert.doesNotMatch(source, /\/api\/admin\/cases\/bulk-publish/)
})

test('新建案件直接发布，编辑不覆盖发布状态', () => {
  // 后台没有发布入口了，草稿会让案例永远不公开，因此新建时显式写 published
  assert.match(source, /if \(!isEdit\) body\.publishStatus = 'published'/)
  // 编辑请求体不带 publishStatus（字段缺省 = 服务端保留原状态）
  const bodyBlock = source.slice(source.indexOf('const body: Record<string, unknown> = {'), source.indexOf('try {'))
  assert.doesNotMatch(bodyBlock, /publishStatus: (form|publish)/)
  assert.match(source, /status: form\.status/)
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
  // 归档仍保留（软删除）
  assert.match(template, /@click="onArchive\(item\)"/)
})
