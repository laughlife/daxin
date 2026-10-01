/**
 * 内容模型类型定义
 *
 * 说明：当前阶段所有内容数据均来自本地 Mock（web/app/data/mock/），
 * 未来接入 Laravel API 时仅需替换数据仓库层，页面组件不应重写。
 */

/** 首页统计项 */
export interface HomeStat {
  /** 展示数值，如 “7 年”“1000+” */
  value: string
  /** 简短标签 */
  label: string
  /** 补充说明 */
  description: string
  /** 是否强调显示（主色大号） */
  emphasis: boolean
}

/** 业务分组：国外业务 / 国内业务 */
export type BusinessGroup = 'overseas' | 'domestic'

/** 首页业务卡片 */
export interface BusinessCard {
  /** 唯一标识 */
  id: string
  /** 所属分组 */
  group: BusinessGroup
  /** 卡片标题 */
  title: string
  /** 一句话简介 */
  summary: string
  /** 业务条目（来自需求文档，不自行发明业务方向） */
  items: string[]
  /** 图标键，由组件映射为内置 SVG 占位图标 */
  iconKey: 'scale' | 'shield' | 'document' | 'briefcase'
  /** 入口链接 */
  href: string
  /** 是否强调样式（描边高亮） */
  accent: boolean
}

/** TRO 案件类型 */
export type CaseType = 'trademark' | 'patent' | 'copyright'

/** TRO 案件记录（Mock） */
export interface CaseRecord {
  /** 唯一标识 */
  id: string
  /** 案件号（Mock 编号） */
  caseNumber: string
  /** 立案日期（固定 Mock 值，不依赖系统时间） */
  filedAt: string
  /** 代理律所（演示名称） */
  lawFirm: string
  /** 原告品牌（演示名称） */
  plaintiffBrand: string
  /** 起诉州 */
  state: string
  /** 案件类型 */
  caseType: CaseType
  /** 展示分类，如 “商标侵权” */
  category: string
  /** 案件状态（演示值） */
  status: string
  /** 摘要 */
  summary: string
  /** 标签 */
  tags: string[]
  /** 是否“近 3 天”更新（Mock 固定标记，避免 SSR 时间不一致） */
  isRecent: boolean
  /** 详情页 slug */
  slug: string
}

/** 文章 / 案例分享记录（Mock） */
export interface ArticleRecord {
  /** 唯一标识 */
  id: string
  /** 分类，如 “TRO 案件进展”“劳动法案例” */
  category: string
  /** 标题 */
  title: string
  /** 摘要 */
  excerpt: string
  /** 发布日期（固定 Mock 值） */
  publishedAt: string
  /** 是否置顶推荐 */
  isFeatured: boolean
  /** 详情链接（规划路由，未实现前指向占位说明） */
  href: string
  /** 配图地址；null 表示使用占位图形，不伪造正式图片 */
  imageSrc: string | null
  /** 配图替代文本 */
  imageAlt: string
}

/** 联系渠道（微信咨询号） */
export interface ContactChannel {
  /** 唯一标识 */
  id: string
  /** 渠道名称 */
  name: string
  /** 微信号 */
  wechatId: string
  /** 用途说明 */
  purpose: string
  /** 二维码图片地址；null 时展示“二维码待提供”占位卡片 */
  qrSrc: string | null
  /** 是否可用 */
  available: boolean
}

/** 服务能力标签（“我们的小伙伴”区域替代方案） */
export interface ServiceCapabilityTag {
  id: string
  label: string
  description: string
}
