const SHANGHAI_TIME_ZONE = 'Asia/Shanghai'

/** 每日两班：凌晨 00:15 与中午 12:15（北京时间）。 */
const RUN_SLOTS = [
  { hour: 0, minute: 15 },
  { hour: 12, minute: 15 },
]

function shanghaiParts(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SHANGHAI_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]))
}

export function shanghaiDateKey(date = new Date()) {
  const { year, month, day } = shanghaiParts(date)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** 当前属于哪一班：'00'（凌晨班）或 '12'（中午班），用于运行台账区分两次执行。 */
export function shanghaiSlotKey(date = new Date()) {
  const { hour } = shanghaiParts(date)
  return hour < 12 ? '00' : '12'
}

/** 距离下一个班次的毫秒数；按北京时间 00:15 / 12:15 两班计算。 */
export function millisecondsUntilNextWorldTroRun(date = new Date()) {
  const parts = shanghaiParts(date)
  const nowMinutes = parts.hour * 60 + parts.minute
  const nextSlot = RUN_SLOTS.find((slot) => slot.hour * 60 + slot.minute > nowMinutes)
  const target = nextSlot
    ? new Date(Date.UTC(parts.year, parts.month - 1, parts.day, nextSlot.hour - 8, nextSlot.minute, 0))
    : new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1, RUN_SLOTS[0].hour - 8, RUN_SLOTS[0].minute, 0))
  return Math.max(0, target.getTime() - date.getTime())
}

/** 当天当前班次已过则立即补跑；同一班次的重复执行由运行台账拦掉。 */
export function millisecondsUntilFirstWorldTroRun(date = new Date()) {
  const parts = shanghaiParts(date)
  const nowMinutes = parts.hour * 60 + parts.minute
  const anyPassed = RUN_SLOTS.some((slot) => slot.hour * 60 + slot.minute <= nowMinutes)
  return anyPassed ? 0 : millisecondsUntilNextWorldTroRun(date)
}
