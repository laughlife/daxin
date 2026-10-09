import type { CaseType } from '../types/content'

/**
 * 侵权类型中文标签。
 *
 * 逻辑与 `web/server/utils/public/case-mapper.ts` 的 caseTypeLabel 保持一致
 * （trademark→商标、patent→专利、copyright→版权，其余（含空串）一律“待确认类型”）。
 * 这里单独实现一份，是因为客户端不得 import `web/server/**`。
 */
export const CASE_TYPE_LABELS: Record<CaseType, string> = {
  trademark: '商标',
  patent: '专利',
  copyright: '版权'
}

/** 未标注侵权类型时的展示文案。 */
export const UNKNOWN_CASE_TYPE_LABEL = '待确认类型'

/**
 * 类型标签：已知类型返回中文标签，未标注（空串）/ 未知取值返回“待确认类型”。
 * 数据库未确认侵权类型时接口返回空串，绝不能显示成某个具体类型。
 */
export function caseTypeLabel(caseType: string | null | undefined): string {
  const key = typeof caseType === 'string' ? caseType.trim().toLowerCase() : ''
  return CASE_TYPE_LABELS[key as CaseType] ?? UNKNOWN_CASE_TYPE_LABEL
}
