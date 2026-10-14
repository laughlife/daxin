import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const source = await readFile(new URL('../app/pages/admin/services.vue', import.meta.url), 'utf8')
const template = source.split('<template>')[1]?.split('</template>')[0] ?? ''

test('业务范围页面只显示板块标题和子项标题', () => {
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

test('新增板块和子项仍可用，编辑页面不提供移除按钮', () => {
  assert.match(template, /@click="addSection"/)
  assert.match(template, /@click="addChild\(section\)"/)
  assert.doesNotMatch(template, /@click="removeChild/)
})
