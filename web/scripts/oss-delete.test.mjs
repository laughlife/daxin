import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { test } from 'node:test'
import { buildOssDeleteRequest, deleteOssObject } from '../server/utils/oss/delete.ts'

const config = {
  bucket: 'dxfw-oss',
  endpoint: 'oss-cn-shenzhen.aliyuncs.com',
  accessKeyId: 'test-key',
  accessKeySecret: 'test-secret',
}

test('OSS 删除签名限定在当前 bucket 的对象 key，并编码 URL 路径', () => {
  const now = new Date('2026-10-20T04:00:00.000Z')
  const request = buildOssDeleteRequest('Img/20261020/正文图 1.png', config, now)
  const expected = createHmac('sha1', config.accessKeySecret)
    .update(`DELETE\n\n\n${now.toUTCString()}\n/${config.bucket}/Img/20261020/正文图 1.png`)
    .digest('base64')
  assert.equal(request.url, 'https://dxfw-oss.oss-cn-shenzhen.aliyuncs.com/Img/20261020/%E6%AD%A3%E6%96%87%E5%9B%BE%201.png')
  assert.equal(request.headers.authorization, `OSS ${config.accessKeyId}:${expected}`)
  for (const key of ['', '/root.png', '../secret.png', 'Img/../secret.png', 'Img\\secret.png']) {
    assert.throws(() => buildOssDeleteRequest(key, config), /对象路径无效/)
  }
})

test('OSS 对象已不存在时视为清理完成，其余删除错误会停止处理', async () => {
  await deleteOssObject('20261020/example.png', config, async () => new Response(null, { status: 404 }))
  await assert.rejects(
    deleteOssObject('20261020/example.png', config, async () => new Response(null, { status: 403 })),
    /HTTP 403/,
  )
})
