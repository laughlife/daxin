// 从 PDF 中提取内嵌图片（用于阅读以图片形式给出的需求文档）。
//
// 背景：需求文档 PDF 没有任何可提取的文本流，说明正文是截图，因此必须把内嵌图片导出来看。
//
// 关键点：**不能用 `endobj` 去界定 stream 的结束**。
// 初版实现按 `<</...>> ... stream ... endobj` 匹配，结果把二进制图片里偶然出现的
// `endobj` 当成了流结束，导出的一律是截断的垃圾数据（文件头是 "en"、结尾是 CRLF）。
// 正确做法是读取流字典里的 `/Length`（可能是间接引用 `N 0 R`），按长度精确截取。
//
// 用法：node tools/extract-pdf-images.mjs <pdf> <输出目录>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { inflateSync } from 'node:zlib'

const pdfPath = process.argv[2]
const outDir = process.argv[3] ?? 'pdf-images'
if (!pdfPath) {
  console.error('用法：node tools/extract-pdf-images.mjs <pdf> [输出目录]')
  process.exit(2)
}
mkdirSync(outDir, { recursive: true })

const buffer = readFileSync(pdfPath)
// 用 latin1 做索引查找（一字节一字符，偏移量与原始字节一致）
const latin1 = buffer.toString('latin1')

/** 解析 `N 0 obj` 的所有位置，便于处理 /Length 的间接引用。 */
const objectOffsets = new Map()
for (const match of latin1.matchAll(/(\d+)\s+0\s+obj\b/g)) {
  objectOffsets.set(Number(match[1]), match.index)
}

/** 取某个对象号的原始片段（从 obj 到下一个 endobj 之前，仅用于读字典，不用于切流）。 */
function objectSlice(objectNumber) {
  const start = objectOffsets.get(objectNumber)
  if (start === undefined) return null
  return latin1.slice(start, start + 4096)
}

/** 解析 /Length，支持直接数字与 `N 0 R` 间接引用。 */
function resolveLength(dictionary, objectNumber) {
  const direct = /\/Length\s+(\d+)(?!\s+0\s+R)/.exec(dictionary)
  if (direct) return Number(direct[1])
  const indirect = /\/Length\s+(\d+)\s+0\s+R/.exec(dictionary)
  if (!indirect) return null
  const lengthObject = objectSlice(Number(indirect[1]))
  if (!lengthObject) return null
  // 该对象形如 "27 0 obj\n60360\nendobj"
  const value = /obj\s*(\d+)/.exec(lengthObject.slice(lengthObject.indexOf('obj')))
  return value ? Number(value[1]) : null
}

const images = []
for (const [objectNumber, start] of objectOffsets) {
  const header = latin1.slice(start, start + 2048)
  if (!/\/Subtype\s*\/Image/.test(header)) continue

  const dictEnd = header.indexOf('>>')
  if (dictEnd === -1) continue
  const dictionary = header.slice(0, dictEnd)

  const streamKeyword = latin1.indexOf('stream', start + dictEnd)
  if (streamKeyword === -1) continue

  let dataStart = streamKeyword + 'stream'.length
  // stream 关键字后必须是 CRLF 或 LF
  if (latin1[dataStart] === '\r') dataStart += 1
  if (latin1[dataStart] === '\n') dataStart += 1

  const declaredLength = resolveLength(dictionary, objectNumber)
  let data
  if (declaredLength !== null) {
    data = buffer.subarray(dataStart, dataStart + declaredLength)
  } else {
    // 没写 /Length 时退回按 endstream 截取
    const end = latin1.indexOf('endstream', dataStart)
    data = buffer.subarray(dataStart, end === -1 ? undefined : end)
  }

  images.push({
    objectNumber,
    width: Number(/\/Width\s+(\d+)/.exec(dictionary)?.[1] ?? 0),
    height: Number(/\/Height\s+(\d+)/.exec(dictionary)?.[1] ?? 0),
    filter: /\/Filter\s*\/(\w+)/.exec(dictionary)?.[1] ?? '',
    colorSpace: /\/ColorSpace\s*\/(\w+)/.exec(dictionary)?.[1] ?? '',
    bits: Number(/\/BitsPerComponent\s+(\d+)/.exec(dictionary)?.[1] ?? 0),
    data,
  })
}

console.log(`找到 ${images.length} 张内嵌图片`)

const report = []
let jpegIndex = 0
for (const image of images) {
  const { objectNumber, width, height, filter, colorSpace, bits, data } = image

  // DCTDecode 的内嵌图片本身就是完整 JPEG，直接落盘即可
  if (filter === 'DCTDecode') {
    // 校验 JPEG 边界，避免再次导出坏文件
    const hasSoi = data[0] === 0xff && data[1] === 0xd8
    const hasEoi = data[data.length - 2] === 0xff && data[data.length - 1] === 0xd9
    jpegIndex += 1
    const name = `${String(jpegIndex).padStart(2, '0')}_obj${objectNumber}_${width}x${height}${hasSoi && hasEoi ? '' : '_BROKEN'}.jpg`
    writeFileSync(join(outDir, name), data)
    report.push({ name, width, height, filter, colorSpace, bits, bytes: data.length, valid: hasSoi && hasEoi })
    continue
  }

  const expected = width * height * (bits / 8) * (colorSpace === 'DeviceRGB' ? 3 : 1)
  const isBitmap = filter === 'FlateDecode' && bits === 8 && data.length >= expected * 0.5
  const name = `obj${objectNumber}_${width}x${height}.${isBitmap ? 'ppm' : 'bin'}`
  if (isBitmap && colorSpace === 'DeviceRGB') {
    writeFileSync(join(outDir, name), Buffer.concat([Buffer.from(`P6\n${width} ${height}\n255\n`, 'ascii'), data.subarray(0, width * height * 3)]))
  } else if (isBitmap && colorSpace === 'DeviceGray') {
    writeFileSync(join(outDir, name), Buffer.concat([Buffer.from(`P5\n${width} ${height}\n255\n`, 'ascii'), data.subarray(0, width * height)]))
  } else {
    writeFileSync(join(outDir, name), data)
  }
  report.push({ name, width, height, filter, colorSpace, bits, bytes: data.length, valid: isBitmap })
}

report.sort((a, b) => b.width * b.height - a.width * a.height)
console.log('\n导出结果（按像素面积）：')
for (const item of report) {
  console.log(`  ${item.name.padEnd(32)} ${String(item.width).padStart(5)}x${String(item.height).padEnd(5)} ${item.colorSpace.padEnd(10)} ${item.filter.padEnd(12)} ${String(item.bytes).padStart(9)}字节 ${item.valid ? '有效' : '⚠ 无效'}`)
}
writeFileSync(join(outDir, 'index.json'), JSON.stringify(report, null, 2))
