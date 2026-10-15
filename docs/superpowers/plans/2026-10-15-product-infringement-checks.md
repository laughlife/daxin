# 产品侵权检测记录功能实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把产品侵权检测表单接入新库 `daxin`，并为管理员提供可分页查看的提交记录页面。

**Architecture:** 新建专用数据表和公开 POST 接口，公开端只提交、不提供读取；后台接口单独执行管理员权限校验并复用现有分页规则。官网表单在服务器确认写入后显示成功，后台新菜单显示记录；隐私说明同步披露保存与访问范围。

**Tech Stack:** Nuxt 4、Vue 3、Nitro/H3、MySQL 8、Node.js `node:test`、项目现有后台 `AdminPager`。

**Spec:** `docs/superpowers/specs/2026-10-15-product-infringement-checks-design.md`

## Global Constraints

- 只在新数据库 `daxin` 新增独立表；不修改旧库 `da` 或清理现有业务数据。
- 数据表为 `product_infringement_checks`；迁移编号 `019`。
- 必填字段：品牌名称、产品名称、联系人、电话或微信；备注可选且最多 2,000 字符。
- 公开 API 只写入，不提供公开列表或详情；后台记录读取仅限管理员角色。
- 后台每页档位为 `10 / 20 / 30 / 40 / 50`，默认 20、上限 50；按 `created_at DESC, id DESC` 排序。
- 不记录原始 IP、用户代理或表单个人信息到应用日志；写 SQL 必须使用绑定参数。
- 首版不增加编辑、删除、导出、状态流转或自动清理功能。
- 每个任务独立测试并立即提交；提交标题使用中文正文和 `feat:`、`fix:` 或 `test:` 类型前缀。只暂存当前任务文件，不 push、不 merge。

## Review Focus

- 全空格必填值：服务端应拒绝并提示修正；由 Task 2 的 API 校验测试覆盖。
- 字段恰好达到上限与超过上限：边界长度允许，超限返回 `400`；由 Task 2 的 API 校验测试覆盖。
- 数据库写入失败：不返回成功，客户端保留填写内容并展示通用错误；由 Task 2 的接口与页面状态测试覆盖。
- 未登录或非管理员读取记录：不能访问记录数据；由 Task 3 的权限测试覆盖。
- 空表、越界页和最后一页：响应遵循公共分页窗口规则，不产生 `0/N` 或 `N/N` 异常；由 Task 3 的分页测试覆盖。

---

### Task 1: 新建提交记录表

**Files:**
- Create: `database/migrations/019_product_infringement_checks.sql`
- Modify: `tools/migrate-legacy/schema-check.mjs`
- Test: `web/scripts/infringement-checks.test.mjs`

**Interfaces:**
- Produces: `product_infringement_checks(id, brand_name, product_name, contact_name, contact_method, remark, created_at)`，供 Task 2 和 Task 3 使用。

- [ ] **Step 1: 写失败的迁移约束测试**

  在 `web/scripts/infringement-checks.test.mjs` 增加测试：迁移创建专用表及七个设计字段，使用 InnoDB/utf8mb4 并为提交时间和 id 建索引；`schema-check.mjs` 将表、组合索引和四个应用层必填字段纳入结构校验；断言迁移不包含 `DROP`、`TRUNCATE`、`DELETE` 或对旧表的改写。

- [ ] **Step 2: 运行测试并确认失败**

  Run: `cd web; node --test scripts/infringement-checks.test.mjs`
  Expected: FAIL，因为迁移文件尚不存在。

- [ ] **Step 3: 创建迁移**

  在 `database/migrations/019_product_infringement_checks.sql` 创建符合 Spec 的表。`brand_name VARCHAR(120)`、`product_name VARCHAR(160)`、`contact_name VARCHAR(80)`、`contact_method VARCHAR(120)` 均为非空；`remark TEXT NULL`；`created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`；使用 InnoDB、utf8mb4，并添加 `(created_at, id)` 索引。在 `schema-check.mjs` 把该表加入必需表与组合索引清单，把四个必填字段加入可由应用层提供的非空字段清单。

- [ ] **Step 4: 运行迁移测试**

  Run: `cd web; node --test scripts/infringement-checks.test.mjs`
  Expected: PASS。

- [ ] **Step 5: 提交本任务**

  ```bash
  git add database/migrations/019_product_infringement_checks.sql tools/migrate-legacy/schema-check.mjs web/scripts/infringement-checks.test.mjs
  git commit -m "feat: 新增产品侵权检测记录表"
  ```

### Task 2: 公开提交接口、表单状态与隐私说明

**Files:**
- Create: `web/server/api/public/infringement-check.post.ts`
- Modify: `web/app/pages/infringement-check.vue`
- Modify: `web/app/components/content/LegalPage.vue`
- Test: `web/scripts/infringement-checks.test.mjs`

**Interfaces:**
- Consumes: Task 1 表结构。
- Produces: `POST /api/public/infringement-check` 接收 `{ brand, product, contactName, contactWay, remark }`；成功为 HTTP `201` 和 `{ ok: true }`，校验失败为 `400`，数据库失败为通用 `500`。

- [ ] **Step 1: 写公开提交的失败测试**

  扩展 `infringement-checks.test.mjs`：断言公开 POST 对五个字段做服务端必填/长度校验、空备注可写为 NULL、使用绑定参数插入、成功响应不带个人信息、错误日志/响应不拼接表单值；页面发出请求，具备等待/成功/错误状态，且不再包含指定的本地不保存提示；隐私页披露存储目的及管理员访问范围。

- [ ] **Step 2: 运行测试并确认失败**

  Run: `cd web; node --test scripts/infringement-checks.test.mjs`
  Expected: FAIL，因为接口尚不存在且表单仍只是本地校验。

- [ ] **Step 3: 实现公开写接口**

  在 `infringement-check.post.ts` 使用 H3 `readBody`、`setResponseStatus` 和现有 `queryTarget`。去除首尾空白后校验：品牌最多 120 字、产品最多 160 字、联系人最多 80 字、电话或微信最多 120 字、备注最多 2,000 字；必填值为空或任一字段超限均返回 `400`。通过绑定参数写入专用表，返回不含表单值的 `201 { ok: true }`。数据库错误仅记录固定的接口错误信息，不输出原始错误对象或请求体，向用户返回通用 `500`。

- [ ] **Step 4: 接入官网表单与更新隐私文案**

  在 `infringement-check.vue` 将 `onSubmit` 改为异步调用该 POST；提交期间禁用提交按钮并显示处理中状态；成功后展示“提交成功”，保留重新填写入口；失败时展示通用错误并保留表单字段。删除旧的本地校验注释及指定 notice，并移除过时的“只在浏览器校验、不保存”的成功文案。将 `LegalPage.vue` 隐私说明改为说明表单字段会保存到网站数据库，供有权限的后台管理员联系和处理检测申请。

- [ ] **Step 5: 运行公开提交测试**

  Run: `cd web; node --test scripts/infringement-checks.test.mjs`
  Expected: PASS。

- [ ] **Step 6: 提交本任务**

  ```bash
  git add web/server/api/public/infringement-check.post.ts web/app/pages/infringement-check.vue web/app/components/content/LegalPage.vue web/scripts/infringement-checks.test.mjs
  git commit -m "feat: 接入产品侵权检测表单提交"
  ```

### Task 3: 管理员分页 API 与专属读取权限

**Files:**
- Create: `web/server/api/admin/infringement-checks.get.ts`
- Modify: `web/server/utils/auth/permissions.ts`
- Test: `web/scripts/infringement-checks.test.mjs`

**Interfaces:**
- Consumes: Task 1 表结构；现有 `requireAdmin`、`queryTarget`、`resolvePageWindow` 和 `adminPageSize`。
- Produces: `GET /api/admin/infringement-checks?page=&pageSize=`，响应 `{ data: InfringementCheckRecord[], meta: { page, pageSize, total, totalPages } }`；记录含 `id, brand, product, contactName, contactWay, remark, createdAt`。

- [ ] **Step 1: 写后台权限与分页失败测试**

  扩展测试断言：路由要求 `product_infringement_check:read`；该权限仅 admin 具有；响应选取所需字段且不带内部信息；SQL 排序为 `created_at DESC, id DESC` 并绑定 LIMIT/OFFSET；分页复用现有窗口规则，页大小为 `10/20/30/40/50` 且默认 20/最大 50。

- [ ] **Step 2: 运行测试并确认失败**

  Run: `cd web; node --test scripts/infringement-checks.test.mjs`
  Expected: FAIL，因为权限和后台 API 尚不存在。

- [ ] **Step 3: 增加管理员专属读取权限**

  在 `permissions.ts` 增加 `product_infringement_check:read` 至 admin-only 权限列表，并在 `/admin/infringement-checks` 路径规则中指定同一权限。普通 `editor`、`viewer` 不获得该权限。

- [ ] **Step 4: 实现分页查询接口**

  在 `infringement-checks.get.ts` 调用 `requireAdmin(event, 'product_infringement_check:read')`；复用后台内容 GET 的鉴权错误响应、`resolvePageWindow` 和 `ADMIN_MAX_PAGE_SIZE` / `adminPageSize`。未传 `pageSize` 时默认 20；先查 COUNT，再按时间倒序取当前页；空表或越界页返回统一 meta 和空数组；接口内部错误以通用中文响应处理，不记录记录字段。

- [ ] **Step 5: 运行后台 API 测试**

  Run: `cd web; node --test scripts/infringement-checks.test.mjs`
  Expected: PASS。

- [ ] **Step 6: 提交本任务**

  ```bash
  git add web/server/api/admin/infringement-checks.get.ts web/server/utils/auth/permissions.ts web/scripts/infringement-checks.test.mjs
  git commit -m "feat: 增加侵权检测记录分页接口"
  ```

### Task 4: 后台菜单与只读分页列表

**Files:**
- Create: `web/app/pages/admin/infringement-checks.vue`
- Modify: `web/app/layouts/admin.vue`
- Test: `web/scripts/infringement-checks.test.mjs`

**Interfaces:**
- Consumes: Task 3 的 GET 响应和 Task 3 的 `product_infringement_check:read` 路由权限。
- Produces: 仅管理员可见的“产品侵权检测”菜单及 `/admin/infringement-checks` 只读列表，分页使用现有 `AdminPager`。

- [ ] **Step 1: 写后台页面与导航失败测试**

  扩展测试断言：菜单目标路径、管理员可见规则、页面调用指定 API、显示品牌/产品/联系人/电话或微信/备注/提交时间、页数和每页切换使用 `AdminPager`，且页面没有编辑、删除或导出操作。列表默认每页 20 条，选项使用统一 `ADMIN_PAGE_SIZE_OPTIONS`。

- [ ] **Step 2: 运行测试并确认失败**

  Run: `cd web; node --test scripts/infringement-checks.test.mjs`
  Expected: FAIL，因为新菜单和页面尚不存在。

- [ ] **Step 3: 增加管理员菜单项**

  在 `admin.vue` 菜单数组中增加 `{ label: '产品侵权检测', to: '/admin/infringement-checks', roles: ['admin'] }`，使用现有菜单权限过滤逻辑。

- [ ] **Step 4: 实现记录列表页**

  新页面声明 `layout: 'admin'` 和 `middleware: 'admin'`，通过 `useRequestFetch` 加载分页接口，使用 `ADMIN_PAGE_SIZE_OPTIONS` 与 `AdminPager`。列表按接口排序显示所有记录，备注正常换行；提供加载、错误、空列表状态，不出现业务状态或写操作。

- [ ] **Step 5: 运行页面与导航测试**

  Run: `cd web; node --test scripts/infringement-checks.test.mjs`
  Expected: PASS。

- [ ] **Step 6: 提交本任务**

  ```bash
  git add web/app/pages/admin/infringement-checks.vue web/app/layouts/admin.vue web/scripts/infringement-checks.test.mjs
  git commit -m "feat: 增加侵权检测记录后台页面"
  ```

### Task 5: 全量验证与本地浏览器检查

**Files:**
- No product-file changes unless a verified regression needs a focused fix.

**Interfaces:**
- Consumes: Tasks 1–4 的完整提交流程。
- Produces: 全量测试、类型检查、静态检查结果；在本机数据库可用时完成一次不含真实个人信息的端到端提交和后台读取验证。

- [ ] **Step 1: 运行全量测试**

  Run: `cd web; npm test`
  Expected: 所有 Node 测试通过。

- [ ] **Step 2: 运行类型与静态检查**

  Run: `cd web; npm run typecheck; npm run check:static`
  Expected: 两项均通过。

- [ ] **Step 3: 运行数据库迁移并做最小闭环验证（仅数据库服务可用时）**

  先只读检查 `daxin.schema_migrations`，确认 `019_product_infringement_checks.sql` 是唯一待执行迁移；若还有其他迁移待执行，暂停数据库写入并汇报。确认后使用 `node tools/migrate-legacy/schema-check.mjs --database daxin --apply` 应用迁移，不修改旧库 `da`，也不执行清表或删除语句。若环境允许，用虚构测试内容提交一条记录，确认成功响应及管理员第一页可查询；只按新记录的自增 id 清理这条测试数据，不触及其他记录或表。

- [ ] **Step 4: 打开页面核对**

  按用户持续偏好使用 3002 端口运行新项目，访问产品侵权检测页并检查表单提交状态；以管理员登录后打开后台菜单和分页列表。若数据库不可用，仍检查官网页面和后台空态，明确说明未完成数据库闭环验证。

- [ ] **Step 5: 汇报最终结果**

  汇报变更文件、各任务提交号、测试状态、迁移是否实际应用、数据库闭环是否验证，以及首页/表单/后台页面预览地址。
