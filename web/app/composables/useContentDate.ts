import { isWithinDays, shanghaiDate } from '~/utils/content'

/** SSR 与首次水合共享日期，客户端挂载后及跨午夜更新自然日。 */
export function useContentDate() {
  const today = useState('content-shanghai-date', () => shanghaiDate())
  let timer: ReturnType<typeof setInterval> | undefined
  onMounted(() => {
    today.value = shanghaiDate()
    timer = setInterval(() => { today.value = shanghaiDate() }, 60_000)
  })
  onBeforeUnmount(() => { if (timer) clearInterval(timer) })
  function isRecent(date: string) { return isWithinDays(date, 3, new Date(`${today.value}T04:00:00Z`)) }
  return { today, isRecent }
}
