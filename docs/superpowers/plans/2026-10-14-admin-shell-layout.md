# 后台左侧导航与共用布局实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将后台改为统一的左侧导航框架，并移除共用布局中的返回入口和用途型说明。

**Architecture:** 在 `admin` layout 内实现桌面固定侧栏与窄屏抽屉，导航项根据现有角色权限和路由配置生成。后台首页保留为侧栏入口；跨页面一致的页面间距、字段行和无内滚动编辑样式集中在后台样式中。

**Tech Stack:** Nuxt 4、Vue 3、TypeScript、Node.js `node:test`。

**Spec:** `docs/superpowers/specs/2026-10-14-admin-sidebar-simplification-design.md`

## Global Constraints

- 不删除数据库字段、接口字段、既有状态值、业务配置记录或权限规则。
- 共用布局移除“返回后台首页”和“返回官网首页”；后台首页从侧栏访问。
- 桌面使用固定左侧导航，窄屏使用可开关抽屉，父菜单可展开并高亮当前路径。
- 用途型副标题和说明移除；校验错误、只读提示、上传反馈和保存结果保留。
- 表单字段名与控件桌面横向排列，窄屏上下排列；多行文本框随内容增长且无内滚动条。

## Review Focus

- 不同角色看到不应访问的导航入口时仍不能访问路由；由 Task 1 的权限/导航一致性测试覆盖。
- 窄屏打开抽屉后导航、关闭和当前路由跳转可用；由 Task 1 的静态 DOM/CSS 断言及浏览器检查覆盖。
- 长文本编辑区增长时不产生内部滚动条；由 Task 1 的样式断言和浏览器检查覆盖。
- 后台首页不重复显示导航卡片用途说明；由 Task 1 的首页文案断言覆盖。
- 删除返回入口不会影响登录/退出与路由守卫；由 Task 1 的路由入口检查及现有权限测试覆盖。

---

### Task 1: 后台侧栏、响应式抽屉与首页入口

**Files:**
- Modify: `web/app/layouts/admin.vue`
- Modify: `web/app/pages/admin/index.vue`
- Modify: `web/app/assets/styles/main.css`（仅后台样式；若现有 scoped 样式足够则沿用现有文件）
- Create: `web/scripts/admin-layout.test.mjs`
- Test: `web/scripts/admin-permission.test.mjs`

**Interfaces:**
- Consumes: `useAdminSession`/现有角色状态、Nuxt 当前 route、现有后台路由。
- Produces: layout 内可访问的分组菜单、当前路由高亮、桌面侧栏和移动抽屉；保留现有各页面路由。

- [ ] **Step 1: 写失败测试**：新增 `admin-layout.test.mjs`，断言布局包含所有设计稿管理入口、品牌/律所等菜单分组和移动抽屉控制，不含两个返回文案；断言首页不含用途型导航说明；断言管理员专属用户入口保留现有权限约束。
- [ ] **Step 2: 运行测试确认失败**：在 `web` 目录运行 `node --test scripts/admin-layout.test.mjs`，预期因现有返回链接和卡片式首页而失败。
- [ ] **Step 3: 实现侧栏布局**：在 `web/app/layouts/admin.vue` 配置分组菜单、按路径高亮、可展开子菜单和移动抽屉；复用当前 session/角色判断；移除右上返回入口。`web/app/pages/admin/index.vue` 保留必要后台首页功能，删除重复导航卡片和用途说明。
- [ ] **Step 4: 运行针对性验证**：运行 `node --test scripts/admin-layout.test.mjs scripts/admin-permission.test.mjs`，预期全部通过；在 `main.css` 或 layout scoped CSS 为桌面侧栏、窄屏抽屉及关闭滚动容器内滚动条提供样式。
- [ ] **Step 5: 浏览器验收**：启动项目，检查桌面导航、高亮、子菜单和窄屏抽屉开关；检查 `/admin` 和至少一个子页面之间切换。
- [ ] **Step 6: 提交**：仅暂存本任务文件，提交标题使用 `feat: 增加后台左侧导航布局`。

### Task 2: 共用表单布局与后台说明清理

**Files:**
- Modify: `web/app/assets/styles/main.css` 或 `web/app/layouts/admin.vue` 的后台 scoped CSS
- Modify: `web/app/pages/admin/settings.vue`
- Modify: `web/app/pages/admin/articles.vue`
- Modify: `web/app/pages/admin/cases.vue`
- Modify: `web/app/pages/admin/users.vue`
- Modify: `web/app/pages/admin/review.vue`
- Modify: `web/app/pages/admin/media.vue`
- Modify: `web/app/pages/admin/login.vue`
- Modify: `web/app/components/admin/AdminEntityManager.vue`
- Modify: `web/app/components/admin/AdminRichTextEditor.vue`
- Create: `web/scripts/admin-form-layout.test.mjs`

**Interfaces:**
- Consumes: 各页现有字段和校验/上传/保存状态。
- Produces: 统一字段标签与控件横排样式、窄屏纵排样式、多行编辑自动增高且无内部滚动条；保留必要反馈。

- [ ] **Step 1: 写失败测试**：断言后台首页、站点设置、首页业务、文章、案件、用户、审核、媒体、品牌/律所和登录页不再展示用途型副标题/说明，表单采用统一 row 样式，textarea 不设置固定高度滚动；同时断言审核队列状态、校验、只读、上传和保存反馈节点仍存在。
- [ ] **Step 2: 运行测试确认失败**：`node --test scripts/admin-form-layout.test.mjs`，预期当前说明文案和多行框样式触发失败。
- [ ] **Step 3: 应用共享样式与说明清理**：在后台公共样式中设置字段 label/control 两列及窄屏断点；`AdminRichTextEditor.vue` 和原生 textarea 采用随内容增长的输入高度并隐藏内部滚动条；逐页删除纯用途说明，不删除业务字段标签或反馈信息。审核队列的待核验/确认/驳回流程字段保留。
- [ ] **Step 4: 运行测试确认通过**：再次运行 `node --test scripts/admin-form-layout.test.mjs`，并检查断言保留的反馈文案。
- [ ] **Step 5: 提交**：仅暂存本任务文件，提交标题使用 `style: 统一后台表单排版与说明`。

