/**
 * 后台内容管理页面的数据形状。
 *
 * 与 `web/server/utils/admin/content-queries.ts` 的 Admin*Item 一一对应，
 * 但前端只声明自己会读到的字段（页面不得依赖服务端内部迁移字段）。
 */

/** 文章列表项 */
export interface AdminArticleItem {
  id: number
  slug: string
  title: string
  categoryId: number | null
  categoryName: string
  /** 'YYYY-MM-DD HH:mm:ss'，未发布为空串 */
  publishedAt: string
  status: string
  isFeatured: boolean
  /** 是否在首页侧栏「推荐阅读」中显示（文章编辑页配置项） */
  showInSidebar: boolean
  updatedAt: string
}

/** 文章详情：列表字段 + 未清洗的正文 HTML */
export interface AdminArticleDetail extends AdminArticleItem {
  contentHtml: string
  coverMediaId: number | null
  coverUrl: string
}

/** 案例列表项 */
export interface AdminCaseItem {
  id: number
  caseNumber: string
  /** 'YYYY-MM-DD'，未填写为空串 */
  filedAt: string
  plaintiff: string
  lawFirm: string
  brand: string
  court: string
  /** ip_types.slug：trademark / copyright / patent / unknown，未关联为空串 */
  caseType: string
  /** 内部状态：open / closed / archived */
  status: string
  /** 公开状态：draft / published / archived */
  publishStatus: string
  updatedAt: string
}

/** 案例详情：列表字段 + 可编辑字段与当前关联 id */
export interface AdminCaseDetail extends AdminCaseItem {
  title: string
  brandId: number | null
  lawFirmId: number | null
  ipTypeId: number | null
}

/** 品牌 / 律所列表项（律所的 region 有值，品牌恒为空串） */
export interface AdminEntityItem {
  id: number
  slug: string
  name: string
  nameEn: string
  aliases: string
  logoMediaId: number | null
  /** 品牌：logo 媒体资源地址；律所：law_firms.logo_url */
  logoUrl: string
  region: string
  summary: string
  /** 小程序采集字段（另一类实体恒为空串） */
  ipCategory: string
  brandOwner: string
  lawsuitType: string
  coverUrl: string
  defaultLawFirm: string
  shortName: string
  address: string
  website: string
  /** 采集简介（富文本原文，展示前需清洗） */
  intro: string
  /** 采集图片，仅详情接口返回 */
  images: string[]
  /** 只读：与公开站同一套文本匹配统计，后台不可写 */
  caseCount: number
  /** 1 = 正常，0 = 归档 */
  status: number
  createdAt: string
  updatedAt: string
}
