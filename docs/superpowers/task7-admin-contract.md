# Task 7 后台配置与内容管理契约

本文件固定后台接口与页面结构。多个实现并行，**函数签名、路径、权限码与响应结构以本文件为准**。

复用既有约定：响应 `{ data, meta?, error? }`；错误用 `setResponseStatus` + `{ error: { code, message } }`（中文）；
权限用 `requireAdmin(event, '<权限码>')`；SQL 全部参数化（`queryTarget` / `withTargetTransaction`）；
每个写操作都要写 `admin_audit_logs`。

## 权限码

| 域 | 读取 | 写入 |
| --- | --- | --- |
| 站点配置 | `settings:read` | `settings:write` |
| 内容（文章/案例/品牌/律所） | `<domain>:read` | `<domain>:write` |
| 媒体 | `media:read` | `media:write` |
| 核验队列 | `review:read` | `review:write` |
| 账号与角色 | `admin:user:read` | `admin:user:write` |

`admin` 为 `*` 全量；`editor` 有内容/媒体/配置/核验的读写，没有 `admin:user:*`；
`viewer` 只有各域的 `:read`。**只读角色调用任何写接口必须 403。**

## 一、站点配置：`/api/admin/settings`

配置分散在三类表，用 `kind` 区分，单一入口便于后台一次性保存：

### `GET /api/admin/settings?kind=<kind>` → `{ data: { kind, items } }`

| kind | 数据源 | item 结构 |
| --- | --- | --- |
| `site` | `site_settings`（`setting_group='general'`） | `{ key, value, valueType, mediaId, mediaUrl, status }` |
| `home` | `site_settings`（`setting_group='home'`） | 同上 |
| `about` | `site_settings`（`setting_group='about'`） | 同上 |
| `seo` | `site_settings`（`setting_group='seo'`） | 同上 |
| `services` | `service_sections` + `service_items` | `{ id, slug, title, subtitle, summary, iconKey, linkPath, showDetailLink, sortOrder, status, items: [{ id, slug, title, summary, sortOrder, status }] }` |
| `footer` | `footer_services` + `footer_links` | `{ id, itemKey, title, linkPath, sortOrder, status, kind: 'service' \| 'link' }` |
| `contact` | `contact_channels` | `{ id, itemKey, channelType, label, value, sortOrder, status }` |
| `qr` | `qr_assets` | `{ id, itemKey, title, mediaId, mediaUrl, caption, sortOrder, status }` |

`mediaUrl` 由 `media_assets.public_url` 联表取得。读接口用 `settings:read`。

### `PUT /api/admin/settings` → `{ data: { kind, saved } }`

Body：`{ kind, items }`，`items` 为该 kind 对应的数组。用 `settings:write`。

- `site/home/about/seo`：按 `setting_key` upsert 到 `site_settings`。
  **版本策略**：同一 `setting_key` 已存在 `is_current=1` 的行时，就地更新该行并把 `version` 加一，
  不新增行——保持「一个 key 一行当前值」，避免后台每保存一次就堆积历史行。
- `services`：按 `id` 或 `slug` upsert `service_sections`，其 `items` 按 `id` 或 `slug` upsert
  `service_items`（`section_id` 关联）；不删除未出现的子项，只更新提交的。
- `footer` / `contact` / `qr`：按 `itemKey` upsert。
- 所有 upsert 都要写审计日志（`action: 'settings_update'`，`entityType: 'settings'`，
  `note` 含 kind 与变更条数，`before`/`after` 放脱敏后的关键字段）。

## 二、内容管理

统一列表分页规则与公开接口一致：`page >= 1`、`pageSize` 1..48（默认 20），
越界页返回空数组并夹到最后一页。

### 文章 `/api/admin/articles`

- `GET /api/admin/articles?keyword&categoryId&status&page&pageSize` → `{ data, meta }`
  item：`{ id, slug, title, summary, categoryId, categoryName, publishedAt, status, isFeatured, updatedAt }`
  权限 `article:read`。
- `GET /api/admin/articles/[id]` → `{ data: { article } }`，含 `contentHtml`（**原样返回，不清洗**：
  后台编辑需要看到原始内容；公开接口才清洗）。权限 `article:read`。
- `POST /api/admin/articles` → 新建，body `{ title, slug?, summary?, contentHtml?, categoryId?, publishedAt?, status?, isFeatured? }`。
  `slug` 缺省时由标题生成，冲突时追加来源后缀保证唯一。权限 `article:write`。
- `PUT /api/admin/articles/[id]` → 更新同上字段（`slug` 可改，需保证唯一）。权限 `article:write`。
- `DELETE /api/admin/articles/[id]` → 软处理：把 `status` 置为 `archived`（不物理删除，
  迁移来源与图片关联需要保留）。权限 `article:write`。

### 案件 `/api/admin/cases`

- `GET /api/admin/cases?keyword&status&page&pageSize` → item：
  `{ id, caseNumber, filedAt, plaintiff, lawFirm, brand, court, caseType, status, publishStatus, updatedAt }`。
- `GET /api/admin/cases/[id]`、`PUT /api/admin/cases/[id]`、`POST /api/admin/cases`。
  可写字段：`caseNumber, filedAt, plaintiff, court, title, summary, status, publishStatus`，
  以及关联 `brandId`、`lawFirmId`、`ipTypeId`（写入 `case_brands` / `case_law_firms` / `case_ip_types`，
  按 id 覆盖式替换该案件的对应关联）。
- **侵权类型**：`ip_types` 只有 `trademark/copyright/patent/unknown`。
  后台把某案件的类型从 `unknown` 改成真实类型时，必须同时更新 `case_ip_types`（替换关联）。
- `DELETE` 同为归档（`publish_status='archived'`）。

### 品牌 `/api/admin/brands`、律所 `/api/admin/law-firms`

- 列表 + 详情 + 新建 + 更新 + 归档；可写字段 `slug, name, nameEn, aliases, region(仅律所), summary, status`。
- `caseCount` 只读，由关联表统计得出，**不接受后台直接写入**（避免与真实关联不一致）。

## 三、核验队列 `/api/admin/review`

- `GET /api/admin/review?status=open|confirmed|rejected&entityType&page&pageSize` → item：
  `{ id, entityType, legacySourceTable, legacySourceId, fieldName, candidateValue, normalizedValue, contextSnippet, confidence, status, resolvedAt, resolutionNote }`。权限 `review:read`。
- `PUT /api/admin/review/[id]` → body `{ status: 'confirmed'|'rejected', resolutionNote?, applyValue? }`。
  权限 `review:write`。写 `resolved_by`/`resolved_at`/`resolution_note`，并写审计日志。
  `applyValue` 为可选：当 `entityType='case'` 且 `fieldName` 属于 `plaintiff`/`filedAt` 时，
  把确认值写回对应 `cases` 行（`plaintiff` 或 `filed_at`），实现「确认即落库」。

## 四、媒体列表 `/api/admin/media`

- `GET /api/admin/media?keyword&usageScope&page&pageSize` → item：
  `{ id, objectKey, publicUrl, fileName, mimeType, byteSize, width, height, usageScope, title, createdAt }`。
  权限 `media:read`。`DELETE` 为设置 `deleted_at`（软删除），权限 `media:write`。
- 上传走已实现的 `POST /api/admin/upload-policy` 与 `POST /api/admin/media`，本任务补列表与删除。

## 五、后台页面

| 页面 | 内容 |
| --- | --- |
| `web/app/pages/admin/index.vue` | 已存在，仅需补齐缺失入口（配置、内容、核验、媒体） |
| `web/app/pages/admin/settings.vue` | 站点/首页/关于/SEO 文案表单（key-value），支持图片字段接 `useOssUpload` |
| `web/app/pages/admin/services.vue` | 业务板块与子项编辑（Core 业务四块 + 子项增删改） |
| `web/app/pages/admin/footer.vue` | 页脚业务项、导航链接、联系渠道、二维码 |
| `web/app/pages/admin/articles.vue` | 文章列表 + 新建/编辑（标题、slug、分类、摘要、正文 HTML、发布状态） |
| `web/app/pages/admin/cases.vue` | 案件列表 + 编辑（六列字段 + 品牌/律所/侵权类型关联 + 发布状态） |
| `web/app/pages/admin/brands.vue` / `law-firms.vue` | 品牌/律所列表与编辑 |
| `web/app/pages/admin/review.vue` | 核验队列：按状态筛选、确认/驳回、可回填案件字段 |
| `web/app/pages/admin/media.vue` | 已存在，补列表与删除 |

页面要求：

- 所有页面 `definePageMeta({ layout: 'admin', middleware: 'admin' })`。
- 列表必须有分页控件，且用服务端返回的 `meta.total/totalPages`，不自行估算。
- `viewer` 角色进入写操作界面时，保存按钮必须**禁用并给出中文说明**，而不是等接口返回 403。
- 保存成功/失败都要有明确的中文反馈；失败显示接口返回的 `error.message`。
- 复用现有 `BaseButton` / `BaseCard` / `PageContainer` / `ErrorState` 与 `tokens.css` 变量。

## 六、种子数据

新增 `tools/seed-site-config.mjs`：把当前写死的首页/关于/业务/页脚/联系/二维码配置
写入上述表，使 Task 8 能改为读取数据库配置。要求：

- 幂等：按 `setting_key` / `slug` / `item_key` upsert，可重复运行。
- 数据来源保持与 `web/app/config/homeContent.ts`、`businessContent.ts`、
  `contentSections.ts`、`contactQr.ts`、`config/site.ts` 一致（这些文件里的文案是甲方需求文档原文，
  不得改写业务含义）。
- 支持 `--dry-run` 只打印将要写入的内容。
