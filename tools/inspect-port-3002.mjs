// 精确汇总 3002 端口的占用情况：监听进程、各自的地址族、启动时间、命令行。
// 用 Node 而不是 PowerShell，避免字符串比较与编码问题造成的误判。
import { execFileSync } from 'node:child_process'

function ps(script) {
  const out = execFileSync('pwsh', ['-NoProfile', '-Command', script], { encoding: 'utf8' })
  return out.trim()
}

// 1) 监听 3002 的连接
const listenersRaw = ps(`
  Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue |
    Select-Object LocalAddress, LocalPort, OwningProcess |
    ConvertTo-Json -Compress
`)
const listeners = listenersRaw ? JSON.parse(listenersRaw) : []
const list = Array.isArray(listeners) ? listeners : [listeners]

console.log(`=== 3002 监听项：${list.length} 个 ===\n`)

for (const item of list) {
  const pid = item.OwningProcess
  const infoRaw = ps(`
    $p = Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" -ErrorAction SilentlyContinue
    if ($p) {
      [PSCustomObject]@{
        pid = ${pid}
        name = $p.Name
        created = $p.CreationDate.ToString('yyyy-MM-dd HH:mm:ss')
        ppid = $p.ParentProcessId
        cmd = $p.CommandLine
      } | ConvertTo-Json -Compress
    }
  `)
  const info = infoRaw ? JSON.parse(infoRaw) : null
  console.log(`监听地址 ${item.LocalAddress}:${item.LocalPort}`)
  if (info) {
    console.log(`  pid=${info.pid}  ${info.name}`)
    console.log(`  启动于 ${info.created}`)
    console.log(`  命令行 ${info.cmd}`)
  } else {
    console.log(`  pid=${pid}（进程已退出）`)
  }
  console.log()
}

// 2) 逐个地址探测，看响应特征，判断是不是同一个服务
console.log('=== 各地址响应特征 ===\n')
const targets = [
  ['127.0.0.1', 'http://127.0.0.1:3002/'],
  ['[::1]', 'http://[::1]:3002/'],
  ['localhost', 'http://localhost:3002/'],
  ['192.168.100.242', 'http://192.168.100.242:3002/'],
]

for (const [label, url] of targets) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) })
    const html = await response.text()
    const hasVite = html.includes('/@vite/client')
    const hasDevtools = html.includes('nuxt-devtools')
    const components = (html.match(/components\/home\/[A-Za-z]+\.vue/g) ?? [])
    const uniqueComponents = [...new Set(components)].sort()
    console.log(`${label.padEnd(16)} HTTP ${response.status}  长度=${html.length}`)
    console.log(`  vite 客户端=${hasVite ? '有' : '无'}   devtools=${hasDevtools ? '有' : '无'}`)
    console.log(`  首页组件：${uniqueComponents.join(', ') || '(无)'}`)
    console.log()
  } catch (error) {
    console.log(`${label.padEnd(16)} 请求失败: ${error.message}\n`)
  }
}
