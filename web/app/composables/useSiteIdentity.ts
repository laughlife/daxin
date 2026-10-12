/**
 * 站点身份信息（名称、副标题、描述、电话、邮箱、地址）的统一读取口。
 *
 * 背景：这些字段在 `site_settings` 里本来就有（site_name、site_subtitle、
 * site_description、contact_phone、contact_email、contact_address），
 * 但前台一直直接读 `config/site.ts` / `config/contact.ts`，
 * 导致后台改了不生效、两处维护容易不一致。
 *
 * 因此这里的取值规则是：**后台配置优先，为空时回退 config**。
 * 这样既让后台真正可维护，又不会因为某项没填而让页面空掉。
 *
 * 注意：只覆盖「身份与联系方式」这类纯文本。
 * 导航、法务条款、二维码渠道等仍留在 config，不在本次范围内。
 */
import { computed } from 'vue'
import { siteConfig } from '~/config/site'
import { contactInfo, wechatChannels } from '~/config/contact'

/** config 中作为兜底的微信号（TRO 咨询号）。 */
const FALLBACK_WECHAT =
  wechatChannels.find(channel => channel.id === 'tro')?.wechatId ?? ''

/** 取出后台配置里的非空字符串；非字符串或全空白按「未配置」处理。 */
function readSetting(settings: Record<string, unknown> | undefined, key: string): string {
  const value = settings?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

export function useSiteIdentity() {
  const { data: siteSettings } = useSiteSettings()

  const settings = computed(
    () => (siteSettings.value?.settings ?? {}) as Record<string, unknown>
  )

  /**
   * 返回**单个 computed 对象**而不是一堆 ref。
   *
   * 原因：Vue 模板只会自动解包「顶层」的 ref，像 identity.name 这种
   * 从普通对象里取出的 ref 不会被解包，会直接当对象渲染。
   * 返回一个 computed，模板里 `identity.name` 拿到的就是字符串。
   */
  return computed(() => ({
    /** 站点名称 */
    name: readSetting(settings.value, 'site_name') || siteConfig.name,
    /** 站点副标题（当前页头使用） */
    subtitle: readSetting(settings.value, 'site_subtitle') || siteConfig.subtitle,
    /** 站点描述（SEO / 结构化数据使用） */
    description: readSetting(settings.value, 'site_description') || siteConfig.description,
    /** 联系电话 */
    phone: readSetting(settings.value, 'contact_phone') || contactInfo.phone,
    /** 联系邮箱 */
    email: readSetting(settings.value, 'contact_email') || contactInfo.email,
    /** 联系地址 */
    address: readSetting(settings.value, 'contact_address') || contactInfo.address,
    /** 联系微信（需求：general 增加一个微信，页脚「联系我们」四项都引用配置） */
    wechat: readSetting(settings.value, 'contact_wechat') || FALLBACK_WECHAT,
  }))
}
