# Task 7 后台配置与内容管理验收

验收时间：2026-10-09 / 2026-10-10
验收对象：后台配置与内容管理接口 + 后台页面

## 一、接口验收（真实账号 + 真实库）

`node tools/verify-admin-api.mjs` —— **33/33 通过**，覆盖：

- 8 类配置读数与真实种子一致：site 8、home 11、about 5、seo 2、services 4、footer 16、contact 5、qr 2
- 未知/缺失 kind 返回 400
- 配置保存可写回并读回，随后还原
- 内容列表：文章 288、案件 832、品牌 228、律所 95、媒体 3684、核验队列 34
- 列表不泄漏内部迁移字段（`legacy_*` / `migration_batch_id` / `verified_at`）
- 角色权限：viewer 对写操作一律 403；editor 有内容写权限但无账号管理权限

`node tools/check-review-resolution.mjs`（只读）证明核验项的 `applyValue` 回填存在歧义风险：
`case_sources` 的 `source_id → case_id` 是一对多，278 个来源中只有 55 个对应唯一案件
（最严重一个来源对应 14 个案件），19 条 case 待办项中 11 条可唯一解析、8 条歧义。
因此接口只在「恰好命中 1 个案件」时落库，命中 0 或多个返回 409 且不改动核验项状态。

`node tools/check-ip-types-admin.mjs` 证明侵权类型字典接口返回与库一致的
trademark/copyright/patent/unknown，匿名访问 401。

## 二、页面验收（生产构建）

`npm run build` 后 `npm run preview`，在 `http://[::1]:4211` 验收：

| 项目 | 结果 |
| --- | --- |
| 后台接口 | 33/33 通过 |
| smoke | 45/45 通过 |
| 九个后台页面（admin） | 9/9 渲染正常，无错误态 |
| viewer 只读 | 9/9 页面含只读提示，disabled 控件合计 748（admin 会话为 74） |
| 来源提示字样 | 公开页与后台页均无「旧站 / Mock / 演示数据 / 静态快照」 |

案件列表六列顺序为「起诉时间、案件号、代理律所、原告、涉案品牌、侵权类型」，
侵权类型经 `caseTypeLabel()` 渲染，未确认类型显示「待确认类型」。

## 三、部署注意事项（重要）

- **必须用 `npm run preview` 启动生产服务**。它由 Nuxt 负责加载 `web/.env`。
- **不要直接 `node .output/server/index.mjs`**：Node 不会自动读取 `.env`，这样启动的服务
  拿不到 `DB_*`，所有数据库查询会失败（登录返回 500、公开接口 500）。
  本次验收先踩到了这个坑：直接跑 `.output/server/index.mjs` 时后台登录 500、
  公开接口报「缺少数据库环境变量 DB_HOST」。
  如确实要直接跑，需显式带上环境文件：`node --env-file=.env .output/server/index.mjs`。
- 正式部署请在部署平台配置环境变量或使用密钥管理，不要提交 `.env`。

## 四、验收用本地账号

`local-credentials/{admin,viewer,editor}.txt`（已被 `.gitignore` 忽略，不会提交）。
这三个账号仅用于本地验收；**上线前应删除 viewer / editor 验收账号并更换 admin 口令**。
