import { readBody, setResponseStatus } from 'h3'
import { queryTarget } from '../../utils/db/query'
import { parseInfringementCheckBody } from '../../utils/public/infringement-check'

export default defineEventHandler(async (event) => {
  let body: unknown
  try {
    body = await readBody(event)
  } catch {
    body = null
  }

  const parsed = parseInfringementCheckBody(body)
  if (!parsed.ok) {
    setResponseStatus(event, 400)
    return { error: { code: 'INVALID_INPUT', field: parsed.field, message: parsed.message } }
  }

  try {
    const { brand, product, contactName, contactWay, remark } = parsed.data
    await queryTarget(
      `INSERT INTO product_infringement_checks
  (brand_name, product_name, contact_name, contact_method, remark)
VALUES (?, ?, ?, ?, ?)`,
      [brand, product, contactName, contactWay, remark],
    )
    setResponseStatus(event, 201)
    return { ok: true }
  } catch {
    // 不记录异常对象或提交字段，避免把联系方式写入服务器日志。
    console.error('[public-infringement-check] 提交写入失败')
    setResponseStatus(event, 500)
    return { error: { code: 'SUBMISSION_FAILED', message: '提交失败，请稍后重试' } }
  }
})
