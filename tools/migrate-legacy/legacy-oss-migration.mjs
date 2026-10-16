import { createHash, createHmac } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readEnvFile } from './mysql-client.mjs'

const MIME_EXTENSIONS = Object.freeze({
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif',
  'image/avif': '.avif', 'image/bmp': '.bmp', 'image/tiff': '.tif',
})

export function extensionFromContentType(contentType) {
  const mime = String(contentType ?? '').split(';')[0].trim().toLowerCase()
  return MIME_EXTENSIONS[mime] ?? ''
}

export function mediaObjectKeyFor(sourceUrl, dateFolder = shanghaiDateFolder()) {
  const url = String(sourceUrl ?? '')
  const digest = createHash('sha256').update(url).digest('hex')
  const extension = extensionFromUrl(url) || '.img'
  return `Img/${dateFolder}/${digest}${extension}`
}

export function verifyMediaMap(paths, mediaMap) {
  return paths.filter((sourcePath) => !mediaMap[sourcePath]?.objectKey || !mediaMap[sourcePath]?.publicUrl)
}

function extensionFromUrl(url) {
  try {
    return MIME_EXTENSIONS[({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff' })[new URL(url).pathname.split('.').pop()?.toLowerCase()]] ?? ''
  } catch { return '' }
}

function shanghaiDateFolder() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  return parts.filter((part) => part.type !== 'literal').map((part) => part.value).join('')
}

async function readResponseLimited(response, maxBytes) {
  const declared = Number(response.headers.get('content-length') ?? 0)
  if (declared > maxBytes) throw new Error(`图片超过 20 MB：${declared} bytes`)
  const chunks = []
  let total = 0
  for await (const chunk of response.body) {
    total += chunk.length
    if (total > maxBytes) throw new Error('图片超过 20 MB')
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks, total)
}

async function putObject({ host, bucket, accessKeyId, accessKeySecret, objectKey, body, contentType }) {
  const date = new Date().toUTCString()
  const resource = `/${bucket}/${objectKey}`
  const stringToSign = ['PUT', '', contentType, date, resource].join('\n')
  const signature = createHmac('sha1', accessKeySecret).update(stringToSign).digest('base64')
  return fetch(`${host}/${objectKey}`, {
    method: 'PUT',
    headers: { Date: date, 'Content-Type': contentType, 'Content-Length': String(body.length), Authorization: `OSS ${accessKeyId}:${signature}` },
    body,
    signal: AbortSignal.timeout(120000),
  })
}

async function runPool(items, limit, worker) {
  const results = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: limit }, async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await worker(items[index], index)
    }
  }))
  return results
}

async function main() {
  const args = process.argv.slice(2)
  const get = (name, fallback = '') => {
    const index = args.indexOf(name)
    return index < 0 ? fallback : (args[index + 1] ?? fallback)
  }
  const reportPath = resolve(get('--report', 'tmp/dxfw-migration-dry-run.json'))
  const outPath = resolve(get('--out', 'tmp/dxfw-media-map.json'))
  await mkdir(dirname(outPath), { recursive: true })
  const concurrency = Math.max(1, Math.min(32, Number(get('--concurrency', '24')) || 24))
  const report = JSON.parse(await readFile(reportPath, 'utf8'))
  const paths = [...new Set((report.media ?? []).map((item) => String(item.sourcePath ?? '').trim()).filter(Boolean))]
  const env = readEnvFile('web/.env')
  const accessKeyId = String(env.ALIYUN_OSS_ACCESS_KEY_ID ?? '').trim()
  const accessKeySecret = String(env.ALIYUN_OSS_ACCESS_KEY_SECRET ?? '').trim()
  const endpoint = String(env.ALIYUN_OSS_ENDPOINT ?? '').trim().replace(/^https?:\/\//i, '').replace(/\/.*/, '')
  const bucket = String(env.ALIYUN_OSS_BUCKET ?? '').trim()
  const publicBase = String(env.ALIYUN_OSS_PUBLIC_BASE_URL ?? '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '') || `${bucket}.${endpoint}`
  if (!accessKeyId || !accessKeySecret || !endpoint || !bucket) throw new Error('OSS 配置不完整')
  const dateFolder = shanghaiDateFolder()
  let previous = {}
  try { previous = JSON.parse(await readFile(outPath, 'utf8')) } catch {}
  const map = previous.mediaMap ?? {}
  const failures = []
  let completed = Object.keys(map).length
  let newlyUploaded = 0
  const host = `https://${bucket}.${endpoint}`
  let checkpoint = Promise.resolve()
  const saveCheckpoint = () => {
    const snapshot = { generatedAt: new Date().toISOString(), dateFolder, total: paths.length, uploaded: completed, failures, mediaMap: map }
    checkpoint = checkpoint.then(() => writeFile(outPath, `${JSON.stringify(snapshot)}\n`, 'utf8'))
    return checkpoint
  }

  await runPool(paths, concurrency, async (sourceUrl, index) => {
    if (map[sourceUrl]?.objectKey && map[sourceUrl]?.publicUrl) return
    let lastError = ''
    const fetchUrls = [sourceUrl]
    try {
      const original = new URL(sourceUrl)
      if (original.hostname === 'daxin.qinianyun.com') fetchUrls.push(`https://daxinfawu.com${original.pathname}${original.search}`)
    } catch {}
    const referers = sourceUrl.includes('toutiao.com') ? ['', 'https://www.toutiao.com/'] : ['']
    for (const fetchUrl of [...new Set(fetchUrls)]) for (const referer of referers) {
      try {
        const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36' }
        if (referer) headers.Referer = referer
        const response = await fetch(fetchUrl, { headers, signal: AbortSignal.timeout(90000) })
        if (!response.ok) throw new Error(`源站 HTTP ${response.status}`)
        const contentType = String(response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
        const extension = MIME_EXTENSIONS[contentType]
        if (!extension) throw new Error(`源站响应不是受支持图片：${contentType || 'unknown'}`)
        const body = await readResponseLimited(response, 20 * 1024 * 1024)
        const objectKey = mediaObjectKeyFor(sourceUrl, dateFolder).replace(/\.[^.]+$/, extension)
        const uploaded = await putObject({ host, bucket, accessKeyId, accessKeySecret, objectKey, body, contentType })
        if (!uploaded.ok) throw new Error(`OSS HTTP ${uploaded.status}`)
        map[sourceUrl] = {
          objectKey,
          publicUrl: `https://${publicBase}/${objectKey}`,
          fileName: decodeURIComponent(new URL(sourceUrl).pathname.split('/').pop() || 'image'),
          mimeType: contentType,
          byteSize: body.length,
        }
        completed += 1
        newlyUploaded += 1
        if (newlyUploaded % 500 === 0 || completed === paths.length) {
          await saveCheckpoint()
          console.log(`图片迁移 ${completed}/${paths.length}`)
        }
        return
      } catch (error) {
        lastError = error.message
      }
    }
    failures.push({ sourceUrl, error: lastError })
    if (failures.length <= 10) console.error(`图片失败 ${index + 1}/${paths.length}: ${sourceUrl} (${lastError})`)
  })

  const output = { generatedAt: new Date().toISOString(), dateFolder, total: paths.length, uploaded: completed, failures, mediaMap: map }
  await mkdir(dirname(outPath), { recursive: true })
  await checkpoint
  await writeFile(outPath, `${JSON.stringify(output)}\n`, 'utf8')
  console.log(`结果写入 ${outPath}；完成 ${completed}，失败 ${failures.length}`)
  if (failures.length) process.exitCode = 1
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => { console.error(`OSS 图片迁移失败：${error.message}`); process.exitCode = 1 })
}
