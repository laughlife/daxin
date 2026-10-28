import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const source = await readFile(new URL('../app/components/admin/AdminServicesSettings.vue', import.meta.url), 'utf8')
const template = source.split('<template>')[1]?.split('</template>')[0] ?? ''

test('核心业务配置只显示板块标题、图片和子项标题', () => {
  assert.match(template, />板块标题<\/label>/)
  assert.match(template, />\s*子项标题\s*<\/label>/)
  for (const field of ['副标题', '板块说明', '业务块图标', '子项说明', '排序值', '状态', '详情链接', '显示「了解详情」链接', '标识 slug', '移除本次提交', '移出本次提交']) {
    assert.ok(!template.includes(field), `业务人员不应看到 ${field}`)
  }
})

test('板块和子项上移下移操作紧跟标题输入项', () => {
  const sectionTitle = template.indexOf('v-model="section.title"')
  const sectionMoveUp = template.indexOf('moveSection(sectionIndex, -1)')
  const childTitle = template.indexOf('v-model="child.title"')
  const childMoveUp = template.indexOf('moveChild(section, childIndex, -1)')

  assert.ok(sectionTitle >= 0 && sectionMoveUp > sectionTitle)
  assert.ok(childTitle >= 0 && childMoveUp > childTitle)
  assert.ok(sectionMoveUp - sectionTitle < 400, '板块排序按钮应紧跟标题输入')
  assert.ok(childMoveUp - childTitle < 400, '子项排序按钮应紧跟标题输入')
  assert.match(template, /@click="moveSection\(sectionIndex, -1\)"/)
  assert.match(template, /@click="moveChild\(section, childIndex, -1\)"/)
})

test('保存继续携带隐藏的标识、显示属性与原状态', () => {
  assert.match(source, /sections\.value\.map\(\(section, sectionIndex\) => \(\{\s*\.\.\.section,\s*title: section\.title,/)
  assert.match(source, /section\.items\.map\(\(child, childIndex\) => \(\{\s*\.\.\.child,\s*title: child\.title,/)
  assert.match(source, /sortOrder: \(sectionIndex \+ 1\) \* 10/)
  assert.match(source, /sortOrder: \(childIndex \+ 1\) \* 10/)
  assert.match(source, /status: toFlag\(section\.status\)/)
  assert.match(source, /status: toFlag\(child\.status\)/)
  assert.match(source, /showDetailLink: toFlag\(section\.showDetailLink\)/)
})

test('板块和子项均可删除，删除 ID 随保存提交', () => {
  assert.match(template, /@click="addSection"/)
  assert.match(template, /@click="addChild\(section\)"/)
  assert.match(template, /@click="removeSection\(sectionIndex\)"/)
  assert.match(template, /@click="removeChild\(section, childIndex\)"/)
  assert.match(template, /删除板块：\$\{section\.title/)
  assert.match(template, /删除子项：\$\{child\.title/)
  assert.match(source, /deleteSectionIds: deleteSectionIds\.value/)
  assert.match(source, /deleteItemIds: deleteItemIds\.value/)
  assert.match(source, /deleteSectionIds\.value\.push\(section\.id\)/)
  assert.match(source, /deleteItemIds\.value\.push\(child\.id\)/)
})

test('首次加载业务配置时显示加载状态，避免空列表误报未保存或覆盖数据', () => {
  assert.match(source, /pending/)
  assert.match(template, /role="status"[^>]*>正在加载配置/)
  assert.match(source, /canSave\(\): boolean \{[^}]*!pending\.value/)
  assert.match(template, /:disabled="!writable \|\| saving \|\| pending"/)
  assert.match(source, /const baseline = ref\(JSON\.stringify\(sections\.value\)\)/)
})

test('核心业务通过站点设置标签维护，旧直达地址会转到对应标签', async () => {
  const settings = await readFile(new URL('../app/pages/admin/settings.vue', import.meta.url), 'utf8')
  const route = await readFile(new URL('../app/pages/admin/services.vue', import.meta.url), 'utf8')
  assert.match(settings, /kind: 'services', label: '核心业务'/)
  assert.match(settings, /<AdminServicesSettings[\s\S]*?\/>/)
  assert.match(route, /tab=services/)
  assert.doesNotMatch(source, /<h1[^>]*>团队业务配置/)
})
