import type { NavItem } from '../types/site'

export interface FooterServiceRecord {
  itemKey: string
  title: string
  linkPath: string
}

export interface FooterServiceGroup {
  title: string
  items: Array<NavItem & { itemKey: string }>
}

const legacyTitles: Record<string, string[]> = {
  'TRO 和解应诉': ['TRO应诉和解'],
  'CPSC 召回': ['CPSC召回'],
  '商标/版权/专利申请': ['商标/版权/专利申请注册'],
  '劳动人事管理': ['劳动争议'],
}

/** 按需求文档的固定分组与顺序显示，并沿用后台旧项目的链接。 */
export function groupFooterServices(
  configured: readonly FooterServiceRecord[],
  groups: readonly { title: string; items: readonly NavItem[] }[],
): FooterServiceGroup[] {
  return groups.map(group => ({
    title: group.title,
    items: group.items.map(fallback => {
      const title = fallback.label
      const match = configured.find(item => [title, ...(legacyTitles[title] ?? [])].includes(item.title))
      return {
        itemKey: match?.itemKey ?? title,
        label: title,
        to: match?.linkPath || fallback.to,
      }
    }),
  }))
}
