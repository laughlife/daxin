# 大信官网全栈改造交接说明

交接对象：DeepSeek
交接日期：2026-10-09（Asia/Shanghai）
工作区：`D:\WebstormProjects\daxin`
当前分支：`main`

## 当前进度

已完成并提交：

1. 已确认 Nuxt 全栈实施方向：页面由 Nuxt 服务端 API 读取新库 `daxin`；旧库只读解析，不覆盖原数据。
2. 已确认 OSS 使用 PostObject 表单直传，不使用 STS，也不使用 RAM Role ARN。服务端只生成短时 policy/signature，浏览器直传 OSS。
3. 已完成数据库连接边界（提交 `9544bfa`）：
   - `web/server/utils/db/config.ts`
   - `web/server/utils/db/pool.ts`
   - `web/server/utils/db/query.ts`
   - `web/scripts/db-config.test.mjs`
   - `web/types/mysql2-shim.d.ts`
   - `web/.env.example`
4. Task 1 测试通过：9/9；`npm run typecheck` 通过。
5. 既有页面改造已在此前提交中完成部分需求，包括推荐阅读更多文章入口、局域网预览和近三天模拟案件等，具体以 Git 历史与现有页面为准。
6. 本机 MySQL 数据目录位于 `C:\Environment\mysql-8.4.9\data`，其中能看到 `da`、`daxin`、`mysql` 等目录。当前 3306 已有 MySQL 进程监听。

未完成：

- Task 2：新库 DDL、索引和 schema-check。
- Task 3：旧库只读解析、迁移报告和人工核验项。
- Task 4：管理员登录、退出、Session、角色权限和登录限速。
- Task 5：OSS PostObject policy/signature 接口、媒体入库和 20MB 校验。
- Task 6：公共 API 与页面从 mock 切换到新库。
- Task 7：后台配置页面及媒体上传表单。
- Task 8：关于我们旧结构恢复、首页业务和页面细节收口。
- Task 9：端到端测试、浏览器验收和迁移报告。

## 必读文件

- 需求设计：[spec](../specs/2026-10-09-fullstack-admin-database-oss-design.md)
- 执行计划：[plan](../plans/2026-10-09-fullstack-admin-database-oss-plan.md)
- OSS 环境模板：[web/.env.example](../../web/.env.example)
- 本地 OSS/数据库真实配置：`web/.env`（已被 `.gitignore` 忽略，禁止复制到 Git、聊天或交接文档）
- MySQL MCP 说明：[tools/mysql-mcp/README.md](../../tools/mysql-mcp/README.md)
- MySQL MCP 服务：[tools/mysql-mcp/server.py](../../tools/mysql-mcp/server.py)
- 旧站源码：`C:\Users\1\Desktop\大信旧官网源码\网站源码`
- 旧站需求文档：`C:\Users\1\Desktop\大信旧官网源码\大信团队官网需求文档.2026.10.01pdf.pdf`
- 官网修改需求：`C:\Users\1\Desktop\大信旧官网源码\官网修改需求.pdf`

## 配置变量

`web/.env` 中需要存在以下变量。只检查是否有值，不要打印值：

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=
DB_PASSWORD=
DB_NAME=daxin
DB_CHARSET=utf8mb4
DB_POOL_SIZE=10

LEGACY_DB_HOST=127.0.0.1
LEGACY_DB_PORT=3306
LEGACY_DB_USER=
LEGACY_DB_PASSWORD=
LEGACY_DB_NAME=da
LEGACY_DB_CHARSET=utf8mb4
LEGACY_DB_POOL_SIZE=4

ALIYUN_OSS_REGION=
ALIYUN_OSS_BUCKET=
ALIYUN_OSS_ENDPOINT=
ALIYUN_OSS_ACCESS_KEY_ID=
ALIYUN_OSS_ACCESS_KEY_SECRET=
ALIYUN_OSS_PUBLIC_BASE_URL=
UPLOAD_MAX_BYTES=20971520
```

OSS AccessKey Secret 只允许服务端读取。前端只能得到 policy、signature、AccessKey ID、expire、host 和 object key。

## 数据库现状与安全边界

- MCP 是 Codex 的只读查询工具，不是 Nuxt 运行时驱动。Nuxt 服务端需要 Node MySQL 驱动；代码目前使用动态加载 `mysql2/promise`，部署环境需安装直接依赖 `mysql2`。
- 当前 `3306` 已监听，但沙箱内的命令行客户端连接可能返回 Windows `10013` 权限错误；请优先用 Navicat 或允许网络的终端验证。
- 不执行 `DROP DATABASE`、`RENAME DATABASE`、清空表或覆盖旧表。
- 先明确源库和目标库：需求约定源库为 `da`、目标库为 `daxin`；若当前实际数据仍在 `daxin`，必须停止写入并在迁移报告中记录，不要擅自把现有库当新库覆盖。
- 先在隔离数据库执行 DDL，再由用户确认后对目标库执行。旧库连接只能走 `queryLegacy`，它只接受 `SELECT`。

## 继续执行顺序

1. 先读取 plan/spec 和本交接文档，检查 `git status`。
2. 为 Task 2 写 schema-check 失败测试，创建可重复执行的 DDL，静态校验通过后再询问/确认隔离库执行结果。
3. 通过只读连接扫描旧库表结构和文章/图片字段，输出迁移报告；不覆盖旧库。
4. 完成管理员 Session 与角色权限，再实现 OSS PostObject policy 接口。
5. 接入 cases、articles、brands、law-firms、FAQ、media 等 API，服务端限制分页上限，避免 `999/3`、`4/3`。
6. 后台实现管理员登录、退出、基础权限、内容表单和图片直传；对象 key 使用北京时间 `YYYYMMDD/{uuid}.{ext}`，单文件最大 20MB。
7. 页面改为 API 数据：案件列表六列为“起诉时间、案件号、代理律所、原告、涉案品牌、侵权类型”；删除重复代理律所和状态列。
8. 关于我们恢复旧站结构，移除蓝色框“扫码领取 TRO 侵权大礼包”和已确认新版模块；首页第一块“TRO 全流程处理”跳成功案例，其他核心业务去除“了解详情”。
9. 每个小改动单独中文 Git commit；不 push、不 merge。完成前运行测试、typecheck、build、smoke 和浏览器验收。

## 当前已知阻塞

- 沙箱网络策略阻断了 `npm install mysql2`，自动审批也未能通过；不要绕过审批。部署或可联网环境安装 `mysql2` 后，再运行 `npm install`、typecheck 和数据库 API 验证。
- `C:\Environment\mysql-8.4.9\my.ini.bak` 中存在 `collation-server=utf8mb4 general ci` 的格式错误。当前监听实例已正常运行；如需重启，应先改为 `utf8mb4_general_ci`，并确认不会影响现有数据。

## 安全提醒

本文件不保存任何真实密码、AccessKey、AccessKey Secret、policy、签名或 Cookie。若真实凭据曾误写入可提交模板或被共享，应在继续上线前轮换对应凭据，并把新值只放在 `web/.env` 或部署平台的密钥配置中。
