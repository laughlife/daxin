/**
 * 微信二维码渠道静态配置。
 * 原图来自需求 PDF 第 8 页（TRO）、第 9 页（劳动法），按图下标签逐一对应。
 */
export const qrChannels = [
  { id: 'tro-public', group: 'tro', kind: 'public', name: 'TRO 公众号', qrSrc: '/images/qr/tro-public.png', wechatId: '', assetKey: 'qr-tro-public' },
  { id: 'tro-consult', group: 'tro', kind: 'consult', name: 'TRO 咨询号', qrSrc: '/images/qr/tro-consult.png', wechatId: 'kjzx88', assetKey: 'qr-tro-consult' },
  { id: 'labor-public', group: 'labor', kind: 'public', name: '劳动法公众号', qrSrc: '/images/qr/labor-public.png', wechatId: '', assetKey: 'qr-labor-public' },
  { id: 'labor-consult', group: 'labor', kind: 'consult', name: '劳动法咨询号', qrSrc: '/images/qr/labor-consult.png', wechatId: 'chen_6506', assetKey: 'qr-labor-consult' }
] as const
