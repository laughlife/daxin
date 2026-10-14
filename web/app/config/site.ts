import type { SiteConfig } from '../types/site'
import { CONTACT_DATA_NOTICE, contactInfo, wechatChannels } from './contact'

/**
 * 站点全局配置
 *
 * 说明：
 * - 正式品牌信息（Logo、ICP 备案号等）仍为 TODO 占位符，待业务方确认后统一替换。
 * - 联系方式与微信咨询号来自《大信团队官网需求文档》初稿（同目录 contact.ts），
 *   仍需甲方最终确认，页面会展示相应提示。
 * - 导航结构以本文件为唯一数据源，组件中不得硬编码导航。
 * - 路由地址为规划路径，对应页面在后续任务中实现（详见 docs/navigation-map.md）。
 */
export const siteConfig: SiteConfig = {
  name: '大信法务',
  subtitle: '跨境电商与国际物流法律服务',
  description:
    '大信法务团队，为跨境电商与国际物流企业提供 TRO、知识产权、劳动合规与争议解决服务。',
  /** 页脚公司简介（与旧站页脚左侧简介一致）。 */
  footerIntro:
    '大信法务团队为深耕跨境赛道的专业跨境电商、国际物流律师团队。主营海运、空运全链路法律业务，'
    + '面向国际物流、跨境服务商、出海卖家提供法律顾问服务；同步覆盖用工劳动合规、TRO、合同风控、'
    + '海关合规，可代理各类纠纷诉讼，高效处理货损、欠款、维权等各类争议。',

  logo: {
    src: null, // TODO：正式 Logo 尚未提供
    alt: '大信法务 Logo（占位）',
    text: '大信'
  },

  contact: {
    wechatAccounts: wechatChannels,
    defaultCopyChannelId: 'tro',
    phone: contactInfo.phone,
    email: contactInfo.email,
    address: contactInfo.address,
    notice: CONTACT_DATA_NOTICE
  },

  announcement: {
    // 需求（2026-10-10 修订）：首页顶部保留「联系我们可领取 TRO 侵权大礼包」引导，
    // 格式为「引导文案 + TRO 咨询号 + 复制按钮」，与旧站及需求文档截图一致。
    // 注意：需要删除的是关于我们页面里的「扫码领取 TRO 侵权大礼包」扫码区，不是这条公告。
    text: '联系我们可领取 TRO 侵权大礼包',
    copyButtonLabel: '复制 TRO 微信号',
    copiedLabel: '微信号已复制',
    failedLabel: '复制失败，请手动复制'
  },

  mainNav: [
    { label: '首页', to: '/' },
    { label: 'TRO 案件查询', to: '/tro/cases' },
    {
      label: 'TRO 业务',
      children: [
        { label: 'TRO 侵权预警', to: '/tro/alerts' },
        { label: 'TRO 成功案例', to: '/tro/success-cases' },
        { label: 'CPSC 召回', to: '/tro/cpsc-recalls' },
        { label: '科普干货', to: '/tro/guides' },
        { label: '热点资讯', to: '/tro/news' }
      ]
    },
    {
      label: '国内业务',
      children: [
        { label: '劳动纠纷', to: '/domestic/labor-disputes' },
        { label: '货代案例', to: '/domestic/freight-cases' },
        { label: '跨境资讯', to: '/domestic/cross-border-news' }
      ]
    },
    { label: '侵权品牌库', to: '/brands' },
    {
      label: '常见问题',
      children: [
        { label: 'TRO 常见问题', to: '/faq/tro' },
        { label: 'TRO 原告律所', to: '/faq/plaintiff-firms' },
        { label: '劳动争议', to: '/faq/labor' },
        { label: '跨境干货', to: '/faq/cross-border' }
      ]
    },
    { label: '关于我们', to: '/about' }
  ],

  footerNav: [
    {
      title: '知识产权服务',
      items: [
        { label: 'TRO 和解应诉', to: '/tro/cases' },
        { label: '亚马逊申诉/投诉', to: '/tro/guides' },
        { label: '不侵权报告', to: '/infringement-check' },
        { label: '加州 65 号法案', to: '/tro/guides' },
        { label: 'CPSC 召回', to: '/tro/cpsc-recalls' },
        { label: '商标/版权/专利申请', to: '/tro/guides' },
        { label: '亚马逊专利中立评估（APEX）', to: '/tro/guides' }
      ]
    },
    {
      title: '国内业务',
      items: [
        { label: '劳动人事管理', to: '/domestic/labor-disputes' },
        { label: '跨境物流纠纷', to: '/domestic/freight-cases' },
        { label: '货代民商纠纷', to: '/domestic/freight-cases' },
        { label: '企业法律顾问', to: '/about' }
      ]
    }
  ],

  cta: {
    label: '产品侵权检测',
    to: '/infringement-check'
  },

  legal: {
    copyright: '大信法务团队 · 官网展示版',
  }
}
