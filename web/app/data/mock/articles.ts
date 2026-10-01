import type { ArticleRecord } from '../../types/content'

/**
 * 案例分享 / 文章 Mock 数据
 *
 * 重要：以下全部为演示内容，不对应真实案件或真实法律意见；
 * 详情路由为规划路径（见 docs/navigation-map.md），页面尚未实现。
 * imageSrc 一律为 null，由组件渲染“配图占位”，不伪造正式图片。
 */
export const mockArticles: ArticleRecord[] = [
  {
    id: 'article-01',
    category: 'TRO 案件进展',
    title: '【演示】某户外用品商标 TRO 案件应诉与和解流程梳理',
    excerpt:
      '演示内容：以 Mock 案件 MOCK-25-cv-9001 为背景，梳理收到 TRO 通知后的应诉时间线、店铺资金冻结应对与和解评估要点。',
    publishedAt: '2025-09-28',
    isFeatured: true,
    href: '/tro/news/demo-tro-settlement-process',
    imageSrc: null,
    imageAlt: 'TRO 案件流程示意（占位图形）'
  },
  {
    id: 'article-02',
    category: 'TRO 案件进展',
    title: '【演示】版权批量诉讼中卖家的自查清单',
    excerpt:
      '演示内容：针对图案版权批量维权场景，整理链接下架、销售记录核对与授权链自查的演示清单。',
    publishedAt: '2025-09-26',
    isFeatured: false,
    href: '/tro/news/demo-copyright-self-check',
    imageSrc: null,
    imageAlt: '版权自查清单示意（占位图形）'
  },
  {
    id: 'article-03',
    category: 'TRO 案件进展',
    title: '【演示】缺席判决是如何发生的：应诉期限提醒',
    excerpt:
      '演示内容：说明被告未按时应诉导致缺席判决的常见情形，以及判决后的救济途径概览（演示文案）。',
    publishedAt: '2025-09-22',
    isFeatured: false,
    href: '/tro/news/demo-default-judgment-notice',
    imageSrc: null,
    imageAlt: '应诉期限提醒示意（占位图形）'
  },
  {
    id: 'article-04',
    category: '劳动法案例',
    title: '【演示】跨境电商企业解除劳动关系争议的合规要点',
    excerpt:
      '演示内容：以虚构案例为背景，展示解除劳动合同流程、经济补偿计算与证据留存的一般性说明。',
    publishedAt: '2025-09-25',
    isFeatured: true,
    href: '/faq/labor/demo-labor-dispute-points',
    imageSrc: null,
    imageAlt: '劳动争议合规要点示意（占位图形）'
  },
  {
    id: 'article-05',
    category: '劳动法案例',
    title: '【演示】试用期用工常见争议与制度搭建演示',
    excerpt:
      '演示内容：整理试用期录用条件告知、考核记录与转正流程的演示要点，供企业内训参考。',
    publishedAt: '2025-09-18',
    isFeatured: false,
    href: '/faq/labor/demo-probation-disputes',
    imageSrc: null,
    imageAlt: '试用期用工争议示意（占位图形）'
  },
  {
    id: 'article-06',
    category: '劳动法案例',
    title: '【演示】加班费争议中的举证责任分配概览',
    excerpt:
      '演示内容：以虚构争议为背景，概览考勤记录、加班审批与举证责任的一般性说明（非法律意见）。',
    publishedAt: '2025-09-10',
    isFeatured: false,
    href: '/faq/labor/demo-overtime-burden-of-proof',
    imageSrc: null,
    imageAlt: '加班费争议示意（占位图形）'
  }
]

/** 按分类筛选文章 */
export function findArticlesByCategory(category: string): ArticleRecord[] {
  return mockArticles.filter(article => article.category === category)
}
