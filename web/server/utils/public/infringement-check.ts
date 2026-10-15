export type InfringementCheckField = 'brand' | 'product' | 'contactName' | 'contactWay' | 'remark'

export interface InfringementCheckInput {
  brand: string
  product: string
  contactName: string
  contactWay: string
  remark: string | null
}

export type InfringementCheckParseResult =
  | { ok: true, data: InfringementCheckInput }
  | { ok: false, field: InfringementCheckField, message: string }

const FIELD_RULES: Array<{
  key: InfringementCheckField
  label: string
  maxLength: number
  required: boolean
}> = [
  { key: 'brand', label: '品牌名称', maxLength: 120, required: true },
  { key: 'product', label: '产品名称', maxLength: 160, required: true },
  { key: 'contactName', label: '联系人', maxLength: 80, required: true },
  { key: 'contactWay', label: '电话或微信', maxLength: 120, required: true },
  { key: 'remark', label: '备注', maxLength: 2000, required: false },
]

function characterLength(value: string): number {
  return Array.from(value).length
}

/** 服务端表单解析器：只接受对象与字符串字段，并统一去首尾空白、校验长度。 */
export function parseInfringementCheckBody(input: unknown): InfringementCheckParseResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, field: 'brand', message: '请检查填写信息' }
  }

  const source = input as Record<string, unknown>
  const normalized: Partial<Record<InfringementCheckField, string | null>> = {}

  for (const rule of FIELD_RULES) {
    const raw = source[rule.key]
    if (raw === undefined || raw === null) {
      normalized[rule.key] = rule.required ? '' : null
    } else if (typeof raw !== 'string') {
      return { ok: false, field: rule.key, message: `${rule.label}格式不正确` }
    } else {
      normalized[rule.key] = raw.trim()
    }

    const value = normalized[rule.key] ?? ''
    if (rule.required && !value) {
      return { ok: false, field: rule.key, message: `请填写${rule.label}` }
    }
    if (characterLength(value) > rule.maxLength) {
      return { ok: false, field: rule.key, message: `${rule.label}不能超过${rule.maxLength}个字符` }
    }
  }

  return {
    ok: true,
    data: {
      brand: normalized.brand as string,
      product: normalized.product as string,
      contactName: normalized.contactName as string,
      contactWay: normalized.contactWay as string,
      remark: normalized.remark || null,
    },
  }
}
