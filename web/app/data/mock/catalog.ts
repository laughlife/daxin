import { mockArticles } from './articles'
import type { ArticleRecord } from '../../types/content'

export interface ContentSection { path: string; title: string; group: 'tro' | 'labor' | 'all'; description: string; topics: string[] }
export interface ContentArticle extends ArticleRecord { sectionPath: string; body: { title: string; text: string }[]; keywords: string }

export const contentSections: ContentSection[] = [
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

function articleBody(section: ContentSection, title: string, excerpt: string) {
  const checklist = section.group === 'tro'
    ? '整理案件号、通知日期、品牌名称、代理律所及销售平台信息；保留邮件原文、链接、销售记录、产品图片和授权材料。'
    : '整理合同、付款凭证、沟通记录与事项时间线；劳动事项同时准备劳动合同、规章制度、考勤及工资记录，物流事项准备提单、交接记录和货物照片。'
  return [
    { title: '内容概览', text: excerpt },
    { title: '资料准备', text: checklist },
    { title: '沟通与服务流程', text: '按时间顺序汇总事实，标注尚待确认的信息与希望解决的问题。可通过本页对应的公众号了解资讯，或添加咨询号提交初步情况，由团队结合具体材料进一步沟通。' },
    { title: '演示说明', text: `本篇“${title}”用于展示${section.title}栏目与阅读流程，不对应真实案例实绩，不构成针对具体事项的法律意见。正式文章及案例将在运营资料确认后替换。` }
  ]
}

const existing: ContentArticle[] = mockArticles.map(article => {
  const sectionPath = article.category === '劳动法案例' ? '/faq/labor' : '/tro/news'
  const section = contentSections.find(item => item.path === sectionPath)!
  return { ...article, sectionPath, body: articleBody(section, article.title, article.excerpt), keywords: article.title + ' ' + article.excerpt }
})

export const contentArticles: ContentArticle[] = [
  ...existing,
  ...contentSections.flatMap(section => section.topics.map((topic, index) => {
    const title = topic.startsWith('【演示】') ? topic : `【演示】${topic}`
    const excerpt = `${section.description}本篇展示“${topic.replace('【演示】', '')}”的资料准备与服务流程。`
    return { id: `${section.path}-${index}`, category: section.title, title, excerpt, publishedAt: index === 0 ? '2026-10-07' : '2026-10-06', isFeatured: index === 0, href: `${section.path}/demo-${index + 1}`, imageSrc: null, imageAlt: '', sectionPath: section.path, body: articleBody(section, title, excerpt), keywords: `${title} ${excerpt}` }
  }))
]

export const contentRoutes = [...contentSections.map(item => item.path), ...contentArticles.map(item => item.href)]
