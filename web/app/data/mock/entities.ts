import { mockCases } from './cases'
import { entitySlug } from '../../utils/content'

/** 目录完全从演示案件派生，禁止虚构真实律所资质及真实品牌侵权结论。 */
export const mockBrands = Array.from(new Set(mockCases.map(item => item.plaintiffBrand))).map(name => {
  const cases = mockCases.filter(item => item.plaintiffBrand === name)
  return { name, slug: entitySlug(name), cases, types: Array.from(new Set(cases.map(item => item.caseType))), description: '此品牌为虚构演示名称，用于展示品牌历史发案与案件分类，不表示任何真实品牌侵权。' }
})
export const mockFirms = Array.from(new Set(mockCases.map(item => item.lawFirm))).map(name => {
  const cases = mockCases.filter(item => item.lawFirm === name)
  return { name, slug: entitySlug(name), cases, states: Array.from(new Set(cases.map(item => item.state))), description: '此律所为虚构演示名称，仅展示关联案件、案件类型及涉及州。正式介绍和资质信息待确认后录入。' }
})
export const entityRoutes = ['/brands', '/faq/plaintiff-firms', ...mockBrands.map(item => `/brands/${item.slug}`), ...mockFirms.map(item => `/law-firms/${item.slug}`)]
