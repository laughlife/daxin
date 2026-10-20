// 打包可部署产物：仓库源码 + 已构建的 web/.output → release/daxin-deploy-<时间戳>.zip
//
// 为什么需要这个脚本：此前的发布包是手工压缩的，规则只存在于操作者脑子里，
// 容易漏文件或误把密钥打进去。这里把规则固化成代码，可重复执行、可核对。
//
// 打包范围沿用上一版发布包（release/daxin-deploy-20261020-rebuilt.zip）的结构：
//   顶层：README.md、AGENTS.md、.gitignore、.nvmrc、api/、database/、docs/、tools/、web/
//   web/：源码 + .env.example + .output（含 Nitro 自带的 server/node_modules）
//
// 明确排除（安全与体积）：
//   - web/.env / 任何 .env（只保留 .env.example 模板）
//   - local-credentials/（测试账号密码）
//   - .git/、.idea/、.superpowers/、release/、tmp/、.tmp-check/
//   - web/node_modules、web/.nuxt、web/dist（构建缓存与静态产物）
//   - 根目录 tmp-*.log、uploaded-assets.json（工具副产物）
//
// 用法：
//   node tools/package-release.mjs            # 打包
//   node tools/package-release.mjs --list     # 只列出将打包的文件，不生成 zip
import { createWriteStream } from 'node:fs'
import { mkdir, readdir, stat } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

/*
 * archiver 只是 web 的开发依赖，没有装在仓库根目录，
 * 因此不能直接 `import('archiver')`（从 tools/ 解析不到），
 * 这里按绝对路径动态导入 web/node_modules 下的实例。
 */
const archiverEntry = join(ROOT, 'web', 'node_modules', 'archiver', 'index.js')
let archiver
try {
  archiver = (await import(pathToFileURL(archiverEntry).href)).default
} catch {
  console.error('未找到 archiver（web/node_modules）。请先执行：cd web && npm install')
  process.exit(1)
}

// 文件名用**本地时间**，方便运维与本地时钟对照（toISOString 是 UTC，会差 8 小时）
const now = new Date()
const pad = (n) => String(n).padStart(2, '0')
const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
const outFile = join(ROOT, 'release', `daxin-deploy-${stamp}.zip`)

/** 要打包的顶层条目。 */
const INCLUDE_ROOTS = [
  'README.md',
  'AGENTS.md',
  '.gitignore',
  '.nvmrc',
  'api',
  'database',
  'docs',
  'tools',
  'web',
]

/**
 * 排除规则：路径一律用「/」分隔的仓库相对路径匹配。
 *
 * 注意不能一刀切排除所有 node_modules ——
 * `web/.output/server/node_modules` 是 Nitro 构建产物的一部分，必须打进去；
 * 只有 `web/node_modules`（开发依赖）要排除。
 */
const EXCLUDED_PREFIXES = [
  '.git/',
  '.idea/',
  '.superpowers/',
  'release/',
  'tmp/',
  '.tmp-check/',
  'local-credentials/',
  'web/node_modules/',
  'web/.nuxt/',
  'web/dist/',
  // 构建期缓存
  'web/.output/cache/',
  'web/.output/analysis/',
  // Python 虚拟环境与字节码（mysql-mcp 的本地依赖，重装即可，占 60+MB）
  'tools/mysql-mcp/.venv/',
  'tools/mysql-mcp/__pycache__/',
]

/** 排除的具体文件名（任意层级）。 */
const EXCLUDED_NAMES = new Set([
  '.DS_Store',
  'Thumbs.db',
  'uploaded-assets.json',
])

/** 排除的后缀。 */
const EXCLUDED_SUFFIXES = ['.log', '.pyc']

/** 判断某个仓库相对路径是否应被排除。 */
function isExcluded(rel) {
  const p = rel.split(sep).join('/')
  if (EXCLUDED_PREFIXES.some((prefix) => p === prefix.slice(0, -1) || p.startsWith(prefix))) return true

  const name = p.split('/').pop() ?? ''

  // .env 只允许 .env.example 模板，任何真实 .env 一律排除
  if (name === '.env' || (name.startsWith('.env.') && name !== '.env.example')) return true
  if (EXCLUDED_NAMES.has(name)) return true
  if (EXCLUDED_SUFFIXES.some((suffix) => name.endsWith(suffix))) return true

  // 私钥类文件（防御性，正常仓库里没有）
  if (/\.(pem|key|p12|pfx)$/i.test(name)) return true

  return false
}

/** 递归收集要打包的文件（返回仓库相对路径列表）。 */
async function collect(target, acc = []) {
  const abs = join(ROOT, target)
  let info
  try {
    info = await stat(abs)
  } catch {
    console.warn(`  ! 跳过不存在的条目：${target}`)
    return acc
  }

  const rel = relative(ROOT, abs)
  if (isExcluded(rel)) return acc

  if (info.isDirectory()) {
    const entries = await readdir(abs, { withFileTypes: true })
    for (const entry of entries) {
      await collect(join(rel, entry.name), acc)
    }
    return acc
  }

  acc.push(rel)
  return acc
}

// ---------------------------------------------------------------- 前置检查

const required = join(ROOT, 'web', '.output', 'server', 'index.mjs')
try {
  await stat(required)
} catch {
  console.error('未找到 web/.output/server/index.mjs —— 请先构建：cd web && npm run build')
  process.exit(1)
}

// ---------------------------------------------------------------- 收集文件

console.log('收集待打包文件…')
const files = []
for (const root of INCLUDE_ROOTS) {
  await collect(root, files)
}

// ---------------------------------------------------------------- 安全自检

const forbidden = files.filter((rel) => {
  const p = rel.split(sep).join('/')
  return /(^|\/)\.env$/.test(p)
    || p.startsWith('local-credentials/')
    || /(^|\/)\.env\.(?!example)/.test(p)
})
if (forbidden.length > 0) {
  console.error('拒绝打包：检测到疑似敏感文件')
  for (const rel of forbidden.slice(0, 10)) console.error(`  ${rel}`)
  process.exit(1)
}

if (!files.some((rel) => rel.split(sep).join('/') === 'web/.output/server/index.mjs')) {
  console.error('拒绝打包：产物缺少 web/.output/server/index.mjs')
  process.exit(1)
}

const listOnly = process.argv.includes('--list')
console.log(`  共 ${files.length} 个文件`)
if (listOnly) {
  for (const rel of files.slice(0, 80)) console.log('   ', rel)
  if (files.length > 80) console.log(`    …（其余 ${files.length - 80} 个省略）`)
  process.exit(0)
}

// ---------------------------------------------------------------- 写 zip

const { mkdir: ensureDir } = await import('node:fs/promises')
await ensureDir(dirname(outFile), { recursive: true })

await new Promise((resolve, reject) => {
  const output = createWriteStream(outFile)
  // zlib level 9：发布包只在交付时生成一次，用最高压缩比换更小传输体积
  const archive = archiver('zip', { zlib: { level: 9 } })

  output.on('close', resolve)
  output.on('error', reject)
  archive.on('warning', (error) => {
    if (error.code === 'ENOENT') console.warn('  警告：', error.message)
    else reject(error)
  })
  archive.on('error', reject)

  archive.pipe(output)
  for (const rel of files) {
    archive.file(join(ROOT, rel), { name: rel.split(sep).join('/') })
  }
  void archive.finalize()
})

const { size } = await stat(outFile)
console.log('')
console.log('打包完成：')
console.log(`  文件：${outFile.replace(ROOT + sep, '')}`)
console.log(`  文件数：${files.length}`)
console.log(`  大小：${(size / 1024 / 1024).toFixed(1)} MB`)
console.log('')
console.log('部署提示：解压后执行')
console.log('  1) node tools/migrate-legacy/schema-check.mjs --apply   # 应用数据库迁移')
console.log('  2) cd web && npm ci --omit=dev                          # 安装运行时依赖（必做，见下）')
console.log('  3) 配置 web/.env（参考 web/.env.example）后：npm run preview  或 node --env-file=.env .output/server/index.mjs')
console.log('')
console.log('注意：第 2 步不可省略。mysql2 属于 package.json 的 dependencies，')
console.log('Nitro 将其保留为外部依赖而**不打包**进 .output，')
console.log('因此直接解压后运行 .output/server/index.mjs 会报「未安装 mysql2 依赖」。')
console.log('本脚本已实测：解压 → npm ci --omit=dev → 启动，首页/关于我们/案件/后台登录均 200。')
