# 后台用户与权限管理实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `/admin/users` 占位页替换为不含邮箱字段的可用后台账号管理页面。

**Architecture:** 复用现有用户管理 API、权限中间件和后台视觉组件，在单页内完成列表筛选、侧边表单的新建/编辑、删除确认和反馈状态。数据库、迁移、服务端接口与角色矩阵不改，服务端继续作为最终权限边界。

**Tech Stack:** Nuxt 4、Vue 3、TypeScript、现有 `useAdminSession` / `useRequestFetch`、Node `node:test`。

**Spec:** `docs/superpowers/specs/2026-10-12-admin-user-management-design.md`

## Global Constraints

- 用户管理字段不包含邮箱。
- 角色仅允许 `admin`、`editor`、`viewer`；只有 `admin` 可访问用户管理页面。
- 用户名创建后不可修改；密码不回显、不写日志、不出现在成功提示。
- 继续使用现有 `/api/admin/users` 和 `/api/admin/users/:id` 接口，不新增数据库表或 API。
- 每个小改动单独提交，提交标题使用中文正文并保留英文类型前缀。

## Review Focus

- 接口返回多角色时列表只展示一次账号并显示全部角色；由用户列表渲染测试覆盖。
- 新建或编辑失败时后端中文错误可见且表单不丢失；由请求错误状态测试覆盖。
- 编辑密码留空时请求体不包含密码；由编辑提交测试覆盖。
- 当前账号或最后一个管理员执行危险操作时，页面尊重后端拒绝并刷新错误；由删除/编辑错误反馈测试覆盖。
- 编辑和删除期间重复点击不能产生重复请求；由按钮禁用状态检查覆盖。

### Task 1: 建立用户管理页面回归测试

**Files:**
- Modify: `web/scripts/runtime-config.test.mjs`
- Test: `web/app/pages/admin/users.vue`

**Interfaces:**
- Consumes: 现有用户页面源码与既有静态回归测试。
- Produces: 页面必须调用四个现有账号 API 动作，字段中不得出现邮箱，必须包含角色/状态控件与删除确认文案。

- [ ] **Step 1: Write the failing test**

  增加测试读取 `web/app/pages/admin/users.vue`，断言页面引用 `GET/POST/PUT/DELETE /api/admin/users`，包含 `admin/editor/viewer` 角色和 `active/disabled` 状态，且不包含 `email`、`AdminPlaceholder`。

- [ ] **Step 2: Run test to verify it fails**

  Run: `node --test scripts/runtime-config.test.mjs`
  Expected: 新增用户页面测试失败，因为当前文件仍为占位页。

- [ ] **Step 3: Commit**

  ```bash
  git add web/scripts/runtime-config.test.mjs
  git commit -m "test: 补充用户管理页面回归约束"
  ```

### Task 2: 实现用户列表、筛选与状态反馈

**Files:**
- Modify: `web/app/pages/admin/users.vue`

**Interfaces:**
- Consumes: `GET /api/admin/users?keyword=&role=&status=` 返回 `{ data, meta }`。
- Produces: 响应式 `users` 列表、关键词/角色/状态筛选、加载/空态/错误/成功提示和管理员只读边界。

- [ ] **Step 1: Implement list state and fetch**

  使用 `useRequestFetch`、`useAdminSession`、`ref/computed`；以用户名、显示名、角色标签、状态、最近登录、创建时间渲染表格，完全不读取或显示邮箱。

- [ ] **Step 2: Implement filters**

  关键词、角色、状态分别映射到现有查询参数；查询触发重新加载，重置清空筛选并重新加载。

- [ ] **Step 3: Run focused test**

  Run: `node --test scripts/runtime-config.test.mjs`
  Expected: Task 1 的页面结构断言通过。

- [ ] **Step 4: Commit**

  ```bash
  git add web/app/pages/admin/users.vue
  git commit -m "feat: 实现后台用户列表与筛选"
  ```

### Task 3: 实现新建、编辑、重置密码和删除

**Files:**
- Modify: `web/app/pages/admin/users.vue`

**Interfaces:**
- Consumes: `POST /api/admin/users`、`PUT /api/admin/users/:id`、`DELETE /api/admin/users/:id` 及其中文错误响应。
- Produces: 侧边表单、角色多选、启停用状态、删除确认、请求期间禁用和成功后刷新列表。

- [ ] **Step 1: Add form state and validation**

  新建表单包含用户名、显示名、初始密码、角色、状态；编辑表单将用户名设为只读，密码为空表示不提交；不创建邮箱字段。

- [ ] **Step 2: Add submit actions**

  新建提交完整字段；编辑仅提交可编辑字段并在密码非空时附加密码；删除前使用确认对话框，所有写操作成功后重新调用列表接口。

- [ ] **Step 3: Add failure and concurrency feedback**

  展示后端中文错误，提交/删除期间禁用相关按钮，关闭或取消表单时清理临时密码和错误状态。

- [ ] **Step 4: Run focused test**

  Run: `node --test scripts/runtime-config.test.mjs`
  Expected: 页面包含四个 API 动作、无邮箱字段、角色和状态控件断言通过。

- [ ] **Step 5: Commit**

  ```bash
  git add web/app/pages/admin/users.vue
  git commit -m "feat: 完成后台用户账号管理操作"
  ```

### Task 4: 全量验证与页面预览

**Files:**
- Verify: `web/app/pages/admin/users.vue`
- Verify: `web/scripts/runtime-config.test.mjs`

- [ ] **Step 1: Run complete checks**

  Run: `npm run test` and `npm run typecheck` from `D:\WebstormProjects\daxin\web`.
  Expected: 全部测试通过，类型检查退出码为 0。

- [ ] **Step 2: Verify dev page**

  Keep the existing Nuxt server on port 3002 running and verify `/admin/users` redirects unauthenticated visitors to `/admin/login`; with an admin session, verify the page shows the account list and “新建账号” entry.

- [ ] **Step 3: Commit any verification-only fixes**

  Only if checks expose a real issue, add a focused fix commit using the project’s Chinese commit convention.

