// OSS 凭据直连诊断。
//
// 目的：把“代码签名错误”和“AccessKey 本身无效”区分开。
// 做法：绕开本项目代码，直接用阿里云 OSS Signature V1 规则向 OSS 发一次
// ListObjects 请求。若凭据有效，返回 200 与对象列表；若密钥错误，返回
// SignatureDoesNotMatch；若密钥有效但无权限，返回 AccessDenied。
//
// 只读取 web/.env；不打印密钥、不打印签名。
import { createHmac } from 'node:crypto'

import { readEnvFile } from './migrate-legacy/mysql-client.mjs'

function buildSignatureV1({ method, bucket, endpoint, date, contentMd5 = '', contentType = '', canonicalResource }) {
  const stringToSign = [method, contentMd5, contentType, date, canonicalResource].join('\n')
  return { stringToSign }
}

const env = readEnvFile('web/.env')
const bucket = String(env.ALIYUN_OSS_BUCKET ?? '').trim()
const endpoint = String(env.ALIYUN_OSS_ENDPOINT ?? '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '')
const accessKeyId = String(env.ALIYUN_OSS_ACCESS_KEY_ID ?? '').trim()
const accessKeySecret = String(env.ALIYUN_OSS_ACCESS_KEY_SECRET ?? '').trim()

if (!bucket || !endpoint || !accessKeyId || !accessKeySecret) {
  console.error('缺少 OSS 配置，无法诊断')
  process.exit(2)
}

const host = `${bucket}.${endpoint}`
const date = new Date().toUTCString()
const canonicalResource = `/${bucket}/`
const { stringToSign } = buildSignatureV1({ method: 'GET', bucket, endpoint, date, canonicalResource })
const signature = createHmac('sha1', accessKeySecret).update(stringToSign, 'utf8').digest('base64')

const url = `https://${host}/`
console.log(`直连诊断：GET https://${host}/（ListObjects，Signature V1）`)
console.log(`凭据：AccessKeyId 长度 ${accessKeyId.length}，Secret 长度 ${accessKeySecret.length}`)

let response
try {
  response = await fetch(url, {
    method: 'GET',
    headers: { Date: date, Authorization: `OSS ${accessKeyId}:${signature}` },
    signal: AbortSignal.timeout(20000),
  })
} catch (error) {
  console.log(`网络失败：${error.name} ${error.message}`)
  process.exit(1)
}

const body = await response.text()
console.log(`HTTP ${response.status}`)
console.log(`x-oss-request-id: ${response.headers.get('x-oss-request-id') ?? '(无)'}`)

if (response.status === 200) {
  const keys = [...body.matchAll(/<Key>([^<]*)<\/Key>/g)].map((match) => match[1])
  console.log(`结论：凭据有效且有列举权限。桶内对象数（本页）=${keys.length}`)
  for (const key of keys.slice(0, 5)) console.log(`  示例对象：${key}`)
} else {
  const code = (/<Code>([^<]*)<\/Code>/.exec(body) ?? [])[1] ?? ''
  const message = (/<Message>([^<]*)<\/Message>/.exec(body) ?? [])[1] ?? ''
  console.log(`错误码：${code}`)
  console.log(`错误信息：${message}`)
  if (code === 'SignatureDoesNotMatch') {
    console.log('结论：AccessKey Secret 无效（密钥本身错误，与项目代码无关）')
  } else if (code === 'AccessDenied') {
    console.log('结论：AccessKey 有效但没有该操作的权限')
  } else if (code === 'InvalidAccessKeyId') {
    console.log('结论：AccessKeyId 不存在于阿里云账号下')
  } else if (code === 'SecondLevelDomainForbidden') {
    console.log('结论：该 region 的 endpoint 不支持虚拟主机形式访问')
  } else {
    console.log('结论：需要人工判断（详见上方错误码）')
  }
}
