/**
 * TRO 栏目自动分流：把「案件播报 / 雷区 / 被告名单」这类文章归到 TRO侵权预警，
 * 其余（胜诉、和解成功、大信帮客户拿回损失）留在 TRO成功案例。
 *
 * 背景（2026-10-21 用户确认）：
 *   tro-success 里绝大多数其实是预警播报，而 TRO侵权预警 却是 0 篇。
 *   用户要求「增量任务里也加上这个判断来分类，暂时只分预警和成功案例，其他按之前的对应不动」。
 *
 * 判定顺序很重要：排除词优先。
 * 实测「冻结」会误捞和解案例（标题写「冻结金额10%，和解金仅5000」），
 * 所以先看是否属于胜诉/和解类，是则不分流。
 */

/** 预警播报的强信号 */
const ALERT_PATTERN = /预警|名单|合集|集锦|播报|速递|被冻|冻结|沦陷|中招|被告|被诉|雷/

/** 胜诉/和解类信号：出现这些说明是成功案例，不能被上面的「冻结」等词带走 */
const WIN_PATTERN = /胜诉|成功案例|拿回|驳回|免赔|0赔偿|零赔偿|和解|大信/

/**
 * 只处理「原来会落到 tro-success」的文章。
 * @param {string} title 文章标题
 * @returns {'tro-alert' | null} 返回 'tro-alert' 表示应改投 TRO侵权预警；null 表示保持来源配置的栏目
 */
export function classifyTroArticleSlug(title) {
  const text = String(title ?? '')
  if (!text.trim()) return null
  if (WIN_PATTERN.test(text)) return null
  return ALERT_PATTERN.test(text) ? 'tro-alert' : null
}
