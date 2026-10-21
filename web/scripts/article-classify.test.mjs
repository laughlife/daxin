import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { classifyImportedArticle } from '../server/utils/wechat-album/article-classify.mjs'

/**
 * 采集入库时的栏目自动分流（2026-10-21 用户确认）：
 *   CPSC召回 / TRO侵权预警 / TRO成功案例 三类分开，其他栏目保持来源配置。
 */
describe('classifyImportedArticle', () => {
  it('CPSC 召回优先命中（即使同时提到被告/侵权）', () => {
    assert.equal(classifyImportedArticle('CPSC宣布召回三款中国产儿童玩具，涉及被告品牌'), 'cpsc-recalls')
    assert.equal(classifyImportedArticle('美国消费品召回名单更新：这款灯具存在起火风险'), 'cpsc-recalls')
    assert.equal(classifyImportedArticle('Recall notice: 50万件产品因窒息风险被召回'), 'cpsc-recalls')
  })

  it('案件播报与雷区类进 TRO侵权预警', () => {
    assert.equal(
      classifyImportedArticle('TRO年末收割！铰链头装饰、全身发光镜越小众就越危险！卖家小心踩雷'),
      'tro-alert',
    )
    assert.equal(classifyImportedArticle('【12.24-12.31】2025末波TRO案例合集'), 'tro-alert')
  })

  it('胜诉与和解类不分流（排除词优先）', () => {
    assert.equal(classifyImportedArticle('TRO挽回几百万损失！和解金低至冻结金额10%，多轮博弈'), null)
    assert.equal(classifyImportedArticle('两起TRO被驳回，终于喘口气了！'), null)
    assert.equal(classifyImportedArticle('大信帮客户从荷兰公司手里拿回31万'), null)
  })

  it('没有特征的文章不分流', () => {
    assert.equal(classifyImportedArticle('美国发明专利侵不侵权，法院只看这2点'), null)
    assert.equal(classifyImportedArticle(''), null)
  })
})
