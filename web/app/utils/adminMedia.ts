/**
 * 媒体库（/admin/media）的纯展示辅助。
 *
 * 本文件不依赖 Nuxt 运行时，也不 import `web/server/**`。
 * 用途选项与 `web/server/api/admin/upload-policy.post.ts` 的 UPLOAD_SCOPES 保持一致，
 * 上传表单与列表筛选用同一份列表，避免两处漂移。
 */

/** 媒体用途选项（上传表单与「用途」筛选共用） */
export const USAGE_SCOPE_OPTIONS: { value: string, label: string }[] = [
  { value: 'logo', label: '站点 Logo' },
  { value: 'background', label: '页面背景' },
  { value: 'banner', label: '横幅广告' },
  { value: 'article', label: '文章配图（允许 PDF）' },
  { value: 'about', label: '关于我们' },
  { value: 'qr', label: '二维码' },
  { value: 'general', label: '通用' }
]

const USAGE_SCOPE_LABELS: Record<string, string> = Object.fromEntries(
  USAGE_SCOPE_OPTIONS.map(option => [option.value, option.label])
)

/** 用途中文标签；未知取值原样展示，空值给出占位 */
export function usageScopeLabel(value: unknown): string {
  const text = String(value ?? '').trim()
  if (!text) return '未设置'
  return USAGE_SCOPE_LABELS[text] ?? text
}

/** 是否为可预览的图片（PDF 等非图片不渲染缩略图） */
export function isImageMimeType(value: unknown): boolean {
  return String(value ?? '').trim().toLowerCase().startsWith('image/')
}

/** 尺寸展示：`1920 × 1080`；宽高缺失时返回空串（由页面给出占位文案） */
export function formatDimensions(width: unknown, height: unknown): string {
  const w = Number(width)
  const h = Number(height)
  if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) return ''
  return `${w} × ${h}`
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** 时间展示：`YYYY-MM-DD HH:mm`（本地时区）；无法识别时原样返回 */
export function formatCreatedAt(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  const date = value instanceof Date ? value : new Date(String(value))
  if (Number.isNaN(date.getTime())) return String(value)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} `
    + `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

/** 软删除行的展示说明 */
export const SOFT_DELETE_NOTICE = '删除是软删除：只标记为已删除，不会从对象存储移除文件。'

/** 删除二次确认文案（明确「标记为已删除，不会从对象存储移除」） */
export const SOFT_DELETE_CONFIRM =
  '确认后该文件只会「标记为已删除，不会从对象存储移除」文件本身；默认列表将不再显示它。'
