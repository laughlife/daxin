import type { ContactChannel } from '../types/content'

/**
 * 联系方式配置（站点配置，不是内容数据）。
 *
 * 来源：《大信团队官网需求文档》初稿，仍待甲方最终确认（见 docs/blockers.md）。
 * 原先放在 data/mock/contacts.ts，页面改走数据库后它被误当成 Mock 数据；
 * 这些是真实的对外联系渠道配置，因此迁到 config 下。
 *
 * qrSrc 为实际部署的二维码资源路径；组件在图片缺失时渲染“二维码待提供”占位卡片，
 * 不生成假二维码图片。
 */

/** 微信咨询渠道 */
export const wechatChannels: ContactChannel[] = [
  {
    id: 'tro',
    name: 'TRO 咨询号',
    wechatId: 'kjzx88',
    purpose: 'TRO 案件、侵权预警与跨境知识产权咨询',
    qrSrc: '/images/qr/tro-consult.png',
    available: true
  },
  {
    id: 'labor',
    name: '劳动法咨询号',
    wechatId: 'chen_6506',
    purpose: '劳动争议与企业用工咨询',
    qrSrc: '/images/qr/labor-consult.png',
    available: true
  }
]

/** 电话 / 邮箱 / 地址（需求文档初稿，待甲方最终确认） */
export const contactInfo = {
  phone: '15918796817',
  email: 'xiaohua131400@126.com',
  address: '深圳市龙岗区坂雪岗科技城吉华路与杨山路交会处乐荟中心 TOWER12'
} as const

/** 联系方式数据状态说明（页面与文档中展示） */
export const CONTACT_DATA_NOTICE = '联系方式来自需求文档初稿，待甲方最终确认。'
