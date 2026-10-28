/** 按北京时间自然日处理；YYYY-MM-DD 字符串排序可直接用于筛选。 */
export function shanghaiDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function inDateRange(date: string, from = '', to = ''): boolean {
  return validDate(date) && (!from || (validDate(from) && date >= from)) && (!to || (validDate(to) && date <= to)) && !(from && to && from > to)
}

export function isWithinDays(date: string, days = 3, now: Date = new Date()): boolean {
  if (!validDate(date) || !Number.isInteger(days) || days < 1) return false
  const today = shanghaiDate(now)
  const start = new Date(`${today}T00:00:00Z`)
  start.setUTCDate(start.getUTCDate() - days + 1)
  return inDateRange(date, start.toISOString().slice(0, 10), today)
}

export function clampPage(value: unknown, totalPages: number): number {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, Math.max(1, totalPages)) : 1
}

export function entitySlug(name: string): string {
  return name.replace(/（演示）/g, '').replace(/^演示律所\s*/, '').trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')
}

/**
 * 品牌 / 律所目录页地址，可带关键词定位。
 *
 * 案件记录只带实体名称、不带实体 slug（slug 由公开接口的实体列表提供），
 * 因此案件列表里的品牌 / 律所入口统一跳到目录页并按名称筛选，避免拼出无效 slug。
 */
export function entityDirectoryHref(kind: 'brand' | 'firm', keyword: string): string {
  const base = kind === 'brand' ? '/brands' : '/faq/plaintiff-firms'
  const trimmed = keyword.trim()
  return trimmed ? `${base}?q=${encodeURIComponent(trimmed)}` : base
}

/**
 * 外链归一化：只把 http(s) 地址渲染成可点击链接。
 * 后台/采集数据可能带 `javascript:` 之类的伪协议，宁可当普通文字也不生成链接。
 */
export function safeExternalUrl(value?: string | null): string {
  const url = (value ?? '').trim()
  return /^https?:\/\//i.test(url) ? url : ''
}

/** 外链展示文案：省略协议头与结尾斜杠，避免卡片里出现又长又重复的 https://。 */
export function externalUrlLabel(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/\/$/, '')
}

/**
 * 品牌方与品牌原告是否同一主体。
 *
 * 库里 603 个可匹配品牌中有 288 个两者文本完全一致，还有不少是
 * 「Zhenbiao Zhang / Zhang」这种简写。比较时去掉标点空格、忽略大小写；
 * 短的一方（≥ 4 个字符）被长的一方包含也算同一主体。列表卡片与详情页共用。
 */
export function samePartyName(a?: string | null, b?: string | null): boolean {
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '')
  const left = normalize(a ?? '')
  const right = normalize(b ?? '')
  if (!left || !right) return false
  if (left === right) return true
  const [short, long] = left.length <= right.length ? [left, right] : [right, left]
  return short.length >= 4 && long.includes(short)
}
