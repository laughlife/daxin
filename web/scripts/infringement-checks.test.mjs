import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migration = await readFile(new URL('../../database/migrations/019_product_infringement_checks.sql', import.meta.url), 'utf8').catch(() => '')
const schemaChecker = await readFile(new URL('../../tools/migrate-legacy/schema-check.mjs', import.meta.url), 'utf8')
const infringementParser = await import('../server/utils/public/infringement-check.ts').catch(() => null)
const publicApi = await readFile(new URL('../server/api/public/infringement-check.post.ts', import.meta.url), 'utf8').catch(() => '')
const publicPage = await readFile(new URL('../app/pages/infringement-check.vue', import.meta.url), 'utf8')
const legalPage = await readFile(new URL('../app/components/content/LegalPage.vue', import.meta.url), 'utf8')

test('产品侵权检测迁移创建独立记录表且结构校验器覆盖其表、索引和必填字段', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS\s+`?product_infringement_checks`?/i)
  for (const column of ['id', 'brand_name', 'product_name', 'contact_name', 'contact_method', 'remark', 'created_at']) {
    assert.match(migration, new RegExp(`\\b${column}\\b`, 'i'))
  }
  assert.match(migration, /ENGINE\s*=\s*InnoDB/i)
  assert.match(migration, /CHARSET\s*=\s*utf8mb4/i)
  assert.match(migration, /KEY\s+idx_product_infringement_checks_created\s*\(created_at,\s*id\)/i)
  assert.doesNotMatch(migration, /\b(DROP|TRUNCATE|DELETE)\b/i)

  assert.match(schemaChecker, /'product_infringement_checks'/)
  assert.match(schemaChecker, /name:\s*'idx_product_infringement_checks_created',\s*table:\s*'product_infringement_checks',\s*columns:\s*\['created_at',\s*'id'\]/)
  for (const column of ['brand_name', 'product_name', 'contact_name', 'contact_method']) {
    assert.match(schemaChecker, new RegExp(`['"]${column}['"]`))
  }
})

test('产品侵权检测字段解析会 trim 并按设计长度验证，空备注归一为 null', () => {
  assert.equal(typeof infringementParser?.parseInfringementCheckBody, 'function')
  const parse = infringementParser.parseInfringementCheckBody
  const valid = parse({ brand: '  品牌  ', product: ' 产品 ', contactName: ' 李先生 ', contactWay: ' wx-01 ', remark: ' ' })
  assert.deepEqual(valid, {
    ok: true,
    data: { brand: '品牌', product: '产品', contactName: '李先生', contactWay: 'wx-01', remark: null }
  })

  assert.equal(parse({ brand: ' ', product: '产品', contactName: '李先生', contactWay: 'wx-01' }).ok, false)
  assert.equal(parse({ brand: '品'.repeat(120), product: '产', contactName: '李', contactWay: 'wx' }).ok, true)
  assert.equal(parse({ brand: '品'.repeat(121), product: '产', contactName: '李', contactWay: 'wx' }).ok, false)
  assert.equal(parse({ brand: '品', product: '产'.repeat(161), contactName: '李', contactWay: 'wx' }).ok, false)
  assert.equal(parse({ brand: '品', product: '产', contactName: '李'.repeat(81), contactWay: 'wx' }).ok, false)
  assert.equal(parse({ brand: '品', product: '产', contactName: '李', contactWay: 'x'.repeat(121) }).ok, false)
  assert.equal(parse({ brand: '品', product: '产', contactName: '李', contactWay: 'wx', remark: 'a'.repeat(2001) }).ok, false)
  assert.equal(parse({ brand: '品', product: '产', contactName: '李', contactWay: 'wx', remark: 'a'.repeat(2000) }).ok, true)
})

test('公开提交接口绑定写入参数，不将提交内容带入响应或错误日志', () => {
  assert.match(publicApi, /parseInfringementCheckBody/)
  assert.match(publicApi, /INSERT INTO product_infringement_checks/)
  assert.match(publicApi, /\?/)
  assert.match(publicApi, /setResponseStatus\(event,\s*201\)/)
  assert.match(publicApi, /ok:\s*true/)
  assert.doesNotMatch(publicApi, /console\.(?:error|warn)\([^\n]*(?:error|body|contact|brand|product)/i)
  assert.doesNotMatch(publicApi, /return\s*\{[^}]*body\s*\}/s)
})

test('检测表单等待并展示真实提交结果，隐私页说明管理员处理提交信息', () => {
  assert.doesNotMatch(publicPage, /当前仅进行本地必填校验，不会提交或保存填写的信息。/)
  assert.doesNotMatch(publicPage, /不会发送或保存|未接入检测服务/)
  assert.match(publicPage, /\/api\/public\/infringement-check/)
  assert.match(publicPage, /loading|submitting|isSubmitting/i)
  assert.match(publicPage, /提交成功/)
  assert.match(publicPage, /errorMessage|submitError|failureMessage/i)
  assert.match(legalPage, /表单/)
  assert.match(legalPage, /数据库/)
  assert.match(legalPage, /管理员/)
  assert.doesNotMatch(legalPage, /不发送到后台，也不保存填写内容/)
})
