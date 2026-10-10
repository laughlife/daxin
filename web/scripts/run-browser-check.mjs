/**
 * 浏览器验收启动器：解析 Playwright 与浏览器可执行文件后运行 browser-check.mjs。
 *
 * 背景：Playwright 刻意不装进 web 项目依赖（体积大且与运行时不相关），而是独立安装在
 * D:\AppData\playwright。本脚本负责把「模块位置」和「浏览器可执行文件」两件事解析清楚：
 *
 *   1. PLAYWRIGHT_MODULE —— playwright-core 的入口 URL。默认从 PLAYWRIGHT_DIR
 *      （默认 D:\AppData\playwright）解析；未安装时给出中文修复指引。
 *   2. BROWSER_EXECUTABLE —— 浏览器可执行文件。优先复用本机已装的 Edge / Chrome，
 *      因此无需下载 Playwright 自带的浏览器（省约 150MB，也更快）。
 *
 * 可用环境变量覆盖：
 *   PLAYWRIGHT_DIR        Playwright 安装目录（默认 D:\AppData\playwright）
 *   PLAYWRIGHT_MODULE     直接指定模块入口（设置后忽略 PLAYWRIGHT_DIR）
 *   BROWSER_EXECUTABLE    直接指定浏览器可执行文件
 *   SMOKE_BASE_URL        被测服务地址
 */
import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { join, resolve } from 'node:path'

/** 本机常见浏览器位置；按顺序取第一个存在的。 */
const BROWSER_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
]

const DEFAULT_PLAYWRIGHT_DIR = 'D:\\AppData\\playwright'

/** 解析 playwright-core 的入口文件；返回绝对路径或空串。 */
function resolvePlaywrightModule(dir) {
  const candidates = [
    join(dir, 'node_modules', 'playwright-core', 'index.mjs'),
    join(dir, 'node_modules', 'playwright-core', 'index.js'),
  ]
  return candidates.find((path) => existsSync(path)) ?? ''
}

const playwrightDir = process.env.PLAYWRIGHT_DIR?.trim() || DEFAULT_PLAYWRIGHT_DIR

if (!process.env.PLAYWRIGHT_MODULE) {
  const entry = resolvePlaywrightModule(playwrightDir)
  if (!entry) {
    console.error('未找到 Playwright，浏览器验收无法运行。')
    console.error(`  查找位置：${playwrightDir}\\node_modules\\playwright-core`)
    console.error('  修复方式（任选其一）：')
    console.error(`    1) 安装到默认目录：mkdir ${playwrightDir} 后在该目录执行`)
    console.error('       npm init -y && npm install playwright-core')
    console.error('    2) 已有安装：设置 PLAYWRIGHT_DIR=<安装目录> 或 PLAYWRIGHT_MODULE=<入口文件 URL>')
    process.exit(2)
  }
  process.env.PLAYWRIGHT_MODULE = pathToFileURL(entry).href
}

if (!process.env.BROWSER_EXECUTABLE) {
  const browser = BROWSER_CANDIDATES.find((path) => existsSync(path))
  if (!browser) {
    console.error('未找到可用的 Edge / Chrome，请安装其一，或用 BROWSER_EXECUTABLE 指定路径。')
    process.exit(2)
  }
  process.env.BROWSER_EXECUTABLE = browser
}

console.log(`Playwright 模块：${process.env.PLAYWRIGHT_MODULE}`)
console.log(`浏览器可执行文件：${process.env.BROWSER_EXECUTABLE}`)
console.log(`被测服务：${process.env.SMOKE_BASE_URL || 'http://[::1]:3002'}`)
console.log('')

await import(pathToFileURL(resolve('scripts/browser-check.mjs')).href)
