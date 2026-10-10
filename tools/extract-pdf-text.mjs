// 从 PDF 中粗提取文本：解压 FlateDecode 流，抽取 Tj/TJ 里的字符串。
// 仅用于读取需求文档的关键条目，不做完整 PDF 解析。
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

const path = process.argv[2]
if (!path) {
  console.error('用法：node tools/extract-pdf-text.mjs <pdf> [关键词]')
  process.exit(2)
}
const keyword = process.argv[3] ?? ''

const buffer = readFileSync(path)
const texts = []

// 扫描所有 stream ... endstream
let index = 0
while (true) {
  const start = buffer.indexOf('stream', index)
  if (start === -1) break
  let dataStart = start + 'stream'.length
  if (buffer[dataStart] === 0x0d) dataStart += 1
  if (buffer[dataStart] === 0x0a) dataStart += 1
  const end = buffer.indexOf('endstream', dataStart)
  if (end === -1) break
  index = end + 'endstream'.length

  const raw = buffer.subarray(dataStart, end)
  let data = null
  try {
    data = inflateSync(raw)
  } catch {
    continue
  }
  const ascii = data.toString('latin1')
  // 只处理内容流
  if (!/(Tj|TJ)/.test(ascii)) continue

  // 逐个文本操作符抽取
  const pieces = []
  for (const match of ascii.matchAll(/\((?:\\.|[^\\()])*\)/g)) {
    const literal = match[0].slice(1, -1)
    pieces.push(literal)
  }
  if (pieces.length === 0) continue
  texts.push(pieces.join(''))
}

const joined = texts.join('\n')
// 把 PDF 的转义还原成可读字符
const cleaned = joined
  .replace(/\\([nrtbf()\\])/g, (_, ch) => ({ n: '\n', r: '\r', t: '\t', b: '', f: '', '(': '(', ')': ')', '\\': '\\' }[ch] ?? ch))
  .replace(/\\(\d{1,3})/g, (_, oct) => String.fromCharCode(Number.parseInt(oct, 8)))

console.log(`解析出 ${texts.length} 个内容流，文本长度 ${cleaned.length}`)
if (keyword) {
  const lines = cleaned.split(/[\n\r]+/)
  let shown = 0
  for (const line of lines) {
    if (line.includes(keyword)) {
      console.log('  ' + line.slice(0, 300))
      shown += 1
      if (shown >= 40) break
    }
  }
  console.log(`命中「${keyword}」的行数（最多显示 40）：${shown}`)
} else {
  console.log(cleaned.slice(0, 4000))
}
