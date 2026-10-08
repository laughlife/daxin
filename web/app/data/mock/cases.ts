import type { CaseRecord, CaseType } from '../../types/content'
import legacyCases from '../legacy/cases.json'

export const CASE_TYPE_LABELS: Record<CaseType, string> = {
  trademark: '商标', patent: '专利', copyright: '版权'
}
export const MOCK_DATA_NOTICE = '资料摘自大信旧站数据库，保留原始立案日期；当前为本地静态资料，未实时同步法院进展。'
/** 保留既有导出名称，数据已替换为旧库人工整理记录。 */
export const mockCases: CaseRecord[] = legacyCases.map(seed => ({
  ...seed,
  caseType: seed.caseType as CaseType,
  caseTypes: (seed.caseTypes ?? [seed.caseType]) as CaseType[],
  category: (seed.caseTypes ?? [seed.caseType]).map(type => CASE_TYPE_LABELS[type as CaseType]).join(' / ') + '侵权',
  slug: seed.caseNumber.toLowerCase()
}))
export function findMockCaseById(id: string): CaseRecord | undefined {
  return mockCases.find(item => item.id === id || item.slug === id)
}
export const mockCaseStates = Array.from(new Set(mockCases.map(item => item.state))).sort((a,b) => a.localeCompare(b, 'zh-CN'))
export const mockCaseLawFirms = Array.from(new Set(mockCases.map(item => item.lawFirm))).sort((a,b) => a.localeCompare(b, 'zh-CN'))
