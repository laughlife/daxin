# 首页、关于我们与配置收敛实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将已确认的首页、关于我们、页脚、TRO 查询和后台配置调整落地到 Nuxt 全栈项目，并让首页团队业务与核心优势内容可由后台维护。

**Architecture:** 延续现有 Nuxt 4 + Nitro API + MySQL 架构。站点文案和图片继续存放在 `site_settings`，首页团队业务复用 `service_sections/service_items`，核心优势使用一个 JSON 配置项保存标题、说明和重点片段。公开首页接口统一返回这些配置，后台沿用现有设置和服务 CRUD，前端只消费接口数据并保留静态兜底。

**Tech Stack:** Nuxt 4.5、Vue 3、TypeScript、Nitro server routes、MySQL 8、现有 `site_settings` / `service_sections` / `service_items` 表、npm scripts（`check:static`、`typecheck`、`build`、`smoke`）。

**Spec:** `docs/superpowers/specs/2026-10-13-home-about-footer-settings-design.md`

## Global Constraints

- 首页团队介绍链接文案必须为“了解更多”，不得出现“了解更多关于我们”。
- 首页不展示原“核心业务”区块，不展示首页右侧图片，不使用首页侧栏。
- 首页新增标题为“核心优势”的四块模块，不新增其他同名模块。
- 核心优势默认重点片段为“30”“8年”“上万起TRO”，前台以加粗、黑色显示；后台可选择重点片段。
- 关于我们页移除核心业务图片模块，删除 `about_hero_paragraph`、`about_business_images`、`home_right_image` 的配置与读取。
- 推荐阅读模块全站移除；TRO 查询默认每页 50 条，移除日期快捷按钮，三个筛选控件同宽纵向排列。
- 页脚简介和两张二维码优先读取站点配置，缺省时继续使用现有静态资源兜底。
- Git 提交标题使用英文类型前缀和中文内容；每个任务只暂存相关文件，不提交现有未跟踪的 `tools/*` 文件。

## Review Focus

- 旧配置仍存在或历史版本重新出现：迁移、后台过滤和前台读取必须同时覆盖，验证后台列表和公开接口均不返回废弃键。
- 核心优势重点片段包含正则特殊字符或重复片段：渲染必须按片段安全分割文本，不得拼接原始 HTML；在配置缺失时使用默认片段。
- 首页公开接口为空或服务模块被停用：页面应隐藏空模块，不显示空白卡片；静态团队文案仍可回退。
- 页脚二维码配置缺失、只有一张或 media 失效：每个二维码独立回退静态资源，不能导致页脚报错。
- 案件查询页码超过总页数或总数为 0：沿用现有页码夹取逻辑，不能出现 999/3、4/3 等越界页码。

---

### Task 1: 数据库迁移与初始配置

**Files:**
- Create: `database/migrations/012_home_about_footer_cleanup.sql`
- Verify: existing migration runner and MySQL `site_settings`, `service_sections`, `service_items` rows

**Interfaces:**
- Produces site settings `footer_intro`, `footer_qr_primary`, `footer_qr_secondary`, and `home_core_advantages`.
- Removes current rows for `home_right_image`, `about_hero_paragraph`, and `about_business_images`.
- Seeds or upserts four enabled service sections and their ordered service items without duplicating existing slugs.

- [ ] **Step 1: Inspect current unique keys and service rows** using the repository migration tooling or read-only MySQL query; record existing section slugs before writing SQL.
- [ ] **Step 2: Write migration SQL** with idempotent inserts/updates for the four service sections and items, JSON defaults for `home_core_advantages`, footer intro, and empty image media IDs.
- [ ] **Step 3: Run the migration against the configured `daxin` database** and verify affected row counts; do not print credentials.
- [ ] **Step 4: Verify current settings no longer include the three retired keys and that all four service sections are enabled and ordered.**
- [ ] **Step 5: Commit** `database/migrations/012_home_about_footer_cleanup.sql` with `feat: 增加首页团队与页脚配置迁移`.

---

### Task 2: 公开首页数据契约与后台设置编辑器

**Files:**
- Modify: `web/server/api/public/home.get.ts`
- Modify: `web/app/repositories/home.ts`
- Modify: `web/server/api/public/settings.get.ts` only if footer setting decoding needs explicit handling
- Modify: `web/app/pages/admin/settings.vue`
- Modify: `web/server/utils/admin/settings-queries.ts` if a new kind/key filter is required
- Create or modify: focused admin settings component under `web/app/components/admin/` for `home_core_advantages` if the existing generic editor cannot expose emphasis selection

**Interfaces:**
- `HomeData.teamServices`: ordered enabled sections, each with `slug`, `title`, `description`, and ordered `items` containing `title` and optional `description`.
- `HomeData.coreAdvantages`: array of `{ title: string; description: string; highlights: string[] }`.
- `home_core_advantages` JSON editor must round-trip these exact fields and expose a checkbox/list control for `highlights`.
- Site settings UI hides `home_right_image`, `about_hero_paragraph`, and `about_business_images`; it keeps `about_team_paragraphs`, footer fields, and existing SEO tab behavior unchanged.

- [ ] **Step 1: Add failing normalization assertions** for missing `teamServices`, malformed `home_core_advantages`, and valid highlights; run the existing static/test command to capture the failure.
- [ ] **Step 2: Extend the public home query** to return enabled `service_sections/service_items` and decode `home_core_advantages` with a safe fallback.
- [ ] **Step 3: Update repository types and normalization** so malformed rows never break the page and disabled sections/items are omitted.
- [ ] **Step 4: Add the structured core advantages editor** with title, description, and selectable highlight fragments; preserve invalid JSON blocking behavior used by `about_team_paragraphs`.
- [ ] **Step 5: Update settings filtering and labels** for retired keys and footer fields; verify save/reload returns the same JSON.
- [ ] **Step 6: Run focused normalization/static checks and commit** `feat: 接入首页团队与核心优势配置`.

---

### Task 3: 首页与关于我们页面结构

**Files:**
- Modify: `web/app/pages/index.vue`
- Create: `web/app/components/home/HomeTeamServices.vue`
- Create: `web/app/components/home/HomeCoreAdvantages.vue`
- Modify: `web/app/pages/about.vue`
- Modify: `web/app/utils/aboutContent.ts`
- Modify: `web/app/config/homeContent.ts` only for static fallback text and link label
- Modify: `web/app/components/home/BusinessSection.vue` only if dead imports or static references need removal

**Interfaces:**
- `HomeTeamServices` accepts `sections: HomeTeamServiceSection[]` and renders enabled sections/items only.
- `HomeCoreAdvantages` accepts `items: CoreAdvantage[]`, emits no navigation, and toggles one expanded card at a time on hover/click.
- Core advantage text renderer splits plain text around configured `highlights` and applies `font-weight: 800; color: #111` to matching fragments without `v-html`.

- [ ] **Step 1: Add component-level fixtures or static assertions** for the four titles, default highlight fragments, and safe plain-text rendering.
- [ ] **Step 2: Remove `BusinessSection`, `ContentColumns`, and `home_right_image` usage from the homepage; render team intro with `about_team_paragraphs`, set link label to “了解更多”, and render team services plus core advantages from `HomeData`.**
- [ ] **Step 3: Implement responsive `HomeTeamServices` with four desktop columns and one column on narrow screens; long item names wrap naturally.**
- [ ] **Step 4: Implement responsive `HomeCoreAdvantages` with four cards, hover/click expansion, keyboard-accessible toggle behavior, and highlighted fragments.**
- [ ] **Step 5: Remove about page core business image section and `about_hero_paragraph` rendering; use existing team paragraphs with lead paragraph typography.**
- [ ] **Step 6: Remove homepage sidebar usage and verify home article/case preview remains full width; commit** `feat: 重构首页与关于我们内容结构`.

---

### Task 4: 推荐阅读、页脚和站点配置展示

**Files:**
- Modify: `web/app/components/layout/ContentSidebar.vue`
- Modify: `web/app/components/layout/SiteFooter.vue`
- Modify: `web/app/repositories/settings.ts` or `web/app/composables/useSiteSettings.ts` only if footer fields need typed access
- Modify: `web/app/config/contactQr.ts` only for fallback metadata, not to remove existing static QR assets

**Interfaces:**
- `ContentSidebar` retains contact and FAQ cards but no longer renders the Recommended Reading card or its data fetch.
- `SiteFooter` reads `settings.footer_intro`, `settings.footer_qr_primary`, and `settings.footer_qr_secondary`; each QR independently falls back to existing public/labor static QR.
- Footer intro uses configured text when non-empty and falls back to current static introduction.

- [ ] **Step 1: Add a static check** that no Recommended Reading card or `推荐阅读` heading remains in `ContentSidebar`.
- [ ] **Step 2: Remove the recommendation query/card while preserving contact and FAQ links.**
- [ ] **Step 3: Wire typed footer settings and independent QR fallback logic; keep QR zoom interaction and consistent sizing.**
- [ ] **Step 4: Run static checks and manually inspect one content page plus homepage footer; commit** `fix: 收敛推荐阅读与页脚配置展示`.

---

### Task 5: TRO 查询筛选与分页

**Files:**
- Modify: `web/app/pages/tro/cases/index.vue`
- Modify: `web/app/composables/useCaseSearch.ts`
- Modify: `web/app/components/cases/CaseSearchPanel.vue`
- Modify: related styles in the same files only

**Interfaces:**
- `useCaseSearch` default `pageSize` is 50; cases page explicitly requests `{ pageSize: 50 }`.
- Cases page has no today/recent/all shortcut nav.
- Search panel renders keyword, infringement type, and filing date with same full width and vertical spacing; actions remain below filters.
- Pagination clamps current page to `1..totalPages` and displays `1/1` when no result.

- [ ] **Step 1: Add a static/page-data check** for page size 50, absent shortcut labels, and matching filter class rules.
- [ ] **Step 2: Set composable and page defaults to 50 and remove shortcut state, links, and styles.**
- [ ] **Step 3: Change filter grid so all three controls use same full-width column and align vertically; preserve query synchronization and reset behavior.**
- [ ] **Step 4: Run page/static checks and verify empty, one-page, and multi-page result states; commit** `fix: 调整TRO查询筛选与分页`.

---

### Task 6: 全量验证与交付预览

**Files:**
- Modify: only files needed to resolve verification failures
- Verify: `web` build output and browser routes

**Interfaces:**
- Public routes: `/`, `/about`, `/tro/cases`, and a content detail route.
- Admin routes: `/admin/settings`, `/admin/services`.

- [ ] **Step 1: Run `npm run check:static` and `npm run typecheck` in `web`; fix only errors caused by this change.**
- [ ] **Step 2: Run `npm run build` with the project environment loaded; verify Nuxt production output succeeds.**
- [ ] **Step 3: Start or reuse production preview on port 3002 with `NITRO_HOST=0.0.0.0`; do not expose .env contents.**
- [ ] **Step 4: Browser-check homepage, about page, TRO cases page, settings, and services admin page. Confirm visible copy, responsive layout, highlights, footer fallbacks, removed recommendation/sidebar/core business sections, and bounded pagination.**
- [ ] **Step 5: Commit any verification-only fix separately with the appropriate Chinese commit message and report preview URL and validation results.**

