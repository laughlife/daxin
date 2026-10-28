// GET /api/public/law-firms/{slug}
//
// 律所详情：{ data: { firm, cases } }。
//   - firm 含简称 / 地址 / 官网 / 关联案件数 / Logo / 介绍 / 图片；
//   - intro 在输出前按白名单清洗（后台简介可能是富文本，也可能是纯文本）；
//   - cases 为该律所代理的已发布案件，按起诉时间倒序。
// 律所不存在或未启用时返回 404 中文提示。
import { findCasesForEntity, findPublicFirmProfile } from '../../../utils/public/case-queries'
import { publicApiError, withPublicApi } from '../../../utils/public/http'
import { toSafeRichText } from '../../../utils/public/sanitize'

export default defineEventHandler(async (event) => {
  const slug = (getRouterParam(event, 'slug') ?? '').trim()

  return withPublicApi(event, '律所详情加载失败，请稍后重试', async () => {
    if (!slug) {
      return publicApiError(event, 404, 'NOT_FOUND', '律所不存在或尚未公开')
    }

    const found = await findPublicFirmProfile(slug)
    if (!found) {
      return publicApiError(event, 404, 'NOT_FOUND', '律所不存在或尚未公开')
    }

    const cases = await findCasesForEntity('law_firm', found.id)
    return {
      data: {
        firm: {
          ...found.firm,
          intro: toSafeRichText(found.firm.intro),
        },
        cases,
      },
    }
  })
})
