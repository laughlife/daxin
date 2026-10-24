// 公众号文章页：封面长图提取与封面优先级判定。
//
// 实测文章页用手机微信 UA 正常返回，采集器 UA 会被微信拦截；
// 长图地址位于页面内联脚本 `var msg_cdn_url = "..."` 中（900x382）。

/** 手机微信 UA：读取公开文章页时使用。 */
export const MOBILE_WECHAT_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.40 NetType=WIFI Language/zh_CN'

const MSG_CDN_PATTERN = /var\s+msg_cdn_url\s*=\s*"([^"]+)"/

/** 从文章页 HTML 提取长图地址；没有或不是 http(s) 时返回空串。 */
export function extractMsgCdnUrl(html: string): string {
  const match = MSG_CDN_PATTERN.exec(String(html ?? ''))
  const value = match?.[1]?.trim() ?? ''
  if (!value) return ''
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return ''
    url.protocol = 'https:'
    return url.toString()
  } catch {
    return ''
  }
}

/** 是否「长图/横幅」封面：宽 ≥600 且宽高比 ≥1.5（900x382 ≈ 2.36）。 */
export function isWideCover(width: number | null, height: number | null): boolean {
  if (!width || !height) return false
  return width >= 600 && width / height >= 1.5
}

export type CoverResolutionInput = {
  /** 文章当前封面 media id；没有则为 null。 */
  existingCoverId: number | null
  existingCoverWidth: number | null
  existingCoverHeight: number | null
  /** 本次采集准备写入的封面 media id；上传失败时为 null。 */
  nextCoverId: number | null
  /** 本次封面是否来自文章页长图（msg_cdn_url）。 */
  nextIsLong: boolean
}

/**
 * 决定文章最终写哪个封面：
 * - 本次没有新封面（上传失败）→ 保留现有，绝不清空；
 * - 新封面是长图 → 直接覆盖；
 * - 文章本来没有封面 → 用新封面；
 * - 现有封面已是长图、新封面只是方图 → 保留现有；
 * - 其余情况（现有是方图/未知尺寸）→ 用新封面。
 */
export function resolveArticleCoverId(input: CoverResolutionInput): number | null {
  const existing = input.existingCoverId ?? null
  const next = input.nextCoverId ?? null
  if (next === null) return existing
  if (input.nextIsLong) return next
  if (existing === null) return next
  return isWideCover(input.existingCoverWidth, input.existingCoverHeight) ? existing : next
}
