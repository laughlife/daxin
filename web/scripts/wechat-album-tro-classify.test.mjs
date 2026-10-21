import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { classifyTroArticleSlug } from '../server/utils/wechat-album/tro-classify.mjs'

/**
 * TRO 栏目自动分流（2026-10-21 用户确认）：
 * 增量导入时把「案件播报 / 雷区 / 被告名单」类文章送进 TRO侵权预警，
 * 胜诉/和解类留在 TRO成功案例，其余保持来源配置的栏目。
 */
describe('classifyTroArticleSlug', () => {
  it('案件播报与雷区类进 TRO侵权预警', () => {
    assert.equal(
      classifyTroArticleSlug('TRO年末收割！铰链头装饰、全身发光镜越小众就越危险！卖家小心踩雷'),
      'tro-alert',
    )
    assert.equal(
      classifyTroArticleSlug('跨境卖家又“出事了”！727家店铺全被冻！仅1张麋鹿插画也没逃过'),
      'tro-alert',
    )
    assert.equal(classifyTroArticleSlug('【12.24-12.31】2025末波TRO案例合集'), 'tro-alert')
  })

  it('胜诉与和解类留在原栏目（排除词优先）', () => {
    // 标题里有「冻结」，但同时是和解成功案例，不能被分流
    assert.equal(classifyTroArticleSlug('TRO挽回几百万损失！和解金低至冻结金额10%，多轮博弈'), null)
    assert.equal(classifyTroArticleSlug('两起TRO被驳回，终于喘口气了！'), null)
    assert.equal(classifyTroArticleSlug('大信帮客户从荷兰公司手里拿回31万'), null)
  })

  it('没有预警特征的文章不分流', () => {
    assert.equal(classifyTroArticleSlug('美国发明专利侵不侵权，法院只看这2点'), null)
    assert.equal(classifyTroArticleSlug(''), null)
  })
})
