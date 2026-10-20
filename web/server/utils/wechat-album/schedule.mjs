const TIME_ZONE = 'Asia/Shanghai'
const RUN_HOUR = 12
const RUN_MINUTE = 15

function shanghaiParts(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]))
}

export function wechatShanghaiDateKey(date = new Date()) {
  const { year, month, day } = shanghaiParts(date)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** 返回距离下一个每日 12:15（北京时间）的毫秒数；已过今日时间则安排到明日。 */
export function millisecondsUntilNextWechatAlbumRun(date = new Date()) {
  const parts = shanghaiParts(date)
  const todayPassed = parts.hour > RUN_HOUR || (parts.hour === RUN_HOUR && parts.minute >= RUN_MINUTE)
  const target = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + (todayPassed ? 1 : 0), 4, RUN_MINUTE, 0))
  return Math.max(0, target.getTime() - date.getTime())
}

/** 服务在当天 12:15 后启动时立即补跑；运行台账会阻止当天重复导入。 */
export function millisecondsUntilFirstWechatAlbumRun(date = new Date()) {
  const parts = shanghaiParts(date)
  const todayPassed = parts.hour > RUN_HOUR || (parts.hour === RUN_HOUR && parts.minute >= RUN_MINUTE)
  return todayPassed ? 0 : millisecondsUntilNextWechatAlbumRun(date)
}
