# 后台站点与业务配置精简实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将站点配置与首页业务范围配置整理为业务人员可直接维护的字段，并保留既有 API 数据兼容。

**Architecture:** 站点设置沿用现有四标签分组和中文字段名，去除配置状态与用途解释；团队业务配置仅显示板块标题和子项标题，排序通过相邻上移/下移操作完成。保存时沿用加载到的内部属性，服务端接口与数据库结构不变。

**Tech Stack:** Nuxt 4、Vue 3、TypeScript、Node.js `node:test`。

**Spec:** `docs/superpowers/specs/2026-10-14-admin-sidebar-simplification-design.md`

## Global Constraints

- 不删除数据库字段、接口字段、既有状态值或配置记录。
- 配置页面不显示状态控件；普通编辑要保留服务端记录的原状态。
- 团队业务配置只显示板块标题、子项标题和上移/下移；按钮紧邻对应标题。
- 不显示副标题、板块说明、业务块图标、子项说明、排序数字、Slug、详情链接、显示详情链接开关或“移除本次提交”。
- 保留校验错误、上传反馈和保存结果；标签和内容横向排列，窄屏自动纵排。

## Review Focus

- 编辑只改标题时不能清空隐藏的内部字段；由 Task 2 的保存 payload 测试验证。
- 新建板块/子项仍获得服务端要求的标识与默认属性；由 Task 2 的配置归一化/保存接口测试验证。
- 重排后公开业务范围顺序一致，不能因隐藏数字排序字段而失序；由 Task 2 的排序测试验证。
- 站点配置去掉状态控件时，不能改变记录状态；由 Task 1 的更新 payload 测试验证。
- 空标题或最后一个子项删除边界要有清晰行为；由 Task 2 的 UI/保存校验测试覆盖。

---

### Task 1: 站点设置分组与字段简化

**Files:**
- Modify: `web/app/pages/admin/settings.vue`
- Modify: `web/scripts/admin-settings.test.mjs`
- Test: `web/scripts/site-settings-consolidation.test.mjs`

**Interfaces:**
- Consumes: 当前站点设置四标签结构、既有站点设置 API 与中文字段映射。
- Produces: 只显示业务需要字段和值的设置界面；现有上传、校验和保存结果继续工作。

- [ ] **Step 1: 写/调整失败测试**：在 `admin-settings.test.mjs` 增加断言，确保表单无状态字段、用途型组说明已移除、关键设置仍按四标签出现且保存不提交修改过的状态。
- [ ] **Step 2: 运行测试确认失败**：`node --test scripts/admin-settings.test.mjs scripts/site-settings-consolidation.test.mjs`，预期状态和说明断言失败。
- [ ] **Step 3: 精简站点设置 UI**：清理状态选择器、字段帮助说明和无关嵌套；每项中文字段名与编辑控件同行；在保存 payload 中保留读取到的原状态值及当前未修改的内部字段。
- [ ] **Step 4: 验证**：运行上述两个测试文件，预期通过；验证上传组件禁用状态、保存反馈和现有四标签不回归。
- [ ] **Step 5: 提交**：仅暂存相关文件，提交标题使用 `style: 精简站点设置字段布局`。

### Task 2: 团队业务范围标题编辑与相邻排序控制

**Files:**
- Modify: `web/app/pages/admin/services.vue`
- Modify: `web/server/utils/admin/settings-queries.ts`（仅在测试证明现有归一化无法为隐藏字段提供兼容默认值时修改）
- Modify: `web/scripts/admin-settings.test.mjs`
- Create: `web/scripts/admin-services-ui.test.mjs`

**Interfaces:**
- Consumes: `services` 配置 API 返回的板块/子项完整对象。
- Produces: 仅标题可见可编辑的服务配置；顺序按界面数组保存，隐藏字段与原状态继续保留。

- [ ] **Step 1: 写失败测试**：检查业务配置页只出现板块标题和子项标题字段；无副标题、说明、图标、排序值、状态、Slug、详情链接及“移除本次提交”；每个标题后有上移/下移操作；测试保存保留原有隐藏属性并按新顺序提交。
- [ ] **Step 2: 运行测试确认失败**：`node --test scripts/admin-services-ui.test.mjs scripts/admin-settings.test.mjs`，预期因现有表单字段/删除按钮而失败。
- [ ] **Step 3: 精简业务范围编辑器**：在 `services.vue` 删除非标题表单控件和“移除本次提交”；为板块和子项标题行提供紧邻的上移/下移按钮，继续支持新增能力；更新时从原始对象复制隐藏属性，只替换标题及必要的顺序信息，不向用户呈现内部字段。
- [ ] **Step 4: 验证接口兼容与排序**：运行两个针对性测试，确认现有 API payload 的 ID/Slug/状态/图标等隐藏属性保留、顺序数组正确。
- [ ] **Step 5: 提交**：仅暂存相关文件，提交标题使用 `style: 精简首页业务范围配置`。

