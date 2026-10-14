# 后台内容与账号管理精简实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 隐藏文章、案件、用户、品牌和律所的普通状态管理字段，保留现有数据状态，并为文章编辑增加当前内容预览。

**Architecture:** 业务列表不展示状态筛选/状态列，编辑不暴露状态选项。已有记录保存时沿用原状态，新文章与新案件从草稿开始，并通过显式发布动作发布。文章预览以当前未保存内容组成公开页面样式，正文继续使用项目已有的安全清理流程。

**Tech Stack:** Nuxt 4、Vue 3、TypeScript、Node.js `node:test`。

**Spec:** `docs/superpowers/specs/2026-10-14-admin-sidebar-simplification-design.md`

## Global Constraints

- 不删除数据库/API 字段或现有状态值，不改变现有角色权限。
- 文章、案件、用户、品牌和律所不显示普通状态筛选、状态列或状态编辑控件。
- 普通编辑必须保留已加载记录的原状态；新文章/案件默认草稿并有显式发布动作；新账号默认启用。
- 文章预览采用当前未保存标题、摘要、图片和正文，不保存、不改状态、不离开编辑页。
- 保留必要校验和保存反馈；编辑文本区无内部滚动条。

## Review Focus

- 已发布内容普通保存不能意外降为草稿；由 Task 1/2 的 payload 回归测试覆盖。
- 新建内容默认草稿，显式发布才改为发布态；由 Task 1/2 的动作测试覆盖。
- 未保存文章预览不泄漏未净化 HTML；由 Task 1 的正文安全处理测试覆盖。
- 不同角色不能借助隐藏入口访问用户或编辑功能；由 Task 3 的权限测试覆盖。
- 品牌/律所记录更新不能因隐藏状态控件变更状态或破坏搜索/关联；由 Task 3 的更新测试覆盖。

---

### Task 1: 文章状态隐藏与未保存预览

**Files:**
- Modify: `web/app/pages/admin/articles.vue`
- Modify: `web/app/components/content/RichArticleBody.vue`（仅复用现有清理后的正文呈现能力，不放宽 HTML 安全处理）
- Modify: `web/scripts/admin-content.test.mjs`
- Create: `web/scripts/admin-article-preview.test.mjs`

**Interfaces:**
- Consumes: 文章 CRUD API、现有文章编辑状态、正文净化工具及公开文章样式。
- Produces: 普通保存保留现有状态；创建默认草稿；“发布文章”显式设置发布状态；可以预览当前未保存字段。

- [ ] **Step 1: 写失败测试**：覆盖列表无状态筛选/列、编辑表单无状态选择器、普通更新保留既有状态、新文章默认草稿、显式发布使用当前表单内容；预览包含未保存标题/摘要/图片/正文且不会触发保存或路由变化。
- [ ] **Step 2: 运行测试确认失败**：`node --test scripts/admin-content.test.mjs scripts/admin-article-preview.test.mjs`，预期当前状态字段和无预览按钮触发失败。
- [ ] **Step 3: 实现文章编辑动作**：隐藏状态筛选、列和字段；新建状态内部设为 draft；既有记录普通保存携带原状态；增加“发布文章”按钮并复用现有更新接口设置发布态。
- [ ] **Step 4: 实现未保存预览**：增加可关闭预览区域/弹层，以公开文章布局展示当前编辑状态；正文使用现有净化后的富文本渲染；不要在预览打开或关闭时提交数据。
- [ ] **Step 5: 验证**：运行两个针对性测试；检查预览的未保存数据和 HTML 清理断言均通过。
- [ ] **Step 6: 提交**：仅暂存相关文件，提交标题使用 `feat: 增加文章预览并精简状态管理`。

### Task 2: 案件状态控件隐藏与显式发布

**Files:**
- Modify: `web/app/pages/admin/cases.vue`
- Modify: `web/scripts/admin-content.test.mjs`
- Create: `web/scripts/admin-case-status-ui.test.mjs`

**Interfaces:**
- Consumes: 案件 CRUD API 和现有 publish status。
- Produces: 列表无状态筛选/列，普通编辑保持当前状态，新建草稿并可单独发布。

- [ ] **Step 1: 写失败测试**：断言无状态筛选、状态列和状态表单控件；断言新建 payload 为 draft、普通编辑沿用当前 publish status、显式“发布案例”操作更新为 published。
- [ ] **Step 2: 运行测试确认失败**：`node --test scripts/admin-case-status-ui.test.mjs scripts/admin-content.test.mjs`。
- [ ] **Step 3: 精简案件编辑器**：隐藏状态筛选、表格列和状态选择器；新建内部默认 draft；添加独立发布动作，普通保存不改已加载状态。
- [ ] **Step 4: 验证**：运行针对性测试，确认法院/品牌等案件字段及现有筛选功能未被改动。
- [ ] **Step 5: 提交**：仅暂存相关文件，提交标题使用 `style: 精简案件状态管理`。

### Task 3: 用户、品牌与律所状态字段隐藏

**Files:**
- Modify: `web/app/pages/admin/users.vue`
- Modify: `web/app/components/admin/AdminEntityManager.vue`
- Modify: `web/scripts/admin-permission.test.mjs`
- Modify: `web/scripts/admin-content.test.mjs`
- Create: `web/scripts/admin-entity-status-ui.test.mjs`

**Interfaces:**
- Consumes: 现有用户、品牌、律所列表/更新 API 和角色能力。
- Produces: 管理界面不显示状态筛选、状态列或状态切换；新用户默认 active；现有用户/实体状态由原记录保留。

- [ ] **Step 1: 写失败测试**：断言用户和通用实体管理器不展示状态过滤/表单/列表字段；新用户提交 active；既有用户、品牌和律所更新请求保留原状态；普通用户仍不能访问用户管理。
- [ ] **Step 2: 运行测试确认失败**：`node --test scripts/admin-entity-status-ui.test.mjs scripts/admin-permission.test.mjs scripts/admin-content.test.mjs`。
- [ ] **Step 3: 精简管理界面**：移除状态筛选、列、选择器及由状态切换导致的归档操作；新建用户状态内部默认为 active；编辑既有用户或实体时沿用 API 返回的原状态。
- [ ] **Step 4: 验证**：运行三组测试；确认搜索、分页、角色权限、删除及实体关联功能仍保留。
- [ ] **Step 5: 提交**：仅暂存相关文件，提交标题使用 `style: 隐藏用户与实体状态字段`。

### Task 4: 全量验证与管理端浏览器验收

**Files:**
- Verify: `web/scripts/*.test.mjs`
- Verify: `web/app/pages/admin/**` 和 `web/app/layouts/admin.vue`

**Interfaces:**
- Consumes: 前三项已实现的后台页面。
- Produces: 测试、类型检查、构建和关键后台路径的验收记录。

- [ ] **Step 1: 运行完整测试套件**：在 `web` 运行 `npm test`，预期退出码 0。
- [ ] **Step 2: 运行类型检查与构建**：运行 `npm run typecheck` 和 `npm run build`，预期均成功。
- [ ] **Step 3: 浏览器验收**：检查 `/admin`、`/admin/settings`、`/admin/services`、`/admin/articles`、`/admin/cases`、`/admin/users`；确认左侧导航/移动抽屉、表单布局、无状态字段、文章预览、发布动作和权限行为。
- [ ] **Step 4: 提交验证修正**：若验收发现问题，按 AGENTS.md 仅暂存对应修复文件并使用中文说明提交；没有新变更时不创建空提交。

