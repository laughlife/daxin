import type { CaseRecord, CaseType } from '../../types/content'
import legacyCases from '../legacy/cases.json'
import recentCases from './recent-cases.json'

export const CASE_TYPE_LABELS: Record<CaseType, string> = {
  trademark: '商标', patent: '专利', copyright: '版权'
}
export const MOCK_DATA_NOTICE = '历史资料摘自大信旧站数据库，保留原始立案日期；另含明确标注的近三天演示数据，不代表真实发案。当前未实时同步法院进展。'
/** 保留既有导出名称，数据已替换为旧库人工整理记录。 */
export const mockCases: CaseRecord[] = [...legacyCases, ...recentCases].map(seed => ({
  ...seed,
  caseType: seed.caseType as CaseType,
  caseTypes: ('caseTypes' in seed ? seed.caseTypes : [seed.caseType]) as CaseType[],
  category: (('caseTypes' in seed ? seed.caseTypes : [seed.caseType]) as CaseType[]).map(type => CASE_TYPE_LABELS[type]).join(' / ') + '侵权',
  slug: seed.caseNumber.toLowerCase()
}))
export function findMockCaseById(id: string): CaseRecord | undefined {
  return mockCases.find(item => item.id === id || item.slug === id)
}
export const mockCaseStates = Array.from(new Set(mockCases.map(item => item.state))).sort((a,b) => a.localeCompare(b, 'zh-CN'))
export const mockCaseLawFirms = Array.from(new Set(mockCases.map(item => item.lawFirm))).sort((a,b) => a.localeCompare(b, 'zh-CN'))
