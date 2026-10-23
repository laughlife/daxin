// 删除一次性的 OSS 探针对象，并把对应 media_assets 行标记软删除。
//
// 用途：verify-oss-mime-pinning.mjs 与端到端脚本会真实上传探针对象；
// 接口没有删除 OSS 对象的能力，因此需要本脚本收尾。
//
// 用法：node tools/remove-oss-object.mjs <objectKey>
import { executeSql, queryRows, quoteLiteral, resolveTargetConnection } from './migrate-legacy/mysql-client.mjs'
import { deleteObject, isOssConfigComplete, readOssConfig } from './migrate-legacy/oss-client.mjs'

const objectKey = String(process.argv[2] ?? '').trim()
if (!objectKey) {
  console.error('用法：node tools/remove-oss-object.mjs <objectKey>')
  process.exitCode = 2
} else {
  const config = readOssConfig()
  if (!isOssConfigComplete(config)) {
    console.error('OSS 配置不完整，无法删除对象')
    process.exitCode = 2
  } else {
    const response = await deleteObject(config, objectKey)
    console.log(`删除 OSS 对象 → HTTP ${response.status}${response.status === 204 || response.status === 404 ? '（已删除或本就不存在）' : ''}`)

    const target = resolveTargetConnection()
    if (target) {
      const rows = await queryRows(target, `SELECT id FROM media_assets WHERE object_key = ${quoteLiteral(objectKey)}`)
      if (rows.length === 0) {
        console.log('该对象未登记到 media_assets，无需改库')
      } else {
        for (const row of rows) {
          await executeSql(target, `UPDATE media_assets SET deleted_at = NOW(), updated_at = NOW() WHERE id = ${Number(row[0])}`)
          console.log(`已把 media_assets 行标记软删除：id=${row[0]}`)
        }
      }
    }
  }
}
