function appliesToAgent(agent, userAgent) {
  const normalized = agent.trim().toLowerCase()
  return normalized === '*' || userAgent.toLowerCase().includes(normalized)
}

function escapeRegex(value) {
  return value.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
}

function ruleRegex(path) {
  const anchored = path.endsWith('$')
  const source = anchored ? path.slice(0, -1) : path
  return new RegExp(`^${source.split('*').map(escapeRegex).join('.*')}${anchored ? '$' : ''}`)
}

/** Parse the applicable robots.txt groups for a crawler user-agent. */
export function parseWechatRobots(text, userAgent) {
  let groupAgents = []
  let hasDirective = false
  const rules = []
  let crawlDelayMs = 0
  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const line = rawLine.split('#', 1)[0]?.trim() ?? ''
    const colon = line.indexOf(':')
    if (!line || colon < 0) continue
    const key = line.slice(0, colon).trim().toLowerCase()
    const value = line.slice(colon + 1).trim()
    if (key === 'user-agent') {
      if (hasDirective) {
        groupAgents = []
        hasDirective = false
      }
      groupAgents.push(value)
      continue
    }
    const applies = groupAgents.some((agent) => appliesToAgent(agent, userAgent))
    if (!applies) continue
    if (key === 'allow' || key === 'disallow') {
      hasDirective = true
      if (value) rules.push({ allow: key === 'allow', path: value, regex: ruleRegex(value), specificity: value.replace(/[\*$]/g, '').length })
    } else if (key === 'crawl-delay') {
      hasDirective = true
      const seconds = Number(value)
      if (Number.isFinite(seconds) && seconds > 0) crawlDelayMs = Math.max(crawlDelayMs, Math.min(seconds * 1000, 60000))
    }
  }
  return { rules, crawlDelayMs }
}

export function isWechatRobotsAllowed(policy, value) {
  const url = new URL(value)
  const path = `${url.pathname}${url.search}`
  const matches = policy.rules.filter((rule) => rule.regex.test(path))
  if (!matches.length) return true
  const specificity = Math.max(...matches.map((rule) => rule.specificity))
  return matches.filter((rule) => rule.specificity === specificity).some((rule) => rule.allow)
}
