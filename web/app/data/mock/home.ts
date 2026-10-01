import type { HomeStat, ServiceCapabilityTag } from '../../types/content'

/**
 * 首页内容 Mock 数据
 * 文案来源：《大信团队官网需求文档》初稿；正式文案以甲方最终确认为准。
 */

/** Hero 首屏 */
export const homeHero = {
  badge: '跨境电商 · 全链路法律服务',
  title: '跨境有我，法律无忧',
  subtitle:
    '专注于为跨境电商企业、品牌卖家及供应链伙伴提供全链路、跨法域、高实效的法律顾问服务',
  primaryCta: {
    label: '查询 TRO 案件',
    to: '/tro/cases'
  },
  secondaryCta: {
    label: '联系我们免费评估案件'
  }
} as const

/** About US 团队介绍（需求文档初稿文案） */
export const teamIntro = {
  title: 'About US · 大信法务团队',
  paragraphs: [
    '大信法务团队成立于 2019 年，深耕法律行业多年，拥有经验丰富的国内外实力律师。',
    '主营海运、空运全链路法律业务，面向国际物流、跨境服务商、出海卖家提供法律顾问服务；同步覆盖 TRO 知识产权、CPSC 召回、美国加州 65 号法案、用工劳动合规、合同风控、海关合规，可代理各类纠纷诉讼，高效处理货损、欠款、维权等各类争议。'
  ],
  moreLink: {
    label: '了解更多关于我们',
    to: '/about'
  }
} as const

/** 统计数据（数值与说明均来自需求文档） */
export const homeStats: HomeStat[] = [
  {
    value: '7 年',
    label: '行业深耕',
    description: '专注从事跨境电商法律咨询服务',
    emphasis: true
  },
  {
    value: '1000+',
    label: '企业客户',
    description: '服务近千家跨境电商企业',
    emphasis: false
  },
  {
    value: '10000+',
    label: '案件处理',
    description: '处理近万起法律案件',
    emphasis: false
  },
  {
    value: '95%',
    label: '客户推荐率',
    description: '服务质量驱动的口碑推荐',
    emphasis: true
  },
  {
    value: '24 小时',
    label: '全天响应',
    description: '7×24 小时全天响应',
    emphasis: false
  }
]

/** 服务能力标签（“我们的小伙伴”暂无正式素材，以服务能力展示代替） */
export const serviceCapabilityTags: ServiceCapabilityTag[] = [
  { id: 'tro', label: 'TRO 知识产权', description: '和解 / 应诉 / 起诉全流程' },
  { id: 'amazon', label: '亚马逊申诉', description: '全套申诉与链接维权下架' },
  { id: 'cpsc', label: 'CPSC 召回', description: '产品召回合规应对' },
  { id: 'ca65', label: '加州 65 法案', description: '美国加州 65 号法案合规' },
  { id: 'labor', label: '用工劳动合规', description: '劳动人事管理与争议处理' },
  { id: 'contract', label: '合同风控', description: '合同债务纠纷与文书撰写' },
  { id: 'customs', label: '海关合规', description: '跨境物流与海关事务' },
  { id: 'litigation', label: '诉讼代理', description: '货损、欠款、维权等争议' }
]

/** 合作伙伴占位说明（无正式素材，禁止伪造 Logo） */
export const partnerPlaceholder = {
  title: '我们的小伙伴',
  notice: '合作伙伴 Logo 与介绍素材待提供，当前为占位区域，不展示任何虚构公司信息。'
} as const

/** 底部咨询 CTA */
export const consultationCta = {
  title: '24H/7 联系法务团队',
  description:
    '无论 TRO 案件、物流纠纷还是劳动用工问题，均可通过电话、邮箱或微信咨询号联系我们，获取免费初步评估。',
  openModalLabel: '微信二维码咨询'
} as const
