// build/generate 的跨平台包装：在本机构建时放行生产环境的 root 数据库账号。
//
// 为什么需要它：nuxt build 与 nuxt generate 都会设置 NODE_ENV=production，
// 而服务端默认禁止生产环境使用 root。本地 web/.env 用的正是 root，
// 若不显式放行，预渲染会因该检查失败并把「数据库读取失败」烘焙进静态产物。
//
// 正式部署不要使用本脚本，也不要在部署平台设置 DAXIN_ALLOW_ROOT_DB；
// 请为部署环境配置独立的非 root 账号。
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const mode = process.argv[2]
if (mode !== 'build' && mode !== 'generate') {
  console.error('用法：node scripts/nuxt-build.mjs <build|generate>')
  process.exit(2)
}

const nuxtBin = fileURLToPath(new URL('../node_modules/nuxt/bin/nuxt.mjs', import.meta.url))
const child = spawn(process.execPath, [nuxtBin, mode], {
  stdio: 'inherit',
  env: { ...process.env, DAXIN_ALLOW_ROOT_DB: '1' },
})
child.on('exit', (code) => {
  process.exit(code ?? 1)
})
child.on('error', (error) => {
  console.error(`启动 nuxt ${mode} 失败：${error.message}`)
  process.exit(1)
})
