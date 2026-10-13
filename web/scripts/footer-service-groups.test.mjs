import test from 'node:test'
import assert from 'node:assert/strict'
import { groupFooterServices } from '../app/utils/footerServices.ts'

const groups = [
  {
    title: '知识产权服务',
    items: [
      { label: 'TRO 和解应诉', to: '/tro/cases' },
      { label: '亚马逊申诉/投诉' },
      { label: '不侵权报告' },
      { label: '加州 65 号法案' },
      { label: 'CPSC 召回' },
      { label: '商标/版权/专利申请' },
      { label: '亚马逊专利中立评估（APEX）' },
    ],
  },
  {
    title: '国内业务',
    items: [
      { label: '劳动人事管理' },
      { label: '跨境物流纠纷' },
      { label: '货代民商纠纷' },
      { label: '企业法律顾问' },
    ],
  },
]

test('页脚业务按需求文档的两组和顺序展示，后台链接沿用，额外旧项不展示', () => {
  const result = groupFooterServices([
    { itemKey: 'tro-settlement', title: 'TRO 和解应诉', linkPath: '/tro/cases' },
    { itemKey: 'labor-dispute', title: '劳动人事管理', linkPath: '/domestic/labor-disputes' },
    { itemKey: 'extra-cross-border', title: '跨境纠纷', linkPath: '/faq/cross-border' },
  ], groups)

  assert.deepEqual(result.map(group => group.title), ['知识产权服务', '国内业务'])
  assert.deepEqual(result.map(group => group.items.map(item => item.label)), groups.map(group => group.items.map(item => item.label)))
  assert.equal(result[0].items[0].to, '/tro/cases')
  assert.equal(result[1].items[0].to, '/domestic/labor-disputes')
  assert.equal(result.flatMap(group => group.items).some(item => item.label === '跨境纠纷'), false)
})

test('页脚后台未配置时，文档清单仍完整回退显示', () => {
  const result = groupFooterServices([], groups)
  assert.equal(result[0].items.length, 7)
  assert.equal(result[1].items.length, 4)
  assert.equal(result[0].items[6].label, '亚马逊专利中立评估（APEX）')
})
