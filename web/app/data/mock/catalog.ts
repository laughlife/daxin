import { findArticleContent } from '../../repositories/articleContent'


import legacyArticles from '../legacy/articles.json'
import type { ArticleRecord } from '../../types/content'

export interface ContentSection { path: string; title: string; group: 'tro' | 'labor' | 'all'; description: string; topics: string[] }
export interface ContentArticle extends ArticleRecord { sectionPath: string; body: { title: string; text: string }[]; keywords: string; relatedCaseSlugs: string[]; source?: { articleId: number; table: string; title: string } }

export const contentSections: ContentSection[] = [
  { path: '/about/lectures', title: '企业宣讲', group: 'all', description: '跨境企业法律培训主题与服务流程展示，以下为演示资料。', topics: ['【演示】跨境电商知识产权培训主题', '【演示】企业劳动用工与合同风控宣讲'] },
  { path: '/tro/alerts', title: 'TRO 侵权预警', group: 'tro', description: '跟踪知识产权案件动态，做好品牌与产品风险自查。', topics: ['收到 TRO 通知后的信息整理', '产品上架前的知识产权检查'] },
  { path: '/tro/success-cases', title: 'TRO 成功案例', group: 'tro', description: '了解案件处理流程与沟通方式，以下为流程演示案例。', topics: ['【演示】店铺冻结后的应诉与和解流程', '【演示】知识产权纠纷材料归档'] },
  { path: '/tro/cpsc-recalls', title: 'CPSC 召回', group: 'tro', description: '聚焦美国产品安全、召回沟通与资料准备。', topics: ['产品召回资料准备与协作流程', '跨境产品安全问题的内部记录'] },
  { path: '/tro/guides', title: '科普干货', group: 'tro', description: '认识 TRO、知识产权与平台申诉的基本概念。', topics: ['TRO 案件中常见文件与术语', '商标、版权与专利资料如何分类'] },
  { path: '/tro/news', title: '热点资讯', group: 'tro', description: 'TRO 案件进展与跨境知识产权资讯。', topics: ['跨境电商知识产权风险观察', '平台通知与诉讼通知的区别'] },
  { path: '/domestic/labor-disputes', title: '劳动纠纷', group: 'labor', description: '企业用工、劳动合同与劳动争议的材料管理。', topics: ['【演示】劳动争议沟通与资料整理', '企业劳动人事制度的日常维护'] },
  { path: '/domestic/freight-cases', title: '货代案例', group: 'labor', description: '海运、空运、国际货代纠纷的处理流程。', topics: ['【演示】货物延误纠纷的时间线整理', '【演示】运费争议中的凭证核对'] },
  { path: '/domestic/cross-border-news', title: '跨境资讯', group: 'labor', description: '跨境企业经营、物流与合同风控资讯。', topics: ['国际物流合同资料归档', '跨境企业合同履行记录清单'] },
  { path: '/faq/tro', title: 'TRO 常见问题', group: 'tro', description: '从案件通知、应诉材料到沟通流程，快速查找常见问题。', topics: ['收到 TRO 通知应先整理哪些信息？', '如何向法务团队说明店铺冻结情况？'] },
  { path: '/faq/labor', title: '劳动争议', group: 'labor', description: '劳动关系与企业用工管理常见问题。', topics: ['劳动争议咨询需要准备哪些材料？', '如何整理劳动合同与考勤记录？'] },
  { path: '/faq/cross-border', title: '跨境干货', group: 'all', description: '跨境电商与国际物流经营中的资料准备与风险管理。', topics: ['跨境经营资料如何建立台账？', '国际物流争议如何整理证据时间线？'] }
]

function aliases(from: string, to: string): ContentArticle[] {
  const category = contentSections.find(section => section.path === to)!.title
  return legacyArticles.filter(article => article.sectionPath === from).map(article => ({
    ...article, id: `${article.id}-${to}`, sectionPath: to, category,
    href: `${to}/legacy-${article.source.articleId}`
  }))
}

export const contentArticles: ContentArticle[] = [
  ...legacyArticles,
  ...aliases('/tro/alerts', '/tro/news'),
  ...aliases('/domestic/labor-disputes', '/faq/labor'),
  ...aliases('/tro/guides', '/faq/tro'),
  ...legacyArticles.filter(article => article.source.articleId === 290 || article.source.articleId === 8).map(article => ({
    ...article, id: article.id + '-cross-border', sectionPath: '/faq/cross-border', category: '跨境干货',
    href: `/faq/cross-border/legacy-${article.source.articleId}`
  }))
]
for (const article of contentArticles) {
  const body = findArticleContent(article.source?.articleId)
  if (body?.images.length) {
    article.imageSrc = body.images[0]!
    article.imageAlt = article.title + ' · 原文配图'
  }
}
for (const section of contentSections) {
  section.description = contentArticles.some(article => article.sectionPath === section.path) ? '精选大信旧站数据库中的历史资料，保留原始发布日期、原文排版与配图。' : section.path === '/about/lectures' ? '企业宣讲照片已展示于关于我们页面，详细宣讲文章待补充。' : '旧站数据库暂未找到对应专题文章，资料整理后补充。'
}
export const contentRoutes = [...contentSections.map(item => item.path), ...contentArticles.map(item => item.href)]

