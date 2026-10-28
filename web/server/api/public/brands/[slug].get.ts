// GET /api/public/brands/{slug}
//
// 品牌详情：{ data: { brand, cases } }。
//   - brand 含分类 / 品牌方 / 起诉类型 / 最新关联案件的原告 · 律所 · 州 / 封面 / 介绍 / 图片；
//   - intro 在输出前按白名单清洗（后台简介可能是富文本，也可能是纯文本）；
//   - cases 仍按起诉时间倒序返回（保留既有契约），但页面不再展示历史发案列表。
// 品牌不存在或未启用时返回 404 中文提示。
import { findCasesForEntity, findPublicBrandProfile } from '../../../utils/public/case-queries'
import { publicApiError, withPublicApi } from '../../../utils/public/http'
import { toSafeRichText } from '../../../utils/public/sanitize'

export default defineEventHandler(async (event) => {
  const slug = (getRouterParam(event, 'slug') ?? '').trim()

  return withPublicApi(event, '品牌详情加载失败，请稍后重试', async () => {
    if (!slug) {
      return publicApiError(event, 404, 'NOT_FOUND', '品牌不存在或尚未公开')
    }

    const found = await findPublicBrandProfile(slug)
    if (!found) {
      return publicApiError(event, 404, 'NOT_FOUND', '品牌不存在或尚未公开')
    }

    const cases = await findCasesForEntity('brand', found.id)
    return {
      data: {
        brand: {
          ...found.brand,
          intro: toSafeRichText(found.brand.intro),
        },
        cases,
      },
    }
  })
})
