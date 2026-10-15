# Task 6 数据层契约（公开 API 与仓储）

本文件是 Task 6 的接口契约。多个实现并行进行，**所有函数签名、返回字段和分页规则以本文件为准**，
不要擅自改名或改动字段。类型定义复用 `web/app/types/content.ts` 现有类型，并新增 `web/app/types/api.ts`。

## 通用约定

- 所有公开接口为 `GET`，无需登录，统一返回 `{ data, meta?, error? }`。
- `web/app/types/api.ts` 导出：

```ts
export interface ApiError { code: string; message: string }
export interface ApiMeta { page?: number; pageSize?: number; total?: number; totalPages?: number }
export interface ApiResult<T> { data?: T; meta?: ApiMeta; error?: ApiError }
```

- 分页参数统一为 `page`（从 1 开始）与 `pageSize`（默认 12，**服务端上限 48**）。
  服务端必须把 `page` 与 `pageSize` 夹到合法范围，避免出现 `999/3`、`4/3` 这类越界显示。
  越界页码返回空数组并把 `meta.page` 夹到最后一页，不报错。
- 列表接口一律**隐藏内部迁移字段**：不得返回 `migration_batch_id`、`legacy_source_table`、
  `legacy_source_id`、`migration_item_key`、`verified_at`、`is_recent` 等内部列。
- 所有查询必须参数化（`queryTarget`，`?` 占位符）。禁止字符串拼接 SQL。
- 服务端输出日期：`filedAt` 用 `YYYY-MM-DD`（可空），`publishedAt` 用 `YYYY-MM-DD`。

## 仓储统一入口

`web/app/repositories/` 下每个领域一个文件，页面**只**通过这些文件取数，不得直接 `$fetch` 接口、
不得再 import `~/data/mock/*`。所有导出函数签名如下（都返回已归一化好的领域类型）：

### `web/app/repositories/home.ts`
```ts
export interface HomeData {
  stats: unknown[]            // 暂时由页面既有 mock 兜底，接口未接入前返回 []
  featuredCases: CaseRecord[] // 首页成功案例预览，最多 6 条
  recentArticles: ArticleRecord[] // 推荐阅读，最多 6 条
}
export function fetchHomeData(): Promise<HomeData>
```
对应 `GET /api/public/home` → `{ data: { featuredCases, recentArticles } }`。

### `web/app/repositories/cases.ts`
```ts
export interface CaseQuery {
  keyword?: string      // 案件号 / 原告 / 品牌 / 律所
  caseType?: CaseType   // trademark | patent | copyright
  state?: string        // 起诉州；无对应数据时忽略
  from?: string         // 起诉时间起（YYYY-MM-DD）
  to?: string           // 起诉时间止（YYYY-MM-DD）
  page?: number
  pageSize?: number
}
export interface CasePage { items: CaseRecord[]; total: number; page: number; pageSize: number; totalPages: number }
export function fetchCases(query: CaseQuery): Promise<CasePage>
export function fetchCaseDetail(slug: string): Promise<CaseRecord | null>
```
对应：
- `GET /api/public/cases` → `{ data: CaseRecord[], meta: { page, pageSize, total, totalPages } }`
- `GET /api/public/cases/[id]` → `{ data: CaseRecord }` 或 404 `{ error }`

`CaseRecord` 必须满足 `web/app/types/content.ts` 现有字段：
`id`、`caseNumber`、`filedAt`、`lawFirm`、`plaintiffBrand`、`state`、`caseType`、`caseTypes`、
`plaintiffName`、`category`、`status`、`summary`、`tags`、`isRecent`、`slug`、`source?`。
`slug` 统一取 `caseNumber.toLowerCase()`（与详情页路由 `/tro/cases/{slug}` 一致）。
`id` 取数据库主键的字符串形式。`isRecent` 表示 `filed_at` 在最近 3 天内（北京时间），无数据时为 `false`。

### `web/app/repositories/entities.ts`
```ts
export interface BrandSummary { slug: string; name: string; description: string; caseCount: number }
export interface FirmSummary { slug: string; name: string; description: string; caseCount: number }
export function fetchBrands(): Promise<BrandSummary[]>
export function fetchBrandDetail(slug: string): Promise<{ brand: BrandSummary; cases: CaseRecord[] } | null>
export function fetchLawFirms(): Promise<FirmSummary[]>
export function fetchLawFirmDetail(slug: string): Promise<{ firm: FirmSummary; cases: CaseRecord[] } | null>
```
对应 `GET /api/public/brands`、`GET /api/public/brands/[slug]`、
`GET /api/public/law-firms`、`GET /api/public/law-firms/[slug]`。

### `web/app/repositories/articles.ts`
```ts
export interface ArticleSummary {
  id: string; slug: string; title: string; category: string
  publishedAt: string; href: string; imageSrc: string | null; imageAlt: string
}
export interface ArticleQuery { category?: string; keyword?: string; from?: string; to?: string; page?: number; pageSize?: number }
export interface ArticlePage { items: ArticleSummary[]; total: number; page: number; pageSize: number; totalPages: number }
export function fetchArticles(query: ArticleQuery): Promise<ArticlePage>
export function fetchArticleDetail(slug: string): Promise<{ article: ArticleSummary; html: string } | null>
```
对应 `GET /api/public/articles`（支持 `category`、`keyword`、`from`、`to`、`page`、`pageSize`）
与 `GET /api/public/articles/[slug]`。

### `web/app/repositories/settings.ts`
```ts
export interface PublicSettings { siteName: string; contact: Record<string, string> }
export function fetchSettings(): Promise<PublicSettings>
```
对应 `GET /api/public/settings`；`site_settings` 为空时返回中文默认值，不报错。

## 硬性要求

1. **移除数据来源提示**：凡是改为读取真实数据的位置，必须删除“演示/Mock/旧站/静态快照/
   Mock 数据说明/旧站历史资料”等用户可见文案；改为中性表述（例如“公开案件资料”）。
   法律页（`LegalPage.vue`）与首页简介中的“Mock 演示数据”表述也必须中性化。
2. **API 断开时显示可理解的错误**，不得回退到 Mock 数据，也不要展示旧站字样。
   仓储函数在请求失败时应抛出携带中文消息的错误，由页面显示错误状态。
3. 案件列表六列固定为：起诉时间、案件号、代理律所、原告、涉案品牌、侵权类型。
   删除重复的“代理律所”列与“状态”列（属 Task 8，但仓储字段要能支撑）。
4. `web/app/data/mock/*` 在中止引用后可以保留文件，但**不得再被 pages/components import**；
   如确需保留兜底常量（如首页 stats、业务卡片），把它们移入 `web/app/config/` 并按需引用。
5. 不新增 npm 依赖。TypeScript、2 空格、无分号、单引号，与现有文件一致。
6. 每个改动完成后运行 `cd web && npm run test`（应保持 72 通过）与 `npx nuxt typecheck`（必须 0）。
