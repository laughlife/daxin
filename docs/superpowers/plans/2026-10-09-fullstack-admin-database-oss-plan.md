# Nuxt 全栈后台、结构化数据库与 OSS 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将新版官网从本地静态数据升级为由 `daxin` 数据库、Nuxt API、管理员后台和 OSS 媒体管理驱动的网站。

**Architecture:** 保留现有 Nuxt 4 + Vue 3 前端，启用 Nitro Node 服务端 API。旧库 `da` 只读解析，结构化数据写入新库 `daxin`；公开页面与后台通过同一套服务端仓储访问数据。图片由浏览器使用服务端签发的 RAM/STS 临时凭证直传 OSS，数据库只保存经过服务端校验的 OSS 元数据。

**Tech Stack:** Nuxt 4.5、Vue 3、TypeScript、Nitro server API、MySQL 8、参数化 SQL、Argon2id 或 bcrypt、阿里云 RAM/STS/OSS、Node test。

**Spec:** `docs/superpowers/specs/2026-10-09-fullstack-admin-database-oss-design.md`

## Global Constraints

- 源库只读，迁移脚本拒绝 DROP、TRUNCATE、DELETE、UPDATE、ALTER。
- 源库按约定为 `da`，新业务库为 `daxin`；执行前核对实际数据库名称，不自动重命名或删除。
- 首页仅第一块“**TRO 全流程处理**”跳转成功案例；其他首页核心业务不显示“了解详情”。
- 案件列表删除第二个“代理律所”和“状态”，字段顺序固定为起诉时间、案件号、代理律所、原告、涉案品牌、侵权类型。
- 关于我们按旧网站结构恢复，删除 TRO 大礼包扫码区域和需求文档标注的蓝色框内容，不保留当前确认的新版模块。
- OSS 单文件限制 20MB，对象路径为 `YYYYMMDD/{uuid}.{ext}`。
- AccessKey 和数据库密码只存在服务端环境变量或部署平台 Secret，不提交 Git，不使用 `NUXT_PUBLIC_*`。
- 每项独立改动执行测试并使用中文提交标题；不 push、不 merge。

## Review Focus

- 源库连接指向错误数据库：测试迁移 dry-run 的连接目标和零写入行为。
- 重复执行迁移：测试 `migration_batch_id` 和唯一键不会重复文章、图片或关系。
- 旧正文包含恶意 HTML/外链图片：测试服务端清洗和资源白名单。
- STS、OSS key 和文件大小不合法：测试过期凭证、越权前缀、非法 MIME、20MB 边界。
- 后台 Session 和权限失效：测试退出、过期、viewer/editor/admin 权限拒绝。

## 文件结构

- Create `database/migrations/*.sql`：版本化新库 DDL。
- Create `tools/migrate-legacy/*`：旧库只读解析、dry-run、导入和校验。
- Create `web/server/utils/db/*`：连接池、事务和仓储基础函数。
- Create `web/server/utils/auth/*`：密码、Session 和权限。
- Create `web/server/utils/oss/*`：RAM/STS 签发和 OSS key 校验。
- Create `web/server/api/public/*`：公开读取接口。
- Create `web/server/api/admin/*`：登录、配置、内容和媒体接口。
- Create `web/app/pages/admin/*`：后台登录和基础管理表单。
- Modify `web/app/repositories/*`：由本地 JSON 读取切换 API 读取。
- Modify `web/app/pages/about.vue`、首页业务和案件页面：按确认后的字段和旧网站结构重排。
- Create `web/.env.example`；Keep `web/.env` local-only and ignored。

### Task 1: 运行配置和数据库连接边界

**Files:**
- Create: `web/.env.example`
- Create: `web/server/utils/db/config.ts`
- Create: `web/server/utils/db/pool.ts`
- Create: `web/server/utils/db/query.ts`
- Modify: `web/package.json`
- Test: `web/scripts/db-config.test.mjs`

**Interfaces:**
- `getDbConfig(): { targetName: string; legacyName: string; ... }`
- `queryTarget<T>(sql: string, params: unknown[]): Promise<T[]>`
- `withTargetTransaction<T>(work): Promise<T>`
- `queryLegacy<T>(sql: string, params: unknown[]): Promise<T[]>` 只允许 SELECT。

- [ ] 写失败测试：缺失环境变量时报可读错误；legacy 查询拒绝写语句；target 查询必须参数化。
- [ ] 运行 `npm run test -- scripts/db-config.test.mjs` 验证测试先失败。
- [ ] 实现连接配置、连接池和只读源库检查；生产禁止 root 账号。
- [ ] 创建 `.env.example`，包含 `DB_*`、`LEGACY_DB_*`、`ALIYUN_OSS_*`、`UPLOAD_MAX_BYTES`。
- [ ] 运行测试和 `npm run typecheck`。
- [ ] Commit: `feat: 建立新旧数据库服务端连接边界`。

### Task 2: 新库 DDL 和可重复迁移版本

**Files:**
- Create: `database/migrations/001_initial_schema.sql`
- Create: `database/migrations/002_indexes_and_constraints.sql`
- Create: `tools/migrate-legacy/schema-check.mjs`
- Test: `tools/migrate-legacy/schema-check.test.mjs`

**Interfaces:**
- 表覆盖站点配置、媒体、业务、文章、案例、进展、品牌、律所、侵权类型、关系、迁移核验、管理员和审计日志。
- 所有主键使用 BIGINT/UUID 一致策略；外键和唯一约束固定在 DDL。

- [ ] 写 schema-check 测试：DDL 顺序、必需表、唯一键和 page 查询索引必须存在。
- [ ] 运行测试确认缺失 DDL 时失败。
- [ ] 编写事务安全、可重复执行的 migration SQL；不触碰源库。
- [ ] 在隔离测试库执行 DDL，检查表结构和索引。
- [ ] 运行 schema-check 和 MySQL 结构校验。
- [ ] Commit: `feat: 建立 daxin 结构化数据库表`。

### Task 3: 旧库只读解析、迁移和核验报告

**Files:**
- Create: `tools/migrate-legacy/parse-legacy.ts`
- Create: `tools/migrate-legacy/import-batch.ts`
- Create: `tools/migrate-legacy/verify-batch.ts`
- Create: `tools/migrate-legacy/review-items.ts`
- Create: `tools/migrate-legacy/legacy-migration.test.mjs`
- Create: `docs/migration-report-template.md`

**Interfaces:**
- `parseLegacyArticle(row): ParsedArticle`
- `extractCaseCandidates(title, content): CaseCandidate[]`
- `runDryRun(batchId): MigrationPreview`
- `importBatch(batchId): MigrationReport`
- `verifyBatch(batchId): VerificationReport`

- [ ] 写测试：旧文章多案件号、重复来源、缺失律所、危险 HTML 和图片路径都能进入正确结果或核验队列。
- [ ] 运行迁移测试确认先失败。
- [ ] 实现只读 SELECT、字段映射、HTML 清洗、图片资源关联和 `migration_review_items`。
- [ ] 先运行 dry-run，只生成报告，不写新库。
- [ ] 由用户确认 dry-run 报告后运行目标库导入；源库保持无写入。
- [ ] 验证文章、图片、案件、品牌、律所和关系数量，生成报告。
- [ ] Commit: `feat: 增加旧库只读解析与结构化迁移`。

### Task 4: 管理员登录、退出和基础权限

**Files:**
- Create: `web/server/utils/auth/password.ts`
- Create: `web/server/utils/auth/session.ts`
- Create: `web/server/utils/auth/permissions.ts`
- Create: `web/server/api/admin/login.post.ts`
- Create: `web/server/api/admin/logout.post.ts`
- Create: `web/server/api/admin/me.get.ts`
- Create: `web/app/pages/admin/login.vue`
- Create: `web/app/middleware/admin.ts`
- Test: `web/scripts/auth.test.mjs`

**Interfaces:**
- `verifyPassword(password, hash): Promise<boolean>`
- `createSession(userId, request): Promise<string>`
- `requirePermission(event, permission): Promise<AdminUser>`
- Roles: `admin` full access、`editor` 内容和媒体、`viewer` 只读。

- [ ] 写测试：登录成功、错误密码、退出、Session 过期、viewer 写操作拒绝。
- [ ] 运行测试确认先失败。
- [ ] 实现密码哈希、HttpOnly/SameSite Session、登录限速和审计日志。
- [ ] 实现后台登录页和当前用户接口。
- [ ] 通过一次性 CLI 或环境变量初始化首个管理员，不把密码写入仓库。
- [ ] 运行 auth 测试、typecheck 和浏览器登录验收。
- [ ] Commit: `feat: 增加管理员登录与基础权限`。

### Task 5: OSS STS 和媒体资源管理

**Files:**
- Create: `web/server/utils/oss/config.ts`
- Create: `web/server/utils/oss/sts.ts`
- Create: `web/server/utils/oss/validation.ts`
- Create: `web/server/api/admin/upload-policy.post.ts`
- Create: `web/server/api/admin/media.post.ts`
- Create: `web/app/composables/useOssUpload.ts`
- Test: `web/scripts/oss-upload.test.mjs`

**Interfaces:**
- `issueUploadPolicy(input, admin): Promise<UploadPolicy>`
- `validateUpload(input): void`
- `registerMedia(input, admin): Promise<MediaAsset>`
- `UploadPolicy` 必须包含临时 token、bucket、endpoint、key、expireAt、最大字节数和允许 MIME。

- [ ] 写测试：20MB 以下通过，超过 20MB、非法 MIME、错误日期 key、非授权目录和过期 policy 拒绝。
- [ ] 运行测试确认先失败。
- [ ] 实现 RAM Role/STS 签发、日期目录 key、UUID 文件名和服务端二次校验。
- [ ] 创建 `.env.example`；正式 AccessKey 只填写到 `web/.env` 或部署平台 Secret。
- [ ] 前端实现选择、上传进度、失败重试和完成登记。
- [ ] 使用测试 bucket 或本地 mock 完成上传验收；获得 OSS 参数后再做真实上传验收。
- [ ] Commit: `feat: 接入 OSS STS 图片直传和媒体登记`。

### Task 6: 公开 API 和页面仓储切换

**Files:**
- Create: `web/server/api/public/home.get.ts`
- Create: `web/server/api/public/articles.get.ts`
- Create: `web/server/api/public/cases.get.ts`
- Create: `web/server/api/public/cases/[id].get.ts`
- Create: `web/server/api/public/brands/[slug].get.ts`
- Create: `web/server/api/public/law-firms/[slug].get.ts`
- Create: `web/server/api/public/settings.get.ts`
- Modify: `web/app/repositories/*`
- Test: `web/scripts/public-api.test.mjs`

- [ ] 写 API 测试：关键词分页上限、案件字段顺序、品牌/律所关系、404 和空结果。
- [ ] 运行测试确认先失败。
- [ ] 实现参数化查询和统一 `ApiResult`；服务端隐藏内部迁移字段。
- [ ] 将首页、文章、案件、品牌、律所页面切换到 API 仓储。
- [ ] 移除前台旧站/旧库/演示来源提示。
- [ ] 运行 API、typecheck、static check 和浏览器页面验收。
- [ ] Commit: `feat: 将公开页面切换到新库 API`。

### Task 7: 后台配置表单和内容管理

**Files:**
- Create: `web/server/api/admin/settings.get.ts`
- Create: `web/server/api/admin/settings.put.ts`
- Create: `web/server/api/admin/services/*`
- Create: `web/server/api/admin/articles/*`
- Create: `web/server/api/admin/cases/*`
- Create: `web/server/api/admin/brands/*`
- Create: `web/server/api/admin/law-firms/*`
- Create: `web/app/pages/admin/index.vue`
- Create: `web/app/pages/admin/settings.vue`
- Create: `web/app/pages/admin/cases.vue`
- Create: `web/app/pages/admin/articles.vue`
- Create: `web/app/pages/admin/media.vue`
- Test: `web/scripts/admin-api.test.mjs`

- [ ] 写测试：editor 可编辑内容、viewer 只能读取、admin 可管理账号和设置，审计日志完整。
- [ ] 运行测试确认先失败。
- [ ] 实现站点 Logo、背景、首页右图、关于我们图片、业务板块、页脚和联系信息表单。
- [ ] 接入 `useOssUpload`，图片成功后写入 `media_assets` 和对应配置表。
- [ ] 实现文章、案例、品牌、律所的基础增删改查和发布状态。
- [ ] 运行 admin API 测试和后台浏览器验收。
- [ ] Commit: `feat: 增加后台配置与内容管理表单`。

### Task 8: 页面结构和需求文档还原

**Files:**
- Modify: `web/app/pages/index.vue`及首页业务组件
- Modify: `web/app/pages/about.vue`
- Modify: `web/app/pages/tro/cases/index.vue`
- Modify: `web/app/components/content/EntityDetail.vue`
- Modify: `web/app/components/layout/Footer.vue`
- Test: `web/scripts/requirements-ui.test.mjs`

- [ ] 写 UI 验收测试：TRO 全流程链接、案例四类各三条、案件六列、无状态列、无重复代理律所、关于我们无大礼包扫码区域。
- [ ] 运行测试确认先失败。
- [ ] 恢复旧网站关于我们结构，删除当前新版模块和蓝色框对应内容；图片改为后台配置。
- [ ] 调整首页业务卡片和成功案例入口；调整页脚竖排和可点击业务项。
- [ ] 调整案件查询字段、详情关联、品牌和律所跳转。
- [ ] 运行 typecheck、unit、static、generate 和浏览器验收。
- [ ] Commit: `fix: 按新版需求还原首页关于我们与案件页面`。

### Task 9: 端到端验收和交付文档

**Files:**
- Create: `docs/migration-report-YYYY-MM-DD.md`
- Modify: `README.md`
- Modify: `docs/progress.md`
- Test: `web/scripts/e2e-data-flow.test.mjs`

- [ ] 写端到端测试：管理员登录 → 配置图片 → OSS 登记 → 首页读取；迁移数据 → 案件查询 → 品牌/律所详情。
- [ ] 运行失败测试确认缺少完整链路。
- [ ] 运行 `npm run typecheck`、`npm test`、`npm run check:static`、`npm run generate` 和浏览器验收。
- [ ] 记录源库只读证明、迁移批次、数量校验、OSS 上传验证和回滚步骤。
- [ ] 更新启动、环境变量、后台初始化和生产部署文档。
- [ ] Commit: `docs: 完善全栈接入与迁移验收文档`。

