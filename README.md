# 大信法务官网

大信法务团队的新官网，与旧 PHPOK 网站（数据库 `da`）隔离。项目为 Nuxt 4 全栈应用（Vue 3 + TypeScript + Nitro 服务端 API），页面数据由服务端接口读取 MySQL 8 数据库 `daxin` 渲染，媒体图片存放在阿里云 OSS（浏览器 PostObject 表单直传），并提供 `/admin` 后台用于站点配置与内容维护。静态展示阶段使用的本地演示数据已不再作为页面数据来源。

## 当前功能与架构

| 层 | 说明 |
| --- | --- |
| 前台 | 首页、TRO 案件查询与详情、TRO 业务、国内业务、品牌库、常见问题、关于我们等，均由 Nitro API 读取数据库渲染；SQL 使用参数化查询 |
| 后台 `/admin` | 登录/退出、站点配置（site/home/about/SEO）、核心业务板块、页脚/联系方式/二维码、文章/案件/品牌/律所增删改查、核验队列、媒体库、账号管理 |
| 角色 | `admin`（全部权限）、`editor`（内容与媒体，不能管理账号）、`viewer`（只读，前端禁用写操作控件，服务端对写请求返回 403） |
| 数据库 | 目标库 MySQL 8 `daxin`（应用读写）；旧 PHPOK 库 `da` 仅供迁移脚本只读解析 |
| 媒体 | 服务端生成 OSS PostObject policy 与签名，浏览器直传 OSS 后由服务端登记 `media_assets`；AccessKey Secret 不下发前端 |
| 安全 | 口令使用 scrypt 哈希（存储串带算法前缀）；Session 令牌只以 SHA-256 存入数据库；Cookie 为 HttpOnly + SameSite=Lax；登录有失败次数限制 |

## 目录结构

| 路径 | 说明 |
| --- | --- |
| `web/` | Nuxt 4 应用：`app/` 前台页面与组件、`server/` Nitro API 与鉴权、`scripts/` 构建与检查脚本 |
| `database/migrations/` | 版本化 SQL 迁移文件（001–006） |
| `tools/` | 迁移、种子、验证与运维脚本；旧库迁移脚本在 `tools/migrate-legacy/` |
| `docs/` | 设计、计划、迁移报告与验收记录 |

## 环境要求

以 `web/package.json` 的 `engines` 为准：

- Node.js `^22.19.0 || ^24.11.0 || >=26.0.0`（仓库 `.nvmrc` 为 `22`）
- npm `>=10.0.0`

保持使用 npm 与已提交的 `web/package-lock.json`。

## 初始化与启动

以下命令在仓库根目录或 `web/` 执行时已注明。首次初始化按顺序操作：

1. 安装依赖（在 `web/`）：

   ```powershell
   cd web
   npm ci
   ```

2. 配置环境变量（回到仓库根目录）：复制 `web/.env.example` 为 `web/.env`，按注释填写数据库与 OSS 参数。

   ```powershell
   cd ..
   Copy-Item web/.env.example web/.env
   ```

3. 应用数据库迁移。首次在全新环境执行时，加上 `--create-database` 让脚本先创建空库
   （它只创建、不删除；不加该参数则要求 `daxin` 已存在）：

   ```powershell
   # 全新环境：先建空库再迁移
   node tools/migrate-legacy/schema-check.mjs --apply --create-database

   # 库已存在：只执行迁移
   node tools/migrate-legacy/schema-check.mjs --apply
   ```

   该命令执行 `database/migrations/*.sql` 并写入 `schema_migrations` 台账，可重复执行
   （第二次会跳过已应用的版本）。

4. 写入站点配置种子（可先 `--dry-run` 查看将写入的内容）：

   ```powershell
   node tools/seed-site-config.mjs --apply
   ```

5. 创建首个管理员账号（不交互提示，密码从环境变量、密码文件或标准输入读取；回到仓库根目录执行）：

   ```powershell
   # PowerShell：通过环境变量提供密码
   $env:DAXIN_ADMIN_PASSWORD = '<管理员密码>'
   node tools/create-admin.mjs --username admin
   # 也可用 DAXIN_ADMIN_PASSWORD_FILE 指向密码文件，或 --password-stdin 从标准输入读取
   ```

6. 启动开发服务（在 `web/`）：

   ```powershell
   npm run dev
   ```

   开发服务端口固定为 **3002**（见 `web/nuxt.config.ts` 的 `devServer.port`），
   也可用 `PORT` 环境变量覆盖；需要局域网访问时用 `npm run dev:lan`（3003）。
   访问地址用 `http://localhost:3002/`。

7. 启动生产服务（在 `web/`）：

   ```powershell
   npm run build
   npm run preview
   ```

> **重要：生产服务必须用 `npm run preview` 启动**，由 Nuxt 负责加载 `web/.env`。
> 直接运行 `node .output/server/index.mjs` 时 Node 不会读取 `.env`，服务拿不到 `DB_*`，
> 所有数据库查询都会失败（后台登录 500、公开接口 500）。确需直接运行时，
> 必须显式指定环境文件：`node --env-file=.env .output/server/index.mjs`。

> **本地构建说明**：`npm run build` 与 `npm run generate` 通过 `web/scripts/nuxt-build.mjs`
> 注入 `DAXIN_ALLOW_ROOT_DB=1`。原因是 `nuxt build` 会设置 `NODE_ENV=production`，
> 而数据库层默认禁止生产环境使用 `root` 账号。正式部署必须使用非 root 数据库账号，
> 且不得设置该变量。

## 环境变量

变量清单以 `web/.env.example` 为准，含义如下：

| 变量 | 含义 |
| --- | --- |
| `DB_HOST` / `DB_PORT` | 目标库 `daxin` 地址与端口 |
| `DB_USER` / `DB_PASSWORD` | 目标库账号（生产环境必须为非 root 账号） |
| `DB_NAME` | 目标库名，默认 `daxin` |
| `DB_CHARSET` | 目标库字符集，默认 `utf8mb4` |
| `DB_POOL_SIZE` | 目标库连接池大小 |
| `LEGACY_DB_HOST` / `LEGACY_DB_PORT` | 旧库 `da` 地址与端口（迁移阶段只读） |
| `LEGACY_DB_USER` / `LEGACY_DB_PASSWORD` | 旧库账号 |
| `LEGACY_DB_NAME` / `LEGACY_DB_CHARSET` / `LEGACY_DB_POOL_SIZE` | 旧库名与连接参数 |
| `ALIYUN_OSS_REGION` / `ALIYUN_OSS_BUCKET` | OSS 地域与 Bucket |
| `ALIYUN_OSS_ENDPOINT` | OSS 主机名，不带 `https://` 前缀、不含 Bucket |
| `ALIYUN_OSS_ACCESS_KEY_ID` | AccessKey ID |
| `ALIYUN_OSS_ACCESS_KEY_SECRET` | AccessKey Secret，**仅服务端使用** |
| `ALIYUN_OSS_PUBLIC_BASE_URL` | 图片公开访问根地址，可省略协议 |
| `UPLOAD_MAX_BYTES` | 单文件上传上限，默认 20971520（20 MiB） |

`web/.env` 已被 `.gitignore` 忽略，禁止提交，也不要发到聊天中。AccessKey Secret 只保存在服务端环境变量，不会进入前端、数据库或 Git；下发给浏览器的只有签名后的 policy、AccessKey ID 与过期时间。

## 数据库迁移与数据导入

迁移文件（`database/migrations/`）：

| 文件 | 内容 |
| --- | --- |
| `001_initial_schema.sql` | 新建 `daxin` 初始结构（站点配置、媒体、业务、内容、案例、管理员等 29 张业务表），只建表不写数据 |
| `002_indexes_and_constraints.sql` | 无法内联进建表语句的索引与结构自检视图，使用条件块保证可重放 |
| `003_backfill_derived_columns.sql` | 数据迁移：回填 `brands.case_count` / `law_firms.case_count`，并把侵权类型统一标为 `ip_types.unknown`（待确认类型） |
| `004_repair_duplicate_site_settings.sql` | 数据迁移：修复 `site_settings` 早期种子产生的重复行 |
| `005_fix_admin_role_permissions.sql` | 数据迁移：把 `admin_roles.permissions` 与代码权限矩阵对齐（实际鉴权以代码为准） |
| `006_reclassify_labor_articles.sql` | 数据迁移：把旧库「干货知识」栏目下 9 篇劳动法主题文章改归 `labor-case` 分类 |

迁移只作用于目标库 `daxin`，不接触旧库。2026-10-09 迁移批次 `20261009-01` 写入的数据量：文章 288、案件 832、品牌 228、律所 95、媒体资源 3684（已全部上传 OSS 并回填 `public_url`）；配置表（`site_settings` 等）由 `tools/seed-site-config.mjs` 写入。

旧库数据导入：

```powershell
# 1. 先生成 dry-run 报告（只读旧库，不写目标库）
node tools/migrate-legacy/legacy-migrate.mjs --dry-run

# 2. 确认后再导入（需先有 dry-run 报告）
node tools/migrate-legacy/legacy-migrate.mjs --import --batch <batch_key>
```

旧库 `da` 全程只读：`tools/migrate-legacy/legacy-source.mjs` 只使用 `SELECT`，`--import` 前会拒绝目标库与源库同名的配置。导入通过唯一键与 `migration_batch_id` 保证可重复执行不产生重复数据，结果与回滚步骤见 `docs/migration-report-2026-10-09.md`。

## 运维脚本

顶层 `tools/*.mjs`：

| 脚本 | 用途 |
| --- | --- |
| `create-admin.mjs` | 创建或更新管理员账号（密码取自标准输入或环境变量） |
| `seed-site-config.mjs` | 把站点文案、业务板块、页脚与联系渠道写入数据库（`--dry-run` / `--apply`） |
| `backfill-legacy-media.mjs` | 把旧站被引用的图片上传 OSS 并回填 `media_assets.public_url`、改写正文图片地址 |
| `verify-oss-upload.mjs` | OSS 直传端到端验收（签发 policy → 直传 → HEAD 校验登记） |
| `diagnose-oss-credentials.mjs` | OSS 凭据直连诊断，区分签名错误与密钥无效 |
| `verify-admin-api.mjs` | 后台接口端到端验收（配置、内容、核验队列与角色权限） |
| `verify-admin-config-pages.mjs` | 后台配置页（settings / services / footer）端到端检查 |
| `check-public-api.mjs` | 公开接口抽查：确认数据来自真实库且不泄漏内部字段 |
| `check-backfill.mjs` | 图片回填结果只读统计与公网抽样 |
| `check-admin-tables.mjs` | 后台相关数据库表现状核对 |
| `check-review-sql.mjs` | 只读核查核验队列接口实际下发的 SQL |
| `check-review-resolution.mjs` | 只读核查核验项能否唯一解析到案件（歧义判定） |
| `check-site-settings-state.mjs` | 只读核对每个 `site_settings` key 只保留一行当前版本 |
| `check-ip-types-admin.mjs` | 只读核对侵权类型字典接口与后台渲染 |
| `check-about-config.mjs` | 只读核对关于我们配置与页脚可点击性 |
| `cleanup-verify-artifacts.mjs` | 清理验收过程产生的临时数据 |
| `extract-pdf-text.mjs` | 从需求 PDF 粗提取文本（辅助读取需求条目） |

`tools/migrate-legacy/`：

| 脚本 | 用途 |
| --- | --- |
| `schema-check.mjs` | 迁移文件静态校验、真实库结构核对与迁移执行器（`--apply`） |
| `legacy-migrate.mjs` | 旧库迁移 CLI：`--dry-run` 生成报告，`--import` 写入目标库 |
| `legacy-source.mjs` | 旧库只读读取器（仅 `SELECT`） |
| `legacy-parser.mjs` | 旧库文章纯函数解析：清洗正文、抽取字段与图片引用 |
| `legacy-import.mjs` | 把 dry-run 解析结果幂等写入目标库 |
| `probe-legacy.mjs` | 旧库只读探查，统计正文特征 |
| `mysql-client.mjs` | 迁移工具共用的只读 MySQL 客户端与 `web/.env` 读取 |

另有 `legacy-migration.test.mjs`、`schema-check.test.mjs` 两个测试文件，由 `npm run test` 执行。

## 验证与测试

在 `web/` 执行：

```powershell
npm run typecheck     # nuxt typecheck
npm run test          # node --test，含 web/scripts/*.test.mjs 与 tools/migrate-legacy/*.test.mjs
npm run build         # 生产构建，产出 SSR 服务
npm run generate      # 静态生成，产物在 web/.output/public
npm run smoke         # 路由 Smoke 检查，需运行中的服务
npm run check:static  # 内部链接与资源完整性检查，需运行中的服务
npm run check:browser # 浏览器验收（Playwright），需运行中的服务
```

> **`build` 与 `generate` 都写 `.output/`，且 `generate` 会覆盖 `build` 的产物。**
> `build` 产出 SSR 服务（`.output/server/index.mjs`），`generate` 产出纯静态文件
> （Nitro preset=static）。在 `generate` 之后跑 `npm run preview`，起的是静态文件服务，
> 只有预渲染页面存在，案件/文章/品牌等按需 SSR 路由会全部 404。
> 需要完整站点时请执行 `npm run build && npm run preview`。
> `check:static` 会检测产物形态，遇到静态产物会直接说明原因并以退出码 2 结束，避免误判为坏链。

`smoke`、`check:static` 与 `check:browser` 需要一个运行中的服务，默认 `http://[::1]:3002`，可用 `SMOKE_BASE_URL` 覆盖。
默认值用 `[::1]` 而不是 `127.0.0.1`：Nuxt 开发服务只绑定 IPv6 的 localhost，
用 `127.0.0.1` 会连接失败。
注意开发服务器只绑定 IPv6 localhost，因此地址应写 `http://[::1]:<端口>` 而不是 `127.0.0.1`。

数据库与后台相关的验证脚本（在仓库根目录执行，需要已配置 `web/.env` 且服务已启动）：`tools/verify-admin-api.mjs`、`tools/verify-admin-config-pages.mjs`、`tools/verify-oss-upload.mjs`、`tools/check-public-api.mjs`、`tools/check-backfill.mjs`、`tools/check-review-resolution.mjs`、`tools/check-ip-types-admin.mjs` 等。

`npm run check:browser` 是浏览器验收（Playwright，实测 44 项通过）。它通过
`web/scripts/run-browser-check.mjs` 启动，该启动器会自动解析 Playwright 模块与浏览器：

- Playwright 独立安装在 `D:\AppData\playwright`（`playwright-core`，不进入 web 项目依赖）。
  换机器时可用 `PLAYWRIGHT_DIR` 指向其他安装目录，或用 `PLAYWRIGHT_MODULE` 直接指定模块入口。
- 浏览器复用本机已安装的 Edge / Chrome（实测 Edge 154、Chrome 155 均可驱动），
  因此**无需下载 Playwright 自带浏览器**（省约 150MB）。也可用 `BROWSER_EXECUTABLE` 指定。
- 需要运行中的服务：`SMOKE_BASE_URL=http://[::1]:4411 npm run check:browser`。

首次在新机器安装 Playwright：

```powershell
mkdir D:\AppData\playwright
cd D:\AppData\playwright
npm init -y
npm install playwright-core
```


## 已知限制与待办

- 「劳动法案例」与「货代案例」栏目当前没有已发布内容：旧库对应来源文章的正文为空，导入时被标记为 `draft`（见 `tools/migrate-legacy/legacy-import.mjs` 的 `status = hasContent ? 'published' : 'draft'`），需补充正文后再发布。
- 832 个案件的侵权类型当前均显示「待确认类型」：旧库正文没有侵权类型字段，不能据此推导，已统一标记 `ip_types.unknown`，需在后台核验队列逐条确认。
- 关于我们页面的团队/活动图片与宣讲图片仍需通过后台上传（种子中图片类配置刻意留空）。
- 首页「核心业务」区块仍读取前端静态配置 `web/app/config/businessContent.ts`，尚未改为读取数据库 `service_sections`。
- 密码哈希使用 scrypt 而非设计文档要求的 Argon2id：当前环境没有可用的原生依赖，故先用 Node 内置 scrypt；存储串带算法前缀（`scrypt$...`），将来可平滑升级。
- 迁移遗留的 34 项人工核验、19 个低置信案件号、30 个重复案件号归属仍需在后台逐条确认。

## 相关文档

- 交付清单：`docs/delivery-checklist.md`（上线前核对项、部署步骤、验收命令与实测结果）
- 设计规格：`docs/superpowers/specs/2026-10-09-fullstack-admin-database-oss-design.md`
- 补全计划：`docs/静态展示补全计划.md`
- 迁移核验报告：`docs/migration-report-2026-10-09.md`
- 后台验收记录：`docs/task7-acceptance.md`
- 实施进度：`docs/progress.md`
- 旧库文章与新栏目对应：`docs/legacy-article-mapping.md`
