/**
 * 站点全局配置相关类型定义
 */
import type { ContactChannel } from './content'

/** 单个导航项，支持可选的二级子菜单 */
export interface NavItem {
  /** 导航显示文案 */
  label: string
  /** 路由地址；含子菜单且父级不可点击时可省略 */
  to?: string
  /** 二级导航 */
  children?: NavItem[]
}

/** Footer 导航分组 */
export interface FooterNavGroup {
  /** 分组标题 */
  title: string
  /** 分组内链接 */
  items: NavItem[]
}

/** Logo 占位配置 */
export interface LogoConfig {
  /** 正式 Logo 图片地址；未提供时为 null（TODO） */
  src: string | null
  /** 图片 Logo 的替代文本 */
  alt: string
  /** 无图片时使用的文字 Logo 占位 */
  text: string
}

/** 联系方式配置（数据来自需求文档初稿，待甲方最终确认） */
export interface ContactConfig {
  /** 微信咨询渠道列表（TRO 咨询号 / 劳动法咨询号） */
  wechatAccounts: ContactChannel[]
  /** 公告栏默认复制的渠道 id */
  defaultCopyChannelId: string
  /** 电话 */
  phone: string
  /** 邮箱 */
  email: string
  /** 地址 */
  address: string
  /** 数据来源说明（页面展示，提醒仍待确认） */
  notice: string
}

/** 顶部公告栏配置 */
export interface AnnouncementConfig {
  /** 公告文案 */
  text: string
  /** 复制按钮文案 */
  copyButtonLabel: string
  /** 复制成功提示 */
  copiedLabel: string
  /** 复制失败提示 */
  failedLabel: string
}

/** CTA 按钮配置（产品侵权检测） */
export interface CtaConfig {
  label: string
  to: string
}

/** 法律与备案信息占位 */
export interface LegalConfig {
  /** ICP 备案号（TODO 占位） */
  icp: string
  /** 版权信息（TODO 占位） */
  copyright: string
  /** 隐私政策链接 */
  privacyLink: NavItem
  /** 免责声明链接 */
  disclaimerLink: NavItem
}

/** 站点全局配置 */
export interface SiteConfig {
  /** 网站名称 */
  name: string
  /** 网站副标题 */
  subtitle: string
  /** 默认 SEO 描述 */
  description: string
  /** Logo 占位配置 */
  logo: LogoConfig
  /** 联系方式占位配置 */
  contact: ContactConfig
  /** 顶部公告栏配置 */
  announcement: AnnouncementConfig
  /** 顶部主导航 */
  mainNav: NavItem[]
  /** Footer 导航分组 */
  footerNav: FooterNavGroup[]
  /** 产品侵权检测 CTA 配置 */
  cta: CtaConfig
  /** 法律与备案信息 */
  legal: LegalConfig
}
