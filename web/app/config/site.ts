import type { SiteConfig } from '../types/site'

/**
 * 站点全局配置
 *
 * 说明：
 * - 所有正式品牌信息（Logo、微信号、电话、邮箱、地址、ICP 备案号等）
 *   均为明确的 TODO 占位符，待业务方确认后统一在本文件替换。
 * - 导航结构以本文件为唯一数据源，组件中不得硬编码导航。
 * - 路由地址为规划路径，对应页面在后续任务中实现（详见 docs/navigation-map.md）。
 */
export const siteConfig: SiteConfig = {
  name: '大信法务',
  subtitle: 'TODO：正式副标题待确认',
  description:
    'TODO：正式网站描述待确认。当前为占位描述，大信法务官网站点壳层与设计系统预览。',

  logo: {
    src: null, // TODO：正式 Logo 尚未提供
    alt: '大信法务 Logo（占位）',
    text: '大信'
  },

  contact: {
    wechatId: 'TODO-wechat-id', // TODO：正式微信号待确认
    wechatLabel: '微信公众号 / 微信号（占位）',
    phone: 'TODO：联系电话待确认',
    email: 'TODO：联系邮箱待确认',
    address: 'TODO：公司地址待确认'
  },

  announcement: {
    text: 'TODO：正式公告文案待确认。当前为占位公告，用于验证顶部公告栏与微信号复制功能。',
    copyButtonLabel: '复制微信号',
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
      title: 'TRO 业务',
      items: [
        { label: 'TRO 案件查询', to: '/tro/cases' },
        { label: 'TRO 侵权预警', to: '/tro/alerts' },
        { label: 'TRO 成功案例', to: '/tro/success-cases' },
        { label: 'CPSC 召回', to: '/tro/cpsc-recalls' }
      ]
    },
    {
      title: '国内业务',
      items: [
        { label: '劳动纠纷', to: '/domestic/labor-disputes' },
        { label: '货代案例', to: '/domestic/freight-cases' },
        { label: '跨境资讯', to: '/domestic/cross-border-news' }
      ]
    },
    {
      title: '常见问题',
      items: [
        { label: 'TRO 常见问题', to: '/faq/tro' },
        { label: 'TRO 原告律所', to: '/faq/plaintiff-firms' },
        { label: '劳动争议', to: '/faq/labor' },
        { label: '跨境干货', to: '/faq/cross-border' }
      ]
    },
    {
      title: '其他',
      items: [
        { label: '侵权品牌库', to: '/brands' },
        { label: '关于我们', to: '/about' },
        { label: '科普干货', to: '/tro/guides' },
        { label: '热点资讯', to: '/tro/news' }
      ]
    }
  ],

  cta: {
    label: '产品侵权检测',
    to: '/infringement-check'
  },

  legal: {
    icp: 'TODO：ICP 备案号待确认',
    copyright: 'TODO：正式版权信息待确认',
    privacyLink: { label: '隐私政策', to: '/privacy' },
    disclaimerLink: { label: '免责声明', to: '/disclaimer' }
  }
}
