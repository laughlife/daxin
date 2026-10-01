import type { BusinessCard } from '../../types/content'

/**
 * 核心业务 Mock 数据
 * 业务条目全部来自《大信团队官网需求文档》，仅做卡片化分组，不发明新业务方向。
 * href 指向当前已实现页面，业务落地页实现后再调整（见 docs/navigation-map.md）。
 */
export const businessCards: BusinessCard[] = [
  {
    id: 'overseas-tro',
    group: 'overseas',
    title: 'TRO 与链接维权',
    summary: '面向美国 TRO 临时限制令的和解、应诉、起诉全流程，以及平台链接维权下架。',
    items: ['TRO 和解', 'TRO 应诉', 'TRO 起诉', '链接维权下架'],
    iconKey: 'scale',
    href: '/tro/cases',
    accent: true
  },
  {
    id: 'overseas-compliance',
    group: 'overseas',
    title: '平台合规与知识产权布局',
    summary: '亚马逊全套申诉、CPSC 产品召回、美国加州 65 号法案应对与知识产权布局。',
    items: ['亚马逊全套申诉', '美国加州 65 法案', 'CPSC 产品召回', '知识产权布局'],
    iconKey: 'shield',
    href: '/about',
    accent: false
  },
  {
    id: 'domestic-advisor',
    group: 'domestic',
    title: '企业法律顾问',
    summary: '为企业与经营者提供常年法律顾问、劳动人事、股权投融资与私人律师服务。',
    items: ['常年法律顾问', '劳动人事管理', '股权及投融资', '老板私人律师'],
    iconKey: 'briefcase',
    href: '/about',
    accent: false
  },
  {
    id: 'domestic-disputes',
    group: 'domestic',
    title: '纠纷处理与法律文书',
    summary: '跨境物流、跨境电商与合同债务纠纷处理，以及各类法律文书撰写。',
    items: ['跨境物流纠纷', '跨境电商纠纷', '合同债务纠纷', '法律文书撰写'],
    iconKey: 'document',
    href: '/about',
    accent: true
  }
]

/** 分组标题（首页“核心业务”区域使用） */
export const businessGroups = {
  overseas: {
    id: 'overseas',
    title: '国外业务',
    description: '覆盖 TRO 知识产权、平台申诉、产品召回与出海合规的法律服务。'
  },
  domestic: {
    id: 'domestic',
    title: '国内业务',
    description: '覆盖企业常年法律顾问、劳动人事、股权投融资与各类纠纷处理。'
  }
} as const
