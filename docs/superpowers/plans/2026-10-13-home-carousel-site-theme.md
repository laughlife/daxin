# 首页轮播与全站配色实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为首页书本轮播加入悬停暂停和指示点切换，为后台站点信息加入四种全站配色与自定义 HEX，并让国际物流主题配置领取说明和二维码。

**Architecture:** 沿用 `site_settings` 与现有 `/api/admin/settings`、`/api/public/settings` 数据链路。用纯函数标准化配色与轮播设置，后台专用编辑控件保存 JSON；公开默认布局把受控 CSS 自定义属性放到站点根容器，书本轮播继续使用自身独立的主题色。

**Tech Stack:** Nuxt 4、Vue 3、TypeScript、MySQL migration、Node.js `node:test`。

**Spec:** `docs/superpowers/specs/2026-10-13-home-carousel-site-theme-design.md`

## Global Constraints

- 全站配色写入现有 `site_settings`，不新建表。
- 主题 HEX 只接受 `#RRGGBB`；非法值回退大信经典红。
- 配色只设置受控 CSS 自定义属性，中性色和状态色保持现有令牌。
- 书本轮播间隔保持 5 秒；TRO、劳动法卡片颜色不受全站配色覆盖。
- 国际物流默认使用 TRO 咨询二维码；未填写领取说明时隐藏领取区。
- 保存仍使用当前站点设置权限与接口；仅暂存本次任务文件，不 push 或 merge。

## Review Focus

- 缺失、损坏或旧格式 `site_theme`：默认红主题必须能渲染且不能中断 SSR。（Task 1 标准化测试、Task 3 SSR 构建）
- 自定义 HEX 的小写、边界长度和非法字符：接受有效六位色，拒绝其它值。（Task 1 标准化测试、Task 2 后台校验）
- 旧的三页 `home_legal_guides` 数据：缺少二维码键或空字段时仍能读；已有 TRO、劳动法数据不改变。（Task 1 配置归一化测试与迁移测试）
- 国际物流领取组合：有说明且二维码可用才显示领取区；无说明、二维码未配置或 URL 为空时不显示破图。（Task 2 保存配置测试、Task 4 轮播测试）
- 计时器生命周期与键盘访问：悬停暂停、离开恢复，焦点切换可操作；卸载后不残留计时器。（Task 4 行为/浏览器验证）

---

### Task 1: 配色与轮播配置标准化

**Files:**
- Create: `web/app/utils/siteTheme.ts`
- Modify: `web/app/utils/contentSettings.ts`
- Create: `web/scripts/site-theme.test.mjs`
- Modify: `web/scripts/content-settings.test.mjs`
- Create: `database/migrations/015_home_carousel_site_theme.sql`

**Interfaces:**
- Produces: `normalizeSiteTheme(value: unknown): SiteTheme`, `siteThemeCssVariables(value: unknown): Record<string, string>` 和四个现有二维码键的类型；国际物流轮播配置默认 `qr-tro-consult`。
- `SiteTheme` 形状为 `{ preset: 'classic-red' | 'legal-navy' | 'elegant-green' | 'business-purple' | 'custom', primary: string }`。
- 预设值：大信经典红 `#B91C1C/#C9A45C`，律政藏蓝 `#244A73/#C9A45C`，雅致墨绿 `#28675A/#C9A45C`，商务紫 `#642A86/#D7B5E8`（斜线前为主色、后为点缀色）。

- [ ] **Step 1: 先写配色标准化失败测试**

  在 `site-theme.test.mjs` 验证四组预设精确值、有效自定义 `#aBc123` 规范化、无效 HEX/未知 preset/空值回退经典红，以及 CSS 变量只包含受控的主色与点缀色。

- [ ] **Step 2: 运行测试确认因模块缺失而失败**

  Run: `npm test -- --test-name-pattern="site theme"`（工作目录 `web`）
  Expected: 配色测试因 `siteTheme.ts` 不存在而失败。

- [ ] **Step 3: 实现纯配色配置函数**

  在 `siteTheme.ts` 导出 `SiteTheme`、`SITE_THEME_PRESETS`、`normalizeSiteTheme` 和 `siteThemeCssVariables`。只允许六位 HEX；自定义模式使用固定点缀金 `#C9A45C`，预设使用上表各自点缀色。

- [ ] **Step 4: 验证配色测试通过**

  Run: `node --test scripts/site-theme.test.mjs`（工作目录 `web`）
  Expected: 所有主题标准化测试通过。

- [ ] **Step 5: 先为物流二维码默认与四键白名单补测试**

  更新 `content-settings.test.mjs`：断言物流缺少 `qrItemKey` 时使用 `qr-tro-consult`，四种现有 QR 键可标准化，非法键回退安全默认，旧 TRO/劳动法键不变；迁移只给空的物流键写入默认值。

- [ ] **Step 6: 运行轮播配置测试确认失败**

  Run: `node --test scripts/content-settings.test.mjs`（工作目录 `web`）
  Expected: 物流主题和现有 migration 断言失败，指出需要更新归一化与 migration。

- [ ] **Step 7: 更新轮播配置类型、归一化与幂等迁移**

  扩展 `LegalGuideSlide.qrItemKey` 支持 `qr-tro-public`、`qr-tro-consult`、`qr-labor-public`、`qr-labor-consult` 或空值。为已有 `home_legal_guides` 当前记录新增迁移逻辑：仅在物流主题 `qrItemKey` 缺失或为空时设成 `qr-tro-consult`，保留有效现值。新增 `site_theme` JSON 当前值仅在不存在时插入，不覆盖管理员已有配置。

- [ ] **Step 8: 验证设置归一化与 migration 通过**

  Run: `node --test scripts/content-settings.test.mjs scripts/site-theme.test.mjs`（工作目录 `web`）
  Expected: 两组测试通过。

- [ ] **Step 9: 提交本任务**

  `git add` 仅列出本任务五个文件，提交标题：`feat: 增加全站配色与轮播二维码默认配置`。

### Task 2: 后台主题编辑与第三主题二维码选择

**Files:**
- Modify: `web/app/pages/admin/settings.vue`
- Modify: `web/scripts/home-legal-guides.test.mjs`
- Modify: `web/scripts/site-theme.test.mjs`
- Modify: `web/app/utils/contentSettings.ts`（仅当 Task 1 的键类型接口需要小幅校正）

**Interfaces:**
- Consumes: Task 1 的 `SiteTheme`、`SITE_THEME_PRESETS`、`normalizeSiteTheme`；轮播配置允许四种 QR asset key。
- Produces: 站点设置 `site_theme` 结构化编辑态；物流主题可从四类已维护 QR 资源中选择。

- [ ] **Step 1: 为站点设置配置编辑器写失败测试**

  在 `site-theme.test.mjs` 增加后台源码契约检查：`site_theme` 被识别为 JSON 编辑器、snapshot/buildPayload 序列化主题、提供四个预设与 HEX 输入并阻止无效值保存。

- [ ] **Step 2: 运行定向测试确认失败**

  Run: `node --test scripts/site-theme.test.mjs`（工作目录 `web`）
  Expected: 后台编辑器契约检查失败。

- [ ] **Step 3: 实现站点信息配色编辑区**

  在 `settings.vue` 增加 `siteTheme` 编辑态、解析、snapshot 和 payload 分支；新增“全站配色” JSON 编辑器，含四个命名预设、颜色预览、自定义 HEX 与六位 HEX 校验提示。无效 HEX 显示错误并阻止站点信息保存。

- [ ] **Step 4: 验证主题编辑测试通过**

  Run: `node --test scripts/site-theme.test.mjs`（工作目录 `web`）
  Expected: 主题字段读写、预设与输入验证契约测试通过。

- [ ] **Step 5: 为物流二维码选择写失败测试**

  在 `home-legal-guides.test.mjs` 断言管理页仅为物流主题显示四种 QR 配置选项，领取说明字段继续可编辑，TRO 和劳动法保持各自固定 QR 键。

- [ ] **Step 6: 运行定向测试确认失败**

  Run: `node --test scripts/home-legal-guides.test.mjs`（工作目录 `web`）
  Expected: 物流二维码选择相关契约失败。

- [ ] **Step 7: 实现物流主题 QR 选择控件**

  在第三主题编辑区增加绑定 `guide.qrItemKey` 的选择框，选项使用四个已有 `qr_assets.item_key`，并提供“不显示二维码”空选项；保持前两主题原配置说明与行为。

- [ ] **Step 8: 验证后台两个定向测试通过**

  Run: `node --test scripts/site-theme.test.mjs scripts/home-legal-guides.test.mjs`（工作目录 `web`）
  Expected: 两组测试通过。

- [ ] **Step 9: 提交本任务**

  `git add` 仅列出本任务文件，提交标题：`feat: 在站点设置维护全站主题与物流二维码`。

### Task 3: 公开站点应用配色

**Files:**
- Modify: `web/app/layouts/default.vue`
- Modify: `web/scripts/site-theme.test.mjs`

**Interfaces:**
- Consumes: `useSiteSettings()` 返回的 `settings.site_theme` 与 Task 1 的 `siteThemeCssVariables`。
- Produces: 公开站点根容器接收 `--color-primary` 和 `--color-accent`；深色、浅色主色令牌用 CSS `color-mix()` 派生。

- [ ] **Step 1: 为公开布局动态令牌写失败测试**

  在 `site-theme.test.mjs` 断言默认布局读取共享站点配置、根容器应用标准化后的受控 CSS 变量、令牌派生深浅色，且后台布局不引用公开主题。

- [ ] **Step 2: 运行测试确认失败**

  Run: `node --test scripts/site-theme.test.mjs`（工作目录 `web`）
  Expected: 布局主题应用检查失败。

- [ ] **Step 3: 把主题 CSS 变量应用到公开布局根容器**

  `default.vue` 调用 `useSiteSettings()`，从已发布配置标准化主题并绑定在 `.site-shell`；派生 `--color-primary-dark`、`--color-primary-light`，中性色保持 tokens.css 的值。不得修改 `admin.vue`。

- [ ] **Step 4: 验证公开主题检查通过**

  Run: `node --test scripts/site-theme.test.mjs`（工作目录 `web`）
  Expected: 配置读取与受控 CSS 变量检查通过。

- [ ] **Step 5: 运行类型检查**

  Run: `npm run typecheck`（工作目录 `web`）
  Expected: Nuxt 与 Vue TypeScript 类型检查通过。

- [ ] **Step 6: 提交本任务**

  `git add` 仅列出本任务两个文件，提交标题：`feat: 将站点配色应用到公开页面`。

### Task 4: 轮播控制、领取二维码与端到端检查

**Files:**
- Modify: `web/app/components/home/HomeLegalGuides.vue`
- Modify: `web/scripts/home-legal-guides.test.mjs`
- Modify: `web/app/assets/styles/tokens.css`（只有组件继承派生令牌需要集中定义时才修改；否则不动）

**Interfaces:**
- Consumes: 配置归一化后的三页数据、四类 QR asset 图片地址、后台保存的 `benefit` 与 `qrItemKey`。
- Produces: `pauseRotation()`、`resumeRotation()`、`showSlide(index)` 组件行为；可用的键盘指示点和条件领取区域。

- [ ] **Step 1: 写轮播交互与物流领取区失败测试**

  更新 `home-legal-guides.test.mjs` 断言自动计时仍为 5000ms，`pointerenter`/`pointerleave` 或等效事件暂停/恢复，指示点由按钮构成且支持点击、hover、focus 与 `aria-current`；领取区要求说明和可用二维码同时存在，物流二维码 alt 使用主题分类。

- [ ] **Step 2: 运行测试确认交互契约失败**

  Run: `node --test scripts/home-legal-guides.test.mjs`（工作目录 `web`）
  Expected: 目前装饰性 `span` 和固定计时器未满足断言。

- [ ] **Step 3: 实现计时器暂停、恢复与指示点**

  用可清理的定时器函数管理 5 秒轮播；指针进入卡片/指示点容器即暂停，离开整块区域恢复。指示点改用带主题可访问名称和当前页状态的按钮；悬停、focus、click 调用同一个 `showSlide(index)`，新页面后重新计时。尊重 `prefers-reduced-motion` 现有过渡设置。

- [ ] **Step 4: 实现配置驱动的领取 QR 区域**

  从现有 `footer.qr` 读取 `activeSlide.qrItemKey`；只有 `benefit` 非空且图片 URL 有效时渲染区域。第三页按配置读取 QR，显示领取说明、对勾、二维码和“添加领取”；图片 alt 使用 `国际物流咨询二维码` 等对应分类。

- [ ] **Step 5: 验证轮播定向测试通过**

  Run: `node --test scripts/home-legal-guides.test.mjs`（工作目录 `web`）
  Expected: 轮播交互和 QR 显示条件测试通过。

- [ ] **Step 6: 运行项目完整测试、类型检查和构建**

  依次运行（工作目录 `web`）：`npm test`、`npm run typecheck`、`npm run build`，每条命令都确认退出码为 0。
  Expected: 全量 Node 测试、类型检查和 Nuxt 生产构建均成功。

- [ ] **Step 7: 浏览器验证前台与后台**

  运行端口 `3002` 的项目并验证首页：自动轮播、悬停暂停、悬停指示点切换；在 `/admin/settings` 验证预设与自定义色编辑、非法 HEX 阻止保存、物流主题领取说明/QR 选择。若浏览器端检查依赖登录，报告实际可验证页面与阻塞项。

- [ ] **Step 8: 提交本任务**

  `git add` 仅列出本任务两个已修改文件（及实际需要改动的令牌文件），提交标题：`feat: 支持首页书本轮播悬停切换与领取二维码`。

## 完成前核对

- 对照规格验收标准逐条检查，不用测试通过替代功能核对。
- 执行完成检查前重新读取所有任务文件的 git diff，确认没有暂存或提交用户已有的其它文件。
- 最终报告四种主题色、轮播交互、国际物流 QR 行为、migration 是否已执行、验证命令结果和本地提交编号。
