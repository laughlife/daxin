# 交付清单

> 用途：把本项目交接给运维或后续开发者时，逐项核对「已交付什么、环境怎么配、上线前必须做什么、还剩什么」。
> 配套文档：`README.md`（架构与启动）、`docs/task7-acceptance.md`（后台与生产启动注意事项）、
> `docs/migration-report-2026-10-09.md`（迁移核验与端到端验收）。

## 1. 交付范围

| 项目 | 内容 |
| --- | --- |
| 前台站点 | Nuxt 4 SSR 站点：首页、TRO 案件查询、内容栏目（侵权预警/成功案例/科普干货/热点资讯）、品牌库、律所、常见问题、关于我们、隐私与免责声明 |
| 后台 | `/admin`：登录、站点/首页/关于/SEO 配置、核心业务、页脚与联系方式、文章/案例/品牌/律所增删改查、核验队列、媒体库 |
| 数据库 | MySQL 8 业务库 `daxin`（29 张业务表 + `schema_migrations` 台账） |
| 媒体 | 阿里云 OSS PostObject 浏览器直传，数据库仅保存校验通过的元数据 |
| 迁移 | 旧 PHPOK 库 `da` 只读解析导入 `daxin`，含核验队列 |
| 工程化 | 迁移工具、验收脚本、类型检查、单元测试、Smoke、静态/SSR 检查、浏览器验收、端到端验收 |

## 2. 环境要求

| 组件 | 版本 | 备注 |
| --- | --- | --- |
| Node.js | `^22.19.0 \|\| ^24.11.0 \|\| >=26.0.0` | 见 `web/package.json` engines |
| npm | `>=10.0.0` | 保持与已提交的 `package-lock.json` 一致 |
| MySQL | 8.x | 需能创建 `daxin` 库 |
| 浏览器 | Edge 或 Chrome | 浏览器验收复用本机浏览器，无需下载 Playwright 自带浏览器 |
| Playwright | `playwright-core` | 已装在 `D:\AppData\playwright`；换机见第 6 节 |

## 3. 已交付的数据现状

| 数据 | 数量 | 说明 |
| --- | --- | --- |
| 文章 `articles` | 288 | 迁移批次 `20261009-01`；其中 15 篇因旧库无正文标为 `draft` |
| 案件 `cases` | 832 | |
| 品牌 `brands` | 228 | |
| 律所 `law_firms` | 95 | |
| 媒体 `media_assets` | 3684 可用 + 2 条验收软删除 | 3684 张旧站图片已全部上传 OSS 并回填 `public_url` |
| 待核验项 `migration_review_items` | 34 | 15 条文章空正文、13 条案件原告、6 条立案日期 |
| 站点配置 | `site_settings` 等由 `tools/seed-site-config.mjs` 写入 | 含 about 组 16 键、页脚 9 个业务项 |

说明：`media_assets` 里 id=3687、3688 是 Task 9 端到端验收自动创建的探针行，已软删除，
对应 OSS 对象也已用 `tools/cleanup-verify-media.mjs` 删除。保留行是为了可追溯。

## 4. 上线前必做（核对项）

- [ ] **删除验收账号**：数据库中的 `viewer`、`editor` 仅用于本地验收，请删除。
- [ ] **更换 admin 口令**：本地口令在 `local-credentials/`（已 gitignore，未提交）；上线请重新初始化。
- [ ] **配置生产环境变量**：按 `web/.env.example` 填写 `DB_*`、`ALIYUN_OSS_*`。
      生产数据库账号**不要用 root**（`web/server/utils/db/config.ts` 在 `NODE_ENV=production` 下会拒绝 root）。
- [ ] **不要把 `web/.env` 提交进 Git**；OSS AccessKey Secret 只存在于服务端环境变量或部署平台 Secret。
- [ ] **确认生产启动方式**：必须用 `npm run preview`（由 Nuxt 加载 `web/.env`）。
      直接 `node .output/server/index.mjs` 不会读 `.env`，服务拿不到 `DB_*`，后台登录与公开接口会 500。
      如确需直接运行，用 `node --env-file=.env .output/server/index.mjs`。
- [ ] **构建产物别搞混**：`npm run build` 产出 SSR 服务；`npm run generate` 产出纯静态文件**且会覆盖前者**。
      静态产物下按需 SSR 路由会全部 404，需要完整站点时执行 `npm run build && npm run preview`。
- [ ] **不要设置 `DAXIN_ALLOW_ROOT_DB=1`**：该变量仅用于本地构建绕过 root 检查。
- [ ] **确认 OSS 跨域与权限**：bucket 需允许站点域名 POST 直传；建议用最小权限子账号。
- [ ] **补充内容**：关于我们图片、企业宣讲图片需在后台「站点设置」上传后才会显示。

## 5. 部署步骤

部署脚本分两部分：`npm` 命令在 `web/` 下执行，其余 Node 工具在**仓库根目录**执行。
下面已标注每步的工作目录，可逐段复制执行。

```powershell
# ---------- 在 web/ 下执行 ----------
cd web

# 1. 安装依赖
npm ci

# 2. 配置环境变量（把 .env.example 复制为 .env 后填写 DB_* 与 ALIYUN_OSS_*）
Copy-Item .env.example .env

# ---------- 回到仓库根目录执行 ----------
cd ..

# 3. 应用数据库迁移（全新环境用 --create-database 先建空库；库已存在则去掉该参数）
node tools/migrate-legacy/schema-check.mjs --apply --create-database

# 4. 导入旧库数据（如需重建）：先 dry-run 生成报告，再按批次导入
node tools/migrate-legacy/legacy-migrate.mjs --dry-run
node tools/migrate-legacy/legacy-migrate.mjs --import --batch 20261009-01

# 5. 写入站点配置初始数据（幂等，可重复执行）
node tools/seed-site-config.mjs --apply

# 6. 创建管理员账号（密码不写入仓库）
#    来源优先级：--password-stdin > DAXIN_ADMIN_PASSWORD > DAXIN_ADMIN_PASSWORD_FILE
$env:DAXIN_ADMIN_PASSWORD = '<管理员密码>'
node tools/create-admin.mjs
Remove-Item Env:\DAXIN_ADMIN_PASSWORD

# ---------- 再次进入 web/ 执行 ----------
cd web

# 7. 构建并启动
npm run build
npm run preview
```

## 6. 换机时需要重装的工具

| 工具 | 位置 | 安装方式 |
| --- | --- | --- |
| Playwright | `D:\AppData\playwright` | `mkdir D:\AppData\playwright; cd D:\AppData\playwright; npm init -y; npm install playwright-core` |

`web/scripts/run-browser-check.mjs` 会自动从 `PLAYWRIGHT_DIR`（默认 `D:\AppData\playwright`）解析模块，
并探测本机 Edge / Chrome 作为浏览器，无需下载自带浏览器。
可用 `PLAYWRIGHT_DIR`、`PLAYWRIGHT_MODULE`、`BROWSER_EXECUTABLE`、`SMOKE_BASE_URL` 覆盖。

## 7. 验收命令与实测结果

服务地址一律用 `http://[::1]:<端口>`（开发服务器只绑定 IPv6 localhost）。

| 命令 | 实测结果 |
| --- | --- |
| `cd web; npx nuxt typecheck` | 退出码 0 |
| `cd web; npm run test` | 167/167 通过 |
| `npm run smoke` | 46/46 通过 |
| `npm run check:static` | 8 个预渲染页面、310 处资源引用、1020 处路由链接（360 个唯一路径）全部可访问 |
| `npm run check:browser` | 44/44 通过 |
| `node tools/e2e-data-flow.mjs` | 40/40 通过；指向死端口时退出码 1 |
| `node tools/verify-oss-upload.mjs` | 13/13 通过 |
| `node tools/verify-admin-api.mjs` | 33/33 通过 |
| `node tools/migrate-legacy/schema-check.mjs --apply` | 6 个迁移，幂等 |

只读核对脚本：`tools/check-backfill.mjs`、`tools/check-public-api.mjs`、`tools/check-about-config.mjs`、
`tools/check-site-settings-state.mjs`、`tools/check-review-resolution.mjs`、`tools/check-media-state.mjs`、
`tools/check-ip-types-admin.mjs`。

## 8. 已知限制与待办（非阻塞）

| 项 | 说明 | 处理建议 |
| --- | --- | --- |
| 劳动法案例、货代案例栏目为空 | 旧库这些文章正文长度为 0，迁移时标为 `draft`；已与需求方确认暂时接受 | 由甲方补内容，后台可直接录入并发布 |
| 832 个案件侵权类型均显示「待确认类型」 | 旧站没有侵权类型字段，无法从内容推导 | 后台核验队列逐条确认（34 项待处理） |
| 关于我们/宣讲图片未上传 | 配置键已就位，当前显示待上传说明 | 后台上传后自动显示 |
| 首页核心业务文案仍是前端配置 | 在 `web/app/config/businessContent.ts`，未改为数据库驱动 | 已确认暂不改；将来可接 `service_sections` |
| 密码哈希使用 scrypt 而非 Argon2id | 无原生依赖；存储格式带算法前缀 | 后续可平滑升级为 Argon2id |
| 核验项回填存在歧义 | `case_sources` 是一对多，278 个来源中只有 55 个能唯一对应案件 | 接口仅在唯一命中时回填，否则返回 409 交由人工判断 |

## 9. 交接物清单

| 类别 | 位置 |
| --- | --- |
| 应用代码 | `web/` |
| 数据库迁移 | `database/migrations/001`–`006` |
| 迁移与运维工具 | `tools/`（含 `tools/migrate-legacy/`） |
| 项目说明 | `README.md` |
| 迁移核验报告 | `docs/migration-report-2026-10-09.md` |
| 后台与生产启动验收 | `docs/task7-acceptance.md` |
| 需求与设计 | `docs/superpowers/specs/`、`docs/superpowers/plans/` |
| 数据契约 | `docs/superpowers/task6-data-contract.md`、`task7-admin-contract.md` |
| 进度记录 | `docs/progress.md` |
