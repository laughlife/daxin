import { createHmac } from 'node:crypto'
import type { OssConfig } from './config.ts'

/** 为 OSS DeleteObject 生成 V1 签名；只允许对桶内规范对象 key 发请求。 */
export function buildOssDeleteRequest(objectKey: string, config: Pick<OssConfig, 'bucket' | 'endpoint' | 'accessKeyId' | 'accessKeySecret'>, now = new Date()) {
  const key = String(objectKey ?? '').trim()
  if (!key || key.startsWith('/') || key.split('/').some(segment => !segment || segment === '.' || segment === '..') || /[\u0000-\u001F\\]/.test(key)) {
    throw new Error('OSS 对象路径无效，已停止删除')
  }
  const date = now.toUTCString()
  const stringToSign = `DELETE\n\n\n${date}\n/${config.bucket}/${key}`
  const signature = createHmac('sha1', config.accessKeySecret).update(stringToSign).digest('base64')
  const encodedKey = key.split('/').map(encodeURIComponent).join('/')
  return {
    url: `https://${config.bucket}.${config.endpoint}/${encodedKey}`,
    headers: {
      date,
      authorization: `OSS ${config.accessKeyId}:${signature}`,
    },
  }
}

/** 删除一个 OSS 对象；不存在视为已清理，其他错误向调用方报告。 */
export async function deleteOssObject(
  objectKey: string,
  config: Pick<OssConfig, 'bucket' | 'endpoint' | 'accessKeyId' | 'accessKeySecret'>,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const request = buildOssDeleteRequest(objectKey, config)
  const response = await fetcher(request.url, { method: 'DELETE', headers: request.headers, signal: AbortSignal.timeout(20000) })
  if (response.status === 404 || response.ok) return
  throw new Error(`OSS 正文图片删除失败（HTTP ${response.status}）`)
}
