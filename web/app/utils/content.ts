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
  return name.replace(/（演示）/g, '').replace(/^演示律所\s*/, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
}
