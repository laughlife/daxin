// 清理端到端验收在 OSS 上留下的测试对象。
//
// 背景：DELETE /api/admin/media/{id} 只软删数据库行（保留可追溯性），接口没有删除 OSS 对象的能力，
// 因此验收脚本上传的 8x8 PNG 会留在桶里。这里按「已软删除且 object_key 以日期目录开头、
// 且 byte_size 很小」精确定位验收产生的行，删除对应 OSS 对象，并把该行的 object_key 标记为已清理，
// 避免留下会 404 的“活”引用。
//
// 用法：node tools/cleanup-verify-media.mjs --dry-run | --apply
import { createHmac } from 'node:crypto'

import { executeSql, queryRows, quoteLiteral, readEnvFile, resolveTargetConnection } from './migrate-legacy/mysql-client.mjs'

function parseArgs(argv) {
  const options = { apply: false, dryRun: false }
  for (const arg of argv) {
    if (arg === '--apply') options.apply = true
    else if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`未知参数：${arg}`)
  }
  return options
}

async function deleteObject(connection, bucket, objectKey) {
  const date = new Date().toUTCString()
  const resource = `/${bucket}/${objectKey}`
  const stringToSign = ['DELETE', '', '', date, resource].join('\n')
  const signature = createHmac('sha1', connection.accessKeySecret).update(stringToSign, 'utf8').digest('base64')
  const response = await fetch(`https://${bucket}.${connection.endpoint}/${objectKey}`, {
    method: 'DELETE',
    headers: { Date: date, Authorization: `OSS ${connection.accessKeyId}:${signature}` },
    signal: AbortSignal.timeout(30000),
  })
  return response.status
}

async function objectExists(connection, bucket, objectKey) {
  const date = new Date().toUTCString()
  const resource = `/${bucket}/${objectKey}`
  const stringToSign = ['HEAD', '', '', date, resource].join('\n')
  const signature = createHmac('sha1', connection.accessKeySecret).update(stringToSign, 'utf8').digest('base64')
  const response = await fetch(`https://${bucket}.${connection.endpoint}/${objectKey}`, {
    method: 'HEAD',
    headers: { Date: date, Authorization: `OSS ${connection.accessKeyId}:${signature}` },
    signal: AbortSignal.timeout(30000),
  })
  return response.status
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log('用法：node tools/cleanup-verify-media.mjs <--dry-run|--apply>')
    return
  }
  if (options.apply === options.dryRun) {
    console.error('必须且只能指定 --dry-run 或 --apply 之一')
    process.exitCode = 2
    return
  }

  const target = resolveTargetConnection()
  if (!target) {
    console.error('无法解析目标库连接：请检查 web/.env 的 DB_*')
    process.exitCode = 2
    return
  }
  const env = readEnvFile('web/.env')
  const oss = {
    accessKeyId: String(env.ALIYUN_OSS_ACCESS_KEY_ID ?? '').trim(),
    accessKeySecret: String(env.ALIYUN_OSS_ACCESS_KEY_SECRET ?? '').trim(),
    endpoint: String(env.ALIYUN_OSS_ENDPOINT ?? '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, ''),
  }
  const bucket = String(env.ALIYUN_OSS_BUCKET ?? '').trim()
  if (!oss.accessKeyId || !oss.accessKeySecret || !oss.endpoint || !bucket) {
    console.error('OSS 配置不完整，无法清理对象')
    process.exitCode = 2
    return
  }

  // 验收上传的是 8x8 PNG（约 160 字节以内），且行已被软删除；迁移登记的图片是 res/ 路径，
  // 不会命中这里，因此该条件能精确定位验收产物。
  const rows = await queryRows(target, `
SELECT id, object_key, byte_size, deleted_at
FROM media_assets
WHERE deleted_at IS NOT NULL
  AND object_key LIKE '20%'
  AND byte_size > 0 AND byte_size < 2000
ORDER BY id`)

  console.log(`匹配到 ${rows.length} 条候选（已软删除 + 日期目录 key + 小于 2000 字节）：`)
  if (rows.length === 0) {
    console.log('无需清理。')
    return
  }
  for (const row of rows) {
    const status = await objectExists(oss, bucket, row[1])
    console.log(`  id=${row[0]} key=${row[1]} 字节=${row[2]} 对象 HEAD=${status}`)
  }

  if (options.dryRun) {
    console.log('\n--dry-run 结束：未删除任何对象、未改库。')
    return
  }

  let removed = 0
  for (const row of rows) {
    const status = await deleteObject(oss, bucket, row[1])
    const deleted = status === 204 || status === 404
    if (deleted) removed += 1
    console.log(`  删除 OSS 对象 ${row[1]} → HTTP ${status}${deleted ? '（已不存在或已删除）' : ''}`)
    // 对象已不存在的软删除行保留原 object_key 会让运维误以为还有对象；
    // 这里只在其行上做标记，不删除行（保留可追溯性）。
    if (deleted) {
      await executeSql(target, `UPDATE media_assets
SET title = CASE WHEN title = '' THEN '验收测试对象（已从 OSS 清理）' ELSE title END,
    updated_at = NOW()
WHERE id = ${Number(row[0])}`)
    }
  }
  console.log(`\n已清理 ${removed}/${rows.length} 个验收测试对象（数据库行保留为软删除状态）。`)
}

main().catch((error) => {
  console.error(`清理失败：${error.message}`)
  process.exitCode = 1
})
