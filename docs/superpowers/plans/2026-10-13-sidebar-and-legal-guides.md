# 侧边栏与普法干货配置实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将内容页侧栏和首页三本普法干货书接入现有站点配置后台，并保持团队业务块与二维码继续复用现有管理入口。

**Architecture:** 新增 `site_settings` JSON 配置 `content_sidebar` 和 `home_legal_guides`，以幂等迁移填入当前展示内容。纯函数负责配置校验与默认回退；站点设置后台增加结构化编辑器；公众号二维码复用 `footer_qr_primary` / `footer_qr_secondary` 设置，咨询号二维码复用 `/api/public/settings` 返回的 `footer.qr` 目录。

**Tech Stack:** Nuxt 4、Vue 3、TypeScript、MySQL migrations、Node.js `node:test`、现有 OSS 上传组件。

**Spec:** `docs/superpowers/specs/2026-10-13-sidebar-and-legal-guides-settings-design.md`

## Global Constraints

- 不新增数据库表，不改变团队业务块的 `/admin/services` 配置入口。
- 侧栏 FAQ 仅使用三个站内链接，不接受任意外链。
- 轮播固定为 TRO、劳动法、国际物流三个主题，不在后台提供增删或重排。
- TRO/劳动法公众号二维码沿用现有 `footer_qr_primary` / `footer_qr_secondary` 图片设置，咨询号二维码沿用现有 `qr_assets` 管理；找不到有效二维码时使用当前静态默认图。
- 新配置缺失或无效时，前台使用当前页面默认内容；后台 JSON 解析失败时阻止保存。
- Git 提交标题使用中文正文与英文类型前缀；每个可独立验证的任务单独提交，只暂存任务涉及文件。
- 不执行 git push 或 merge。

## Review Focus

- 配置 JSON 部分字段缺失或类型错误：归一化后不能让页面报错，也不能错配 TRO/劳动法二维码；纯函数测试覆盖。
- 保存损坏 JSON：后台需显示解析错误并禁用保存；后台静态/纯函数测试覆盖。
- FAQ 配置路径尝试使用外域或协议相对地址：归一化应丢弃该路径，仅允许规定的站内路径；归一化测试覆盖。
- OSS 图片上传期间保存按钮被点击：上传完成前必须禁用保存，避免持久化旧图片 URL；后台编辑器测试或现有上传状态逻辑验证。
- `group="all"` 或 QR 资源未配置：侧栏仍精确显示两个 TRO 默认二维码，且不恢复二维码名称、提示和电话；组件测试覆盖。

---

### Task 1: 配置默认值、归一化与数据库种子

**Files:**
- Create: `web/app/utils/contentSettings.ts`
- Create: `web/scripts/content-settings.test.mjs`
- Create: `database/migrations/013_sidebar_and_legal_guides_settings.sql`
- Test: `web/scripts/content-settings.test.mjs`
- Reference: `web/app/config/contactQr.ts`, `web/app/components/home/HomeLegalGuides.vue`, `database/migrations/012_home_about_footer_cleanup.sql`

**Interfaces:**
- Produces `ContentSidebarConfig`, `ContentSidebarLink`, `LegalGuideSlide` exported types.
- Produces `normalizeContentSidebar(value: unknown): ContentSidebarConfig`.
- Produces `normalizeLegalGuideSlides(value: unknown): LegalGuideSlide[]`; returns all three fixed slugs in `tro`, `labor`, `logistics` order, merging valid editable fields with defaults. Invalid/missing configuration returns a fresh copy of all existing defaults.
- QR link field is `qrItemKey`; TRO/Labor defaults use stable IDs matching `qr_assets.item_key` (`qr-tro-consult`, `qr-labor-consult`); sidebar resolves public and consultation QR IDs by page group.

- [ ] **Step 1: Write failing normalization tests** in `web/scripts/content-settings.test.mjs` for: full valid config; missing optional fields; malformed object/array; fixed guide order; damaged data falls back without dropping any theme; unsafe FAQ path rejected; `all` sidebar group default QR IDs. Add a static migration assertion for both keys/groups/JSON types/default rows and `NOT EXISTS` guards.
- [ ] **Step 2: Run the focused tests and verify they fail**

  Run: `cd web; node --test scripts/content-settings.test.mjs`
  Expected: FAIL because `app/utils/contentSettings.ts` does not exist.

- [ ] **Step 3: Implement the typed defaults and normalizers** in `web/app/utils/contentSettings.ts`. Keep current sidebar FAQ labels/routes and exact existing guide titles, paragraphs, image URLs, benefit copy, accent values and QR defaults from the current components. Filter FAQ routes to `/faq/tro`, `/faq/labor`, `/faq/cross-border` only.
- [ ] **Step 4: Add idempotent config seeds** in migration `013_sidebar_and_legal_guides_settings.sql`: seed `content_sidebar` in `general` and `home_legal_guides` in `home`, both `value_type='json'`, `status='published'`, only when no current row exists. Use the existing `INSERT ... SELECT ... FROM DUAL WHERE NOT EXISTS` migration convention and assign sort orders after existing same-group settings.
- [ ] **Step 5: Run the focused tests and migration static checks**

  Run: `cd web; node --test scripts/content-settings.test.mjs scripts/admin-settings.test.mjs`
  Expected: PASS; migration test asserts keys, groups, JSON value type, defaults and `NOT EXISTS` guards.

- [ ] **Step 6: Commit Task 1**

  ```bash
  git add web/app/utils/contentSettings.ts web/scripts/content-settings.test.mjs database/migrations/013_sidebar_and_legal_guides_settings.sql
  git commit -m "feat: 增加侧栏与普法干货默认配置"
  ```

### Task 2: 后台结构化配置编辑器

**Files:**
- Modify: `web/app/pages/admin/settings.vue`
- Create: `web/app/components/admin/JsonImageField.vue`
- Modify: `web/scripts/admin-settings.test.mjs`
- Test: `web/scripts/admin-settings.test.mjs`
- Reference: `web/app/components/admin/SettingImageField.vue`, `web/app/components/admin/AdminImageListField.vue`, `web/app/composables/useOssUpload.ts`

**Interfaces:**
- The existing settings page continues to own `editItems`, JSON serialization, dirty state, save state and `PUT /api/admin/settings`.
- `JsonImageField` accepts `modelValue: string`, `label: string`, `disabled?: boolean`; emits `update:modelValue(value: string)` and `uploading(value: boolean)`. It uses `useOssUpload` and stores the returned `publicUrl` inside the parent JSON editor state.
- The `site` settings tab renders `content_sidebar`: editable public/consult headings, and fixed FAQ rows with editable label, enabled state and order; route remains the fixed route for each key.
- The `home` settings tab renders exactly three `home_legal_guides` slots; editable category, title, paragraphs, image, alt text, benefit and accent; `slug` and order are fixed.

- [ ] **Step 1: Add failing settings contract checks** to `admin-settings.test.mjs` for new setting keys being visible in their correct groups, JSON-specific normalization/serialization paths, disabled save on JSON parse errors, and upload state included in save disabling.
- [ ] **Step 2: Run focused test and verify failure**

  Run: `cd web; node --test scripts/admin-settings.test.mjs`
  Expected: FAIL because the new keys/editors are not wired into `settings.vue`.

- [ ] **Step 3: Extend admin settings state** in `settings.vue`: parse/serialize both keys through `contentSettings.ts`; include their structured state in `snapshot`, `buildPayload`, `applyGroup`, `isJsonEditor`, dirty-state and parse-error guard paths. Keep raw JSON untouched and save-disabled if parsing fails.
- [ ] **Step 4: Add accessible structured editors** in the site/home settings panels. FAQ route is shown read-only; labels, enabled and order are editable. Each fixed book slot exposes all configurable fields; paragraphs can be added/removed. Retain status controls for each settings item.
- [ ] **Step 5: Implement `JsonImageField.vue`** using `useOssUpload` (`usageScope='general'`, 20 MB limit inherited from existing upload API), with preview, upload error, progress/disabled state and URL update. Wire all three book image fields to the parent upload blocker.
- [ ] **Step 6: Run settings tests and typecheck**

  Run: `cd web; node --test scripts/admin-settings.test.mjs; npm run typecheck`
  Expected: PASS; malformed JSON blocks save, normal edit serializes to the same keys, upload state disables save.

- [ ] **Step 7: Commit Task 2**

  ```bash
  git add web/app/pages/admin/settings.vue web/app/components/admin/JsonImageField.vue web/scripts/admin-settings.test.mjs
  git commit -m "feat: 增加侧栏与普法干货后台编辑器"
  ```

### Task 3: 前台读取配置并调整展示

**Files:**
- Modify: `web/app/components/layout/ContentSidebar.vue`
- Modify: `web/app/components/home/HomeLegalGuides.vue`
- Modify: `web/app/repositories/settings.ts`
- Modify: `web/scripts/footer-sidebar.test.mjs`
- Modify: `web/scripts/home-legal-guides.test.mjs`
- Test: `web/scripts/footer-sidebar.test.mjs`, `web/scripts/home-legal-guides.test.mjs`

**Interfaces:**
- Public `settings` remains a key-value record; `footer.qr` remains the consult QR asset directory with `itemKey` and `imageUrl`; public account QR sources remain `settings.footer_qr_primary` and `settings.footer_qr_secondary`.
- `ContentSidebar` uses shared `useSiteSettings()` and `normalizeContentSidebar`; maps active group to exactly two QR channels using the public-account setting and the consult asset key, then passes image URLs to `ContactQrGrid` with `hideName` and `hideNote`.
- `HomeLegalGuides` uses shared `useSiteSettings()` and `normalizeLegalGuideSlides`; QR URLs resolve by `qrItemKey` against `footer.qr`, falling back to static URLs when the asset is missing.

- [ ] **Step 1: Update failing sidebar tests** to assert FAQ block precedes QR blocks; headings match defaults; no intro/phone/caption text; TRO/labor/all groups map exactly two matching QR IDs; QR labels are hidden.
- [ ] **Step 2: Update failing legal guide tests** to assert carousel data comes from normalized public settings (not the local hardcoded array), uses configured title/copy/image/benefit/color, preserves fixed three topics and five-second rotation, and resolves QR assets by key with static fallback.
- [ ] **Step 3: Run both focused tests and verify failure**

  Run: `cd web; node --test scripts/footer-sidebar.test.mjs scripts/home-legal-guides.test.mjs`
  Expected: FAIL on current hardcoded sidebar order and carousel data source.

- [ ] **Step 4: Implement sidebar rendering** in `ContentSidebar.vue`: FAQ first; then two vertically stacked heading/QR blocks; remove light intro, phone link and QR caption; resolve only the current group’s public and consultation assets. Keep group-specific FAQ filtering and existing layout/sticky behavior.
- [ ] **Step 5: Implement configured guide rendering** in `HomeLegalGuides.vue`: use shared settings fetch, normalize the three slots, resolve QR directory URLs, preserve existing visual themes and five-second timer. Do not alter carousel position or other homepage sections.
- [ ] **Step 6: Run focused tests and typecheck**

  Run: `cd web; node --test scripts/footer-sidebar.test.mjs scripts/home-legal-guides.test.mjs; npm run typecheck`
  Expected: PASS; no type errors and all requested group-specific content assertions pass.

- [ ] **Step 7: Commit Task 3**

  ```bash
  git add web/app/components/layout/ContentSidebar.vue web/app/components/home/HomeLegalGuides.vue web/app/repositories/settings.ts web/scripts/footer-sidebar.test.mjs web/scripts/home-legal-guides.test.mjs
  git commit -m "feat: 按后台配置展示内容侧栏与普法干货"
  ```

### Task 4: 整体验证与预览

**Files:**
- Modify only if required by verification: files from Tasks 1–3.
- Test: `web/scripts/content-settings.test.mjs`, relevant existing test suite, browser preview.

**Interfaces:**
- No new interfaces; verify the full migration → admin save → public settings → component flow.

- [ ] **Step 1: Run the complete unit test suite**

  Run: `cd web; npm test`
  Expected: PASS.

- [ ] **Step 2: Run static checks, typecheck and production build**

  Run: `cd web; npm run check:static; npm run typecheck; npm run build`
  Expected: all commands exit 0.

- [ ] **Step 3: Run browser smoke checks**

  Run: `cd web; npm run check:browser`
  Expected: homepage carousel loads, settings/admin routes render for a signed-in administrator, content page shows FAQ above the two QR blocks, and no console/runtime errors occur.

- [ ] **Step 4: Verify no business-module regression**

  Open `/` and confirm the four team service blocks still reflect `/admin/services` data; inspect one TRO and one labor content page plus one `group="all"` page for corresponding QR mapping.

- [ ] **Step 5: Review final diff and status**

  Run: `git diff --check; git status --short`
  Expected: only task files changed; the four pre-existing untracked `tools/codex-*.py` files remain unmodified and unstaged.

- [ ] **Step 6: Commit only any verification-driven fixes** using Chinese commit text and a conventional English prefix; do not push or merge.

---

## Execution Notes

- Preserve existing unrelated untracked files in `tools/`.
- The root repo uses the Windows PowerShell environment and configured local server on port 3002. Reuse the running preview if still healthy; restart only when code changes require it.
- Migration must be idempotent and must never rewrite an existing current admin configuration.
- Use the native execution approach unless the user selects subagent-driven execution; the settings editor and two consumers share normalization/data contracts and are simpler to keep in one implementation context.
