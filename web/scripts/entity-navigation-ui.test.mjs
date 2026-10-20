import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const read = path => readFile(new URL(path, import.meta.url), 'utf8')
const entityDetail = await read('../app/components/content/EntityDetail.vue')
const entityDirectory = await read('../app/components/content/EntityDirectory.vue')
const caseDetail = await read('../app/pages/tro/cases/[id].vue')
const caseSearch = await read('../app/components/cases/CaseSearchPanel.vue')
const articleSearch = await read('../app/components/content/ContentListing.vue')

test('品牌与律所页面删除重复详情入口和统计口径提示，保留标题跳转', () => {
  assert.doesNotMatch(entityDetail, /查看完整案件/)
  assert.doesNotMatch(entityDirectory, /统计来自公开案件资料|查看\{\{ kind === 'brand' \? '品牌历史发案'/)
  assert.match(entityDetail, /<NuxtLink :to="`\/tro\/cases\/\$\{record\.slug\}`">\{\{ record\.caseNumber \}\}/)
  assert.match(entityDirectory, /<NuxtLink :to="`\$\{kind === 'brand' \? '\/brands' : '\/law-firms'\}\/\$\{item\.slug\}`">\{\{ item\.name \}\}<\/NuxtLink>/)
})

test('案件详情返回上一级，且无站内上一页时有稳定的 TRO 查询回退', () => {
  assert.match(caseDetail, /返回上一级/)
  assert.match(caseDetail, /router\.back\(\)/)
  assert.match(caseDetail, /\/tro\/cases/)
  assert.doesNotMatch(caseDetail, /返回 TRO 案件查询|返回案件列表/)
})

test('TRO 案件检索与文章检索统一使用胶囊搜索框', () => {
  // 需求 2026-10-20：三处搜索框统一为「放大镜 + 输入 + 金色搜索按钮」的胶囊样式，
  // 旧的「标签 + 输入框」两列排布已废弃，改由公共组件 SearchPill 承担。
  assert.match(caseSearch, /<SearchPill[\s\S]*?v-model="filters\.keyword"/)
  assert.match(articleSearch, /<SearchPill[\s\S]*?v-model="keyword"/)
  assert.doesNotMatch(caseSearch, /case-search-panel__field--keyword[\s\S]*?grid-template-columns:\s*max-content/)
  assert.doesNotMatch(articleSearch, /\.listing-search__keyword\s*\{/)
  // 目录类页面（品牌/律所）本次不在范围内，保留原有标签横排
  assert.match(entityDirectory, /directory__search label[\s\S]*?grid-template-columns:\s*max-content\s+minmax\(0,\s*1fr\)/)
})
