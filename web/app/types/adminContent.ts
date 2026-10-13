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
  summary: string
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
  summary: string
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
  region: string
  summary: string
  /** 只读：由关联表实时统计，后台不可写 */
  caseCount: number
  /** 1 = 正常，0 = 归档 */
  status: number
  createdAt: string
  updatedAt: string
}
