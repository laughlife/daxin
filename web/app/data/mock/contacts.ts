import type { ContactChannel } from '../../types/content'

/**
 * 联系方式 Mock 数据
 *
 * 来源：《大信团队官网需求文档》初稿，仍待甲方最终确认（见 docs/blockers.md）。
 * qrSrc 一律为 null：正式微信二维码尚未提供，组件须渲染“二维码待提供”占位卡片，
 * 禁止生成假二维码图片。
 */

/** 微信咨询渠道 */
export const wechatChannels: ContactChannel[] = [
  {
    id: 'tro',
    name: 'TRO 咨询号',
    wechatId: 'kjzx88',
    purpose: 'TRO 案件、侵权预警与跨境知识产权咨询',
    qrSrc: null,
    available: true
  },
  {
    id: 'labor',
    name: '劳动法咨询号',
    wechatId: 'chen_6506',
    purpose: '劳动争议与企业用工咨询',
    qrSrc: null,
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
