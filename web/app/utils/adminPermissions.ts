/**
 * 后台前端权限判定（纯函数）。
 *
 * 重要：这里**不是**鉴权权威。真正的权限校验始终在服务端
 * （`web/server/utils/auth/context.ts` 的 `requireAdmin` + 权限码）。
 * 本模块只负责让界面与服务端保持一致：只读角色进入写界面时，
 * 输入框与保存按钮必须禁用并给出中文说明，而不是等接口返回 403。
 *
 * 权限码与服务端对齐（见 docs/superpowers/task7-admin-contract.md 权限码表）：
 *   - `settings:read` / `settings:write` — admin、editor 可读写，viewer 只读；
 *   - `admin:user:read` / `admin:user:write` — 仅 admin。
 */

/** 可写站点配置的角色（与 settings:write 的授予范围一致） */
const SETTINGS_WRITE_ROLES: readonly string[] = ['admin', 'editor']

/** 可管理后台账号的角色（admin:user:write） */
const ADMIN_USER_WRITE_ROLES: readonly string[] = ['admin']

/**
 * 只读角色进入写界面时的统一说明文案。
 *
 * 命名与其他角色工具（`adminPermission.ts` 的 `READ_ONLY_NOTICE`）区分开，
 * 避免 Nuxt 自动导入同名导出时产生「重复导入」告警。
 */
export const SETTINGS_READ_ONLY_NOTICE = '当前账号为只读角色，无法保存修改'

/** 判断角色集合中是否含有任意一个目标角色 */
function hasAnyRole(roles: readonly string[] | undefined, allowed: readonly string[]): boolean {
  if (!Array.isArray(roles) || roles.length === 0) return false
  return roles.some(role => allowed.includes(role))
}

/**
 * 是否具备站点配置写入权限（settings:write）。
 * admin 与 editor 为 true，viewer（以及未知/空角色）为 false。
 */
export function canWriteSettings(roles: readonly string[] | undefined): boolean {
  return hasAnyRole(roles, SETTINGS_WRITE_ROLES)
}

/** 是否具备后台账号管理权限（admin:user:read / admin:user:write）。 */
export function canManageAdminUsers(roles: readonly string[] | undefined): boolean {
  return hasAnyRole(roles, ADMIN_USER_WRITE_ROLES)
}

/**
 * 为「新增行」生成不重复的 slug。
 *
 * 服务端 `normalizeServiceItem` 要求子项提供 id 或 slug（新增项还没有 id），
 * 且 slug 会作为 service_items 的唯一键参与 upsert；若留空则由服务端按数组下标
 * 兜底（`item-N`），同时新增多项就会互相覆盖。这里用「已用集合 + 计数器」
 * 保证一次提交内不重复；中文标题无法可靠音译，因此用 ASCII 前缀拼接序号，
 * 长度远小于服务端 64 字符上限。
 *
 * @param prefix 语义前缀，例如 `new-item`
 * @param used 已占用的 slug 集合（大小写不敏感比对）
 */
export function nextUniqueSlug(prefix: string, used: Iterable<string>): string {
  const taken = new Set<string>()
  for (const value of used) {
    if (typeof value === 'string' && value) taken.add(value.toLowerCase())
  }
  let index = 1
  let candidate = `${prefix}-${index}`
  while (taken.has(candidate.toLowerCase())) {
    index += 1
    candidate = `${prefix}-${index}`
  }
  return candidate
}
