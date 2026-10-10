/**
 * 核验队列（/admin/review）的纯展示辅助。
 *
 * 本文件不依赖 Nuxt 运行时，也不 import `web/server/**`；与之对应的服务端权威逻辑在
 * `web/server/utils/admin/review-queries.ts`（applyValue 白名单、置信度来源、状态取值）。
 */

/** 核验状态选项（默认 open，与服务端 `migration_review_items.status` 取值一致） */
export const REVIEW_STATUS_OPTIONS: { value: string, label: string }[] = [
  { value: 'open', label: '待处理（open）' },
  { value: 'confirmed', label: '已确认（confirmed）' },
  { value: 'rejected', label: '已驳回（rejected）' }
]

/** 实体类型选项；空值表示不筛选 */
export const REVIEW_ENTITY_TYPE_OPTIONS: { value: string, label: string }[] = [
  { value: '', label: '全部实体' },
  { value: 'case', label: '案件（case）' },
  { value: 'article', label: '文章（article）' },
  { value: 'brand', label: '品牌（brand）' },
  { value: 'law_firm', label: '律所（law_firm）' },
  { value: 'ip_type', label: '侵权类型（ip_type）' },
  { value: 'media', label: '媒体（media）' }
]

const ENTITY_TYPE_LABELS: Record<string, string> = {
  case: '案件',
  article: '文章',
  brand: '品牌',
  law_firm: '律所',
  ip_type: '侵权类型',
  media: '媒体'
}

/** 实体类型中文标签；未知取值原样展示 */
export function entityTypeLabel(value: unknown): string {
  const text = String(value ?? '').trim()
  if (!text) return '未知实体'
  return ENTITY_TYPE_LABELS[text] ?? text
}

const FIELD_LABELS: Record<string, string> = {
  plaintiff: '原告',
  filedAt: '立案日期',
  filed_at: '立案日期',
  caseNumber: '案件号',
  title: '标题',
  summary: '摘要',
  court: '法院',
  brand: '品牌',
  lawFirm: '律所',
  publishedAt: '发布日期'
}

/** 字段名展示：`plaintiff（原告）`；未知字段原样展示 */
export function fieldNameLabel(value: unknown): string {
  const text = String(value ?? '').trim()
  if (!text) return '未知字段'
  const label = FIELD_LABELS[text]
  return label ? `${text}（${label}）` : text
}

const STATUS_LABELS: Record<string, string> = {
  open: '待处理',
  confirmed: '已确认',
  rejected: '已驳回'
}

/** 核验状态中文标签；未知取值原样展示 */
export function reviewStatusLabel(value: unknown): string {
  const text = String(value ?? '').trim()
  if (!text) return '未知状态'
  return STATUS_LABELS[text] ?? text
}

/** 低置信度阈值：confidence < 0.5 视为需要人工重点核对 */
export const LOW_CONFIDENCE_THRESHOLD = 0.5

/**
 * 把接口返回的 confidence 归一成 0~100 的整数百分比。
 * 兼容两种口径：0~1 的小数（库内实际取值）与已经是百分数的 >1 数值；
 * 其余（负数、NaN、超范围）夹到 0~100。
 */
export function confidencePercent(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return 0
  const percent = parsed > 1 ? parsed : parsed * 100
  return Math.min(100, Math.max(0, Math.round(percent)))
}

/** 置信度展示文案，例如 `35%` */
export function confidenceText(value: unknown): string {
  return `${confidencePercent(value)}%`
}

/** 是否为低置信度（< 0.5），用于给出显式视觉提示 */
export function isLowConfidence(value: unknown): boolean {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return true
  const normalized = parsed > 1 ? parsed / 100 : parsed
  return normalized < LOW_CONFIDENCE_THRESHOLD
}

/**
 * applyValue 白名单（与服务端 `validateApplyValue` 完全一致）：
 * 只有 `case + plaintiff` → `cases.plaintiff`、`case + filedAt` → `cases.filed_at`
 * 两组组合允许回填，其余一律被服务端拒绝。前端只据此决定是否展示回填控件。
 */
export const APPLY_CASE_FIELD_LABELS: Record<string, string> = {
  plaintiff: '原告名称',
  filedAt: '立案日期'
}

/** 该核验项是否支持「同时回填到案件」 */
export function supportsCaseApply(entityType: unknown, fieldName: unknown): boolean {
  const entity = String(entityType ?? '').trim().toLowerCase()
  const field = String(fieldName ?? '').trim()
  return entity === 'case' && Object.hasOwn(APPLY_CASE_FIELD_LABELS, field)
}

/**
 * 回填输入框的默认值：用 candidateValue 预填。
 * `filedAt` 只保留 `YYYY-MM-DD`（服务端也只取前 10 位并做严格日期校验）。
 */
export function defaultApplyValue(fieldName: unknown, candidateValue: unknown): string {
  const text = String(candidateValue ?? '').trim()
  if (String(fieldName ?? '').trim() === 'filedAt') {
    const match = /^\d{4}-\d{2}-\d{2}/.exec(text)
    return match ? match[0] : text
  }
  return text
}

/** 来源展示：`旧库表名 #id` */
export function sourceLabel(legacySourceTable: unknown, legacySourceId: unknown): string {
  const table = String(legacySourceTable ?? '').trim()
  const id = String(legacySourceId ?? '').trim()
  if (!table && !id) return '未知来源'
  if (!table) return `来源 #${id}`
  return id && id !== '0' ? `${table} #${id}` : table
}

/**
 * 回填目标解析冲突：HTTP 409，或错误码 TARGET_NOT_FOUND / TARGET_AMBIGUOUS。
 * 含义是「旧库来源无法唯一对应到一条业务数据」，服务端会保留核验项状态不变。
 */
export function isTargetResolutionConflict(statusCode: number, code: string): boolean {
  if (statusCode === 409) return true
  return code === 'TARGET_NOT_FOUND' || code === 'TARGET_AMBIGUOUS'
}

/** 冲突面板标题：按错误码给出更具体的中文说明 */
export function conflictTitle(code: string): string {
  if (code === 'TARGET_AMBIGUOUS') return '该旧库来源对应多起案件，无法确定回填目标'
  if (code === 'TARGET_NOT_FOUND') return '未找到该旧库来源对应的案件'
  return '回填被服务端拒绝（HTTP 409）'
}

/** 冲突说明（非重试型）：解释 409 的成因与下一步人工处理路径 */
export const APPLY_CONFLICT_EXPLANATION =
  '系统只在核验项能唯一定位到 1 起案件时才允许回填：一条旧库文章可能对应多起案件，'
  + '为避免把值写到错误的案件上，服务端在命中 0 条或多条时一律拒绝回填，并且不会修改该核验项的状态。'
  + '请先到「案件管理」中手动修正对应案件，再回到本页处理；不要重复提交本次回填。'
