/**
 * 采集入库时的栏目自动分流。
 *
 * 用户确认的规则（2026-10-21）：
 *   - TRO侵权预警 与 TRO成功案例 分开：案件播报/雷区/被告名单 → 预警，胜诉/和解 → 成功案例
 *   - CPSC召回 能区分就分出来：标题含 CPSC / 召回 / recall → CPSC召回
 *   - 其他栏目（劳动纠纷、货代案例、科普干货）保持来源配置不动
 *
 * 判定顺序：CPSC 最先。召回类文章常同时提到「被告」「侵权」，
 * 若先判 TRO 会被抢走，所以要让它优先命中。
 *
 * 关于「排除词优先」：实测「冻结」会误捞和解案例（标题写「冻结金额10%，和解金仅5000」），
 * 所以 TRO 分流前先看是否属于胜诉/和解类，是则留在成功案例。
 */

/** CPSC 召回：英文缩写、中文「召回」、以及常见搭配 */
const CPSC_PATTERN = /CPSC|召回|RECALL/i

/** 预警播报的强信号 */
const ALERT_PATTERN = /预警|名单|合集|集锦|播报|速递|被冻|冻结|沦陷|中招|被告|被诉|雷/

/** 胜诉/和解类信号：出现这些说明是成功案例，不能被上面的「冻结」等词带走 */
const WIN_PATTERN = /胜诉|成功案例|拿回|驳回|免赔|0赔偿|零赔偿|和解|大信/

/**
 * @param {string} title 文章标题
 * @returns {'cpsc-recalls' | 'tro-alert' | null} 需要改投的栏目 slug；null 表示保持来源配置的栏目
 */
export function classifyImportedArticle(title) {
  const text = String(title ?? '')
  if (!text.trim()) return null
  if (CPSC_PATTERN.test(text)) return 'cpsc-recalls'
  if (WIN_PATTERN.test(text)) return null
  return ALERT_PATTERN.test(text) ? 'tro-alert' : null
}
