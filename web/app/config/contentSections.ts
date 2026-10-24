/**
 * 内容栏目静态配置。
 *
 * 栏目结构（路径、标题、分组）属于站点导航配置；栏目下的文章来自公开接口，
 * 通过 `category` 字段（article_categories.slug）与 `~/repositories/articles` 的
 * fetchArticles() 对接。`category` 为空串表示该栏目暂无对应分类，列表显示空状态，
 * 不会退化成“列出全部文章”。
 */
export interface ContentSection {
  path: string
  title: string
  group: 'tro' | 'labor' | 'all'
  description: string
  /** 公开接口的文章分类 slug；空串表示暂无对应分类。 */
  category: string
}

export const contentSections: ContentSection[] = [
  {
    path: '/about/lectures',
    title: '企业宣讲',
    group: 'all',
    description: '企业宣讲照片已展示于关于我们页面，详细宣讲内容整理后补充。',
    category: ''
  },
  {
    path: '/tro/alerts',
    title: 'TRO 侵权预警',
    group: 'tro',
    description: '跟踪知识产权案件动态，做好品牌与产品风险自查。',
    category: 'tro-alert'
  },
  {
    path: '/tro/patent-alerts',
    title: '专利预警',
    group: 'tro',
    description: '关注专利侵权案件动态与产品风险预警。',
    category: 'patent-alert'
  },
  {
    path: '/tro/success-cases',
    title: 'TRO 成功案例',
    group: 'tro',
    description: '了解案件处理流程与沟通方式。',
    category: 'tro-success'
  },
  {
    path: '/tro/cpsc-recalls',
    title: 'CPSC 召回',
    group: 'tro',
    description: '聚焦美国产品安全、召回沟通与资料准备。',
    category: 'cpsc-recalls'
  },
  {
    path: '/tro/guides',
    title: '科普干货',
    group: 'tro',
    description: '认识 TRO、知识产权与平台申诉的基本概念。',
    category: 'knowledge'
  },
  {
    path: '/tro/news',
    title: '热点资讯',
    group: 'tro',
    description: 'TRO 案件进展与跨境知识产权资讯。',
    category: 'news'
  },
  {
    path: '/domestic/labor-disputes',
    title: '劳动纠纷',
    group: 'labor',
    description: '企业用工、劳动合同与劳动争议的材料管理。',
    category: 'labor-case'
  },
  {
    path: '/domestic/freight-cases',
    title: '货代案例',
    group: 'labor',
    description: '海运、空运、国际货代纠纷的处理流程。',
    category: 'freight-case'
  },
  {
    path: '/domestic/cross-border-news',
    title: '跨境咨询',
    group: 'labor',
    description: '跨境企业经营、物流与合同风控资讯。',
    category: 'cross-border-consulting'
  },
  {
    path: '/faq/tro',
    title: 'TRO 常见问题',
    group: 'tro',
    description: '从案件通知、应诉材料到沟通流程，快速查找常见问题。',
    category: ''
  },
  {
    path: '/faq/labor',
    title: '劳动争议',
    group: 'labor',
    description: '劳动关系与企业用工管理常见问题。',
    category: ''
  },
  {
    path: '/faq/cross-border',
    title: '跨境干货',
    group: 'all',
    description: '跨境电商与国际物流经营中的资料准备与风险管理。',
    category: ''
  }
]

/** 按路径查找栏目；找不到返回 undefined。 */
export function findContentSection(path: string): ContentSection | undefined {
  return contentSections.find(section => section.path === path)
}

/**
 * 由文章详情路径（`${section.path}/${slug}`）反查所属栏目。
 * 接口返回的 href 前缀就是栏目的公开路径，因此直接按最后一段截断后匹配。
 */
export function findContentSectionByHref(href: string): ContentSection | undefined {
  const index = href.lastIndexOf('/')
  if (index <= 0) return undefined
  return findContentSection(href.slice(0, index))
}
