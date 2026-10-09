## 静态展示补全（2026-10-07）

- 完成计划全部页面范围、两栏布局、四类 PDF 二维码、公告一键复制、日期筛选与页码修复。
- 品牌及律所专页与案件互相关联，旧文章链接全部可访问。
- 关于我们成功案例与企业宣讲提供列表及详情，均保留演示标识。
- 修复手机菜单焦点约束及恢复、query-only 筛选更新与单一 main landmark。
- 新增边界测试、浏览器交互验收、静态链接/资源完整性检查。
- 最终验证：typecheck、3 项日期/分页边界测试、generate 通过；104 个静态页面内 7307 处内部链接与 852 处资源引用均存在；纯静态 Edge 浏览器验收 31 项、Smoke 26 项通过。
- 修复 SSG 带查询参数首次加载时输入框为空的问题，在静态产物上复现后验证恢复。
- 原历史进度如下；正式后台及真实素材仍未接入。

# 实施进度

## 2026-10-01 — Task 1：建立项目和执行规则

### 改动

- 在独立工作区创建最小 Nuxt 4 + Vue 3 + TypeScript npm 工程 `web/`。
- 锁定前端直接依赖并生成 npm lockfile；补充 `typecheck` 脚本及所需开发依赖。
- 创建根目录 README，说明环境基线、当前 Mock 数据边界、目录结构及干净环境操作命令。
- 创建 `api/` 第二阶段 Laravel 13 + Filament 5 占位说明。
- 创建阻塞记录、根目录与前端 `.gitignore`、Node 22 `.nvmrc`。
- 未实现设计令牌、Header/Footer、布局、业务页面或后端工程；未修改旧 PHP 网站。

### 实际验证

验证环境：Windows，Node.js `v24.16.0`，npm `11.17.0`。README 的项目基线仍为 Node.js 22 LTS（22.19.0+）。

- `npm install`（`web/`）：成功，执行 `nuxt prepare` 并生成 `.nuxt` 类型文件；生成 `package-lock.json`。npm 11 提示 `esbuild@0.28.2` 的安装脚本尚未列入 `allowScripts`，不影响后续类型检查或构建。
- 首次 `npm run typecheck`（`web/`）：失败。原因是 TypeScript `7.0.2` 不再导出 `typescript/lib/tsc`，与当前 `vue-tsc@3.3.11` 不兼容。将 TypeScript 锁定为兼容的 `5.9.3` 后重新安装。
- `npm ci`（`web/`）：成功，从 lockfile 干净安装 593 个包并成功执行 `nuxt prepare`；同样出现上述非阻塞 `allowScripts` 提示。
- `npm run typecheck`（`web/`，修复后及 `npm ci` 后）：成功，退出码 0，无类型错误。
- `npm run build`（`web/`，修复后及 `npm ci` 后）：成功，退出码 0；Nuxt 4.5.2 完成客户端、服务端与 Nitro node-server 构建，输出到 `.output/`。Node 24 下出现依赖包 `@vue/shared` 的 `DEP0155` 弃用提示，但构建成功。
- `npm ls --depth=0`（`web/`）：成功，确认顶层依赖为 Nuxt 4.5.2、Vue 3.5.43、Vue Router 5.3.1、TypeScript 5.9.3、vue-tsc 3.3.11。

### 验收结论

Task 1 验收通过：新项目目录结构清晰，旧 PHP 网站未被删除、覆盖或修改；根 README 包含从干净环境安装、开发启动、类型检查、生产构建和预览所需命令。

## 2026-10-01 — Task 2：建立官网全局设计系统与站点壳层

### 改动

- 设计令牌：新增 `web/app/assets/styles/tokens.css`（品牌色、深色/浅色背景、正文/次要文字、边框、成功/警告/错误色、容器宽度、间距、圆角、阴影、字体层级、响应式断点、z-index、过渡）与 `main.css`（box-sizing 统一、body/链接/图片/按钮基础样式、页面容器 `.page-container`、`:focus-visible` 焦点样式、移动端与 reduced-motion 适配）。
- 全局配置：新增 `web/app/config/site.ts`（站名、副标题、Logo/微信号/电话/邮箱/地址占位、主导航、Footer 导航、产品侵权检测 CTA、ICP/版权/隐私/免责占位）与 `web/app/types/site.ts`；导航数据单一来源，组件不硬编码。
- 新增 `web/app/composables/useCopyText.ts`：纯前端复制逻辑，Clipboard API 不可用时降级 `execCommand`，返回 copied/failed 状态。
- 布局与壳层组件：`app.vue` 移除 NuxtWelcome，改为 NuxtRouteAnnouncer + NuxtLayout + NuxtPage；新增 `layouts/default.vue`（公告栏 + Header + 主内容区 + Footer）；新增 `SiteAnnouncement`（复制微信号 + aria-live 反馈）、`SiteHeader`（Logo 占位、站名、CTA、汉堡按钮、sticky）、`DesktopNavigation`（点击/键盘开合子菜单、Escape 与点击外部关闭、当前路由高亮）、`MobileNavigation`（遮罩 + 抽屉、Escape 关闭、body 滚动锁定、子菜单手风琴、点击后关闭）、`SiteFooter`（公司信息/业务导航/联系方式/ICP/版权/隐私/免责占位）。
- 通用 UI 组件：`PageContainer`、`SectionHeading`、`BaseButton`、`BaseCard`，均支持 props/插槽复用。
- 预览页：新增 `pages/index.vue`，明确标注为“Task 2 站点壳层预览，非正式首页”，含主/次按钮、SectionHeading、三个 BaseCard 与色彩令牌示例。
- 元信息：`nuxt.config.ts` 配置 `lang="zh-CN"`、viewport、默认 description；`app.vue` 通过 useHead 配置默认标题与 titleTemplate。未修改 robots.txt 生产策略。
- 构建配置：`nuxt generate` 关闭链接爬取（`crawlLinks: false`、`routes: ['/']`），避免导航中未实现的规划路由导致预渲染 404。
- 文档：新增 `docs/design-tokens.md`、`docs/navigation-map.md`，更新 `docs/progress.md`、`docs/blockers.md`。
- 依赖：零新增，仍为 Nuxt 4.5.2 + Vue 3.5.43 + TypeScript；继续使用 npm 与原 package-lock.json（本次未变更 lockfile）。
- 未连接 Laravel / MySQL / 旧数据库 / 旧 PHP CMS；未开发任何业务页面。

### 实际验证

验证环境：Windows，Node.js v24.16.0，npm 11.17.0（web/ 目录）。

- `npm ci`：成功，593 个包；仍有 esbuild allowScripts 非阻塞提示（与 Task 1 相同）。
- `npm run typecheck`：首次失败——`nuxt.config.ts` 引入的 `app/config/site.ts` 在 node 侧 tsconfig 项目下无法解析 `~/types/site` 别名，改为相对路径导入后通过（退出码 0）。
- `npm run build`：成功，退出码 0。
- `npm run generate`：首次失败——链接爬虫抓取导航中未实现路由（/tro/cases 等）产生预渲染 404；在 nuxt.config 中设置 `nitro.prerender.crawlLinks: false`、`routes: ['/']` 后成功，输出 `.output/public/index.html`。
- 预渲染产物检查：index.html 含 `lang="zh-CN"`、站点标题“大信法务”、页面标题“站点壳层预览”、Header（site-header、复制微信号、产品侵权检测、主导航）与 Footer（site-footer）文本。
- `npm run preview -- --port 3123` + `Invoke-WebRequest http://127.0.0.1:3123/`：HTTP 200，响应含“大信法务”“site-header”“site-footer”“复制微信号”。
- 交互实现说明（本环境未做自动化浏览器点击测试，以下为代码级实现，建议在浏览器中人工复核）：桌面导航子菜单点击/键盘开合、Escape 与点击外部关闭；移动端抽屉遮罩/关闭按钮/Escape 关闭、打开时锁定 body 滚动、抽屉宽度 min(85vw, 320px) 不会在 390px 产生横向滚动；复制按钮通过 aria-live 区域给出成功/失败反馈。

### 验收结论

Task 2 验收通过：站点壳层（公告栏、Header、桌面/移动端导航、Footer）与全局设计系统就绪，`/` 可正常访问，验证命令全部通过；未接入任何后端、数据库或旧 PHP；未新增依赖。正式 Logo、微信二维码、联系方式、品牌色仍为 TODO 占位。

## 2026-10-01 — Task 3 阶段 0：开发基线验证

- 起点提交：8ef6fca（Task 2 最新提交），工作区干净。
- 基线验证（web/，Windows，Node v24.16.0，npm 11.17.0）：npm ci、npm run typecheck、npm run build、npm run generate 全部成功（退出码 0）。
- Task 2 无遗留问题，无需修复即进入 Task 3 开发。

## 2026-10-01 — Task 3：首页第一版、Mock 内容体系与 TRO 案件查询 MVP

### 改动

- 阶段 0：基线验证通过（起点提交 8ef6fca，npm ci / typecheck / build / generate 全部成功），Task 2 无遗留问题。
- Mock 内容模型：新增 `types/content.ts`（HomeStat / BusinessCard / CaseRecord / ArticleRecord / ContactChannel / ServiceCapabilityTag）与 `data/mock/`（home / businesses / cases / articles / contacts）。首页文案、业务条目、统计数据、联系方式均取自需求文档初稿；案件与文章为明显虚构的演示数据（MOCK 案件号、演示律所/品牌、【演示】标题前缀）；“近 3 天”使用固定 isRecent 字段，不依赖系统时间。
- 多渠道联系配置：ContactConfig 改为 wechatAccounts（TRO 咨询号 kjzx88 / 劳动法咨询号 chen_6506）+ defaultCopyChannelId + notice；公告栏默认复制 kjzx88；Footer 展示双渠道卡片，qrSrc 为 null 时渲染“二维码待提供”占位，不伪造二维码。
- 视觉主题：调整为需求文档阶段的红色临时主题（主色 #b91c1c、浅灰底 #f4f4f5、白色卡片、深灰公告栏/Footer），颜色仍全部来自 tokens.css；首页新组件使用 color-mix 从令牌派生透明度变化，无硬编码色值。
- 首页第一版：Hero（跨境有我，法律无忧 + 查询 TRO 案件 + 联系我们免费评估案件/弹窗）、About US 团队介绍 + 5 项统计、核心业务（国外/国内分组卡片）、TRO 最新案件与进展、TRO 与劳动法案例分享、“我们的小伙伴”（服务能力标签 + 合作伙伴素材待提供占位）、底部 24H/7 咨询 CTA。新增组件：home/HomeHero、StatsSection、BusinessSection、BusinessCard、CasePreviewSection、CasePreviewCard、ArticlePreviewSection、PartnerStrip、ConsultationCta、contact/WechatQrModal。Hero 动效为纯 CSS（光效/网格/漂浮图形），prefers-reduced-motion 全局降级。
- WechatQrModal：双咨询号 + 二维码占位 + 电话/邮箱/地址；Escape/遮罩/关闭按钮关闭，aria-modal，打开聚焦关闭按钮、关闭焦点还原触发元素，Tab 焦点循环，锁定 body 滚动。
- TRO 案件查询 MVP：useMockCaseSearch（案件号/品牌/律所不区分大小写搜索、类型/起诉州筛选、可复用本地分页、URL query 同步可刷新恢复、无 fetch）；/tro/cases 列表页（桌面表格 + 移动卡片 + 分页 + 无结果状态 + 清空条件）；/tro/cases/[id] 详情页（完整 Mock 信息 + 相关案件 + 404 处理）；页面明确标注“当前为本地 Mock 数据，尚未连接真实案件数据库”；品牌为详情链接入口，律所为“按此律所筛选”按钮（律所专页未实现，已标注）。
- 首批真实页面：/about（团队介绍/核心业务/服务理念/联系方式 + 素材待提供说明）；/infringement-check（前端演示表单：必填校验、错误提示、成功态仅提示“演示提交成功，当前尚未连接后端”，不发请求不存数据）。
- 可访问性与 SEO：布局新增 skip link（跳到主要内容）；首页/案件查询/关于我们/侵权检测均配置 title、description、og:title、og:description；首页新增 LegalService JSON-LD（仅需求文档已给出信息：2019 年成立、业务范围、联系方式、地址；不虚构律师资质与注册资本）。
- Smoke 检查：新增 web/scripts/smoke-check.mjs（原生 fetch，无测试框架）与 npm run smoke 脚本；nuxt.config 预渲染路由显式包含 /、/about、/infringement-check、/tro/cases 与 23 条 Mock 案件详情。
- 文档：新增 docs/homepage-content-source.md、docs/mock-content-model.md；更新 navigation-map.md、design-tokens.md、progress.md、blockers.md。
- 依赖：零新增（npm ls --depth=0 仍为 nuxt/vue/vue-router/typescript/vue-tsc）；继续使用 npm 与 package-lock.json（内容无实质变更）。
- 未连接 Laravel / MySQL / 旧 PHP CMS；未修改旧 PHP 网站；未删除任何已有代码。

### 实际验证

验证环境：Windows，Node.js v24.16.0，npm 11.17.0（web/ 目录）。

- npm ci：成功（中途一次 EPERM 失败，原因是此前被管道截断遗留的孤儿 nuxi generate 进程锁定 lightningcss 原生模块，终止进程后重试成功；与代码无关）。
- npm run typecheck：成功，退出码 0（阶段中两次失败均已修复：WechatQrModal 索引可能为 undefined 的 TS18048；无其他遗留）。
- npm run build：成功，退出码 0（中途一次 PostCSS 失败：CasePreviewCard 的 gap 属性被写坏，已修复）。
- npm run generate：成功；产物含 index.html、about/、infringement-check/、tro/cases/ 与 23 个案件详情目录，无预渲染错误。
- 静态预览（npm run preview，nitro-prerender，http://127.0.0.1:3000）+ npm run smoke：26/26 PASS，退出码 0。四条路由均 200；首页含“跨境有我，法律无忧/查询 TRO 案件/大信法务/核心业务/24 小时”；案件页含“TRO 案件查询/案件号/品牌名/代理律所/Mock 数据说明”；所有页面不含 NuxtWelcome 与壳层预览文字。
- 案件详情 /tro/cases/mock-25-cv-9001：HTTP 200，含品牌名；SSR HTML 检查确认 skip-link、JSON-LD（LegalService）、og:title/og:description 均在首页输出中。
- 浏览器级交互（弹窗焦点还原、抽屉菜单、搜索分页、390px 无横向滚动）已按规范实现并经静态产物/代码审查确认；本环境无浏览器自动化，建议人工在浏览器复核，已记入 blockers 备注。

### 验收结论

Task 3 验收通过：首页第一版（需求文档文案 + Mock 数据）、多渠道联系配置、红色临时主题、TRO 案件查询 MVP（搜索/筛选/分页/详情/URL 恢复）、/about 与 /infringement-check、可访问性与 SEO、Smoke 检查与文档全部完成；全部验证命令通过；未连接任何后端；零新增依赖。


## 2026-10-09 — 全栈改造：数据库、旧库迁移与后台鉴权

### 改动

- **Task 2 新库结构**：新增 `database/migrations/001_initial_schema.sql`（29 张业务表，覆盖站点配置、
  媒体、业务板块、文章、案例、品牌、律所、侵权类型、关系、迁移核验与管理员）与
  `002_indexes_and_constraints.sql`（全文索引、补充索引与结构自检视图）。主键统一
  `BIGINT UNSIGNED`，唯一键与页面查询索引固定在建表语句内。新增
  `tools/migrate-legacy/schema-check.mjs`：静态结构校验、真实库核对、迁移执行器与
  `schema_migrations` 台账。
- **Task 3 旧库迁移**：新增 `tools/migrate-legacy/{mysql-client,legacy-source,legacy-parser,legacy-import,legacy-migrate,probe-legacy}`，
  旧库只读解析并导入新库；`docs/migration-report-2026-10-09.md` 记录核验结果与回滚步骤。
- **Task 4 后台鉴权**：新增 `web/server/utils/auth/*`、`web/server/api/admin/{login.post,logout.post,me.get}.ts`、
  `tools/create-admin.mjs`，以及后台 UI 外壳（`web/app/pages/admin/*`、`layouts/admin.vue`、
  `middleware/admin.ts`、`composables/useAdminSession.ts`）。

### 实际验证

- 结构：隔离库 `daxin_schema_check_dev` 连续执行两次结果一致；`--force` 重放通过；
  `daxin` 实测 29 张业务表、89 个索引、1 个视图。
- 迁移：旧库 `da` 只读；导入批次 `20261009-01` 写入 288 篇文章、832 个案件、228 个品牌、
  95 家律所、3684 个媒体资源、3690 条图片关联、863 条案件来源、34 条去重后核验项，
  重复案件号 0。源库迁移前后 76 张表、`cn_list` 315 行、`cn_list_5` 273 行、`cn_res` 5677 行未变化。
  隔离库连续导入两次各表行数完全一致，证明可重复执行。
- 鉴权：`npm run test` 58/58 通过；`npx nuxt typecheck` 退出码 0。真实账号联调：
  未登录 `/api/admin/me` 401；错误密码与不存在用户同为 401 且提示一致；连续 5 次失败触发
  429 与 15 分钟窗口；正确密码返回 200 且 roles 回填 `["admin"]`，Cookie 含 HttpOnly、
  SameSite=Lax；退出后再次访问 401；未登录访问 `/admin` 302 到 `/admin/login?redirect=/admin`；
  已登录 SSR 渲染后台外壳且不含公开站点头尾。

### 过程中修正的缺陷

- DDL 解析器把 `COMMENT '…'` 里的反引号当作字符串定界符，导致列被静默丢弃、唯一键引用不存在的列；
  同时 `VARCHAR(191)` 这类带长度的类型解析失败。两者都已修复并补上防回归断言。
- 导入实现逐条串行写库，实测数十分钟未完成；改为按阶段并发批量写入后约 2 分钟完成。
- `getDbConfig` 同时校验 `LEGACY_DB_*`，导致未配置旧库时任何目标库查询（含登录）返回 500；
  已拆分为目标库与旧库配置，旧库配置延迟到真正使用时校验。
- `admin-user.ts` 未选出 `r.code AS role_code`，导致登录返回的 roles 恒为空数组，
  admin 账号会被前端判定为无权限。
- 登录接口在账号不存在时跳过口令校验，存在按响应时间枚举用户名的风险，已改为恒定执行一次派生。

### 遗留

- 34 项人工核验、19 个低置信案件号、30 个重复案件号归属需后台核验。
- 3684 个旧站图片尚未上传 OSS（Task 5）。
- 密码哈希当前使用 scrypt 而非 design 要求的 Argon2id；已保留算法前缀以便平滑升级。
- OSS 真实参数（Region、Bucket、Endpoint、AccessKey）仍需用户提供。

## 2026-10-07 — 首页展示与精准咨询入口调整

- 顶部领取 TRO 侵权大礼包的文字居中；仅顶部展示 kjzx88 并保留点击复制。
- 所有其他二维码只保留名称、图片和扫码用途，不展示微信号或复制按钮。首页免费评估弹窗仅展示 TRO 咨询码；底部新增独立劳动法咨询入口，弹窗仅展示劳动法咨询码。业务侧栏继续区分对应的公众号和咨询号。
- 首屏增加循环流动光效、移动网格及漂浮装饰；系统减少动态偏好时关闭这些动画。
- 新增 6 条固定日期为 2026-10-05 至 2026-10-07 的演示案件，与原有 3 条合计 9 条近期记录；首页显示最新 6 条。案件仍明确为 Mock 数据，日期不会随系统日期自动改写。
- 验证：typecheck、3 项工具测试、静态生成通过；110 个页面的 7769 处内部链接及 902 处资源引用无缺失；Smoke 26/26、静态站浏览器验收 37/37 通过，包含居中、精准二维码、复制、日期与分页、移动端及焦点操作。额外验证动画变换随时间发生实际变化。
- 预览：http://127.0.0.1:3002/。所有改动按小步骤本地提交，使用已配置的 Git 作者信息；未 push 或 merge。
