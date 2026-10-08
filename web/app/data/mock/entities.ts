import { mockCases } from './cases'
import { entitySlug } from '../../utils/content'

/** 品牌/权利主体与律所目录由精选旧库案件派生，保留原文名称。 */
export const mockBrands = Array.from(new Set(mockCases.map(item => item.plaintiffBrand))).map(name => {
  const cases = mockCases.filter(item => item.plaintiffBrand === name)
  return { name, slug: entitySlug(name), cases, types: Array.from(new Set(cases.flatMap(item => item.caseTypes ?? [item.caseType]))), description: '名称及关联案件整理自大信旧站资料，包含品牌、版权权利人及产品名称。下方记录为历史报道，不代表目前案件进展。' }
})
export const mockFirms = Array.from(new Set(mockCases.map(item => item.lawFirm))).map(name => {
  const cases = mockCases.filter(item => item.lawFirm === name)
  return { name, slug: entitySlug(name), cases, states: Array.from(new Set(cases.map(item => item.state))), description: '代理律所名称沿用旧站原文，部分为简称。下方列出本次收录的关联历史案件；未补写原文未提供的资质或机构介绍。' }
})
export const entityRoutes = ['/brands', '/faq/plaintiff-firms', ...mockBrands.map(item => `/brands/${item.slug}`), ...mockFirms.map(item => `/law-firms/${item.slug}`)]
