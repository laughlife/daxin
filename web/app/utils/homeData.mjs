export const DEFAULT_CORE_ADVANTAGES = Object.freeze([
  {
    title: '专业团队',
    description: 'TRO业务是法律业务，请认准律师事务所资质，我们汇聚了近30名中美知名的资深专业律师，联合为您护航。',
    highlights: ['30'],
  },
  {
    title: '经验丰富',
    description: '深耕美国TRO诉讼领域8年，处理过上万起TRO侵权案，精准把握案件复杂性，为您提供高效、最低和解金的处理方案。',
    highlights: ['8年', '上万起TRO'],
  },
  {
    title: '低支高效',
    description: '在同等TRO案情下，我们能够成功将和解金额降至最低，且多个应诉案件实现0赔偿。',
    highlights: [],
  },
  {
    title: '无果免酬',
    description: '零费用启动，和解成功，按约定收费，和解不成功，您无需支付任何费用。',
    highlights: [],
  },
])

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function flag(value, fallback = 1) {
  return value === false || value === 0 || value === '0' ? 0 : (value === true || value === 1 || value === '1' ? 1 : fallback)
}

export function normalizeTeamServices(value) {
  if (!Array.isArray(value)) return []
  return value
    .filter(section => section && flag(section.status) === 1)
    .map(section => ({
      slug: text(section.slug),
      title: text(section.title),
      description: text(section.description ?? section.summary),
      iconKey: text(section.iconKey ?? section.icon_key),
      imageUrl: text(section.imageUrl ?? section.image_url),
      items: Array.isArray(section.items)
        ? section.items
            .filter(item => item && flag(item.status) === 1)
            .map(item => ({ title: text(item.title), description: text(item.description ?? item.summary) }))
            .filter(item => item.title)
        : [],
    }))
    .filter(section => section.slug && section.title && section.items.length > 0)
}

export function normalizeCoreAdvantages(value) {
  let parsed = value
  if (typeof value === 'string') {
    try {
      parsed = value ? JSON.parse(value) : null
    } catch {
      return DEFAULT_CORE_ADVANTAGES.map(item => ({ ...item, highlights: [...item.highlights] }))
    }
  }
  if (!Array.isArray(parsed)) {
    return DEFAULT_CORE_ADVANTAGES.map(item => ({ ...item, highlights: [...item.highlights] }))
  }
  const items = parsed.map(entry => ({
    title: text(entry?.title),
    description: text(entry?.description),
    highlights: Array.isArray(entry?.highlights) ? entry.highlights.map(text).filter(Boolean) : [],
  })).filter(item => item.title && item.description)
  return items.length ? items : DEFAULT_CORE_ADVANTAGES.map(item => ({ ...item, highlights: [...item.highlights] }))
}
