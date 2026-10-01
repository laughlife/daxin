# Mock 内容模型说明（mock-content-model.md）

> 当前阶段所有业务数据均来自本地 Mock，未连接 Laravel / MySQL / 旧 PHP CMS。
> 本文档记录数据模型、文件位置与未来替换为 API 的策略。

## 1. 数据文件与类型

| 类型 | 定义位置 | Mock 数据位置 | 用途 |
| --- | --- | --- | --- |
| `HomeStat` | `web/app/types/content.ts` | `web/app/data/mock/home.ts` | 首页统计数据（value/label/description/emphasis） |
| `BusinessCard` | 同上 | `web/app/data/mock/businesses.ts` | 核心业务卡片（id/group/title/summary/items/iconKey/href/accent） |
| `CaseRecord` | 同上 | `web/app/data/mock/cases.ts` | TRO 案件（id/caseNumber/filedAt/lawFirm/plaintiffBrand/state/caseType/category/status/summary/tags/isRecent/slug） |
| `ArticleRecord` | 同上 | `web/app/data/mock/articles.ts` | 案例分享文章（id/category/title/excerpt/publishedAt/isFeatured/href/imageSrc/imageAlt） |
| `ContactChannel` | 同上 | `web/app/data/mock/contacts.ts` | 微信咨询渠道（id/name/wechatId/purpose/qrSrc/available） |
| `ServiceCapabilityTag` | 同上 | `web/app/data/mock/home.ts` | 服务能力标签（“我们的小伙伴”替代方案） |

辅助导出：

- `cases.ts`：`CASE_TYPE_LABELS`（类型中文名）、`MOCK_DATA_NOTICE`（页面提示文案）、`findMockCaseById`、`mockCaseStates`、`mockCaseLawFirms`。
- `articles.ts`：`findArticlesByCategory`。
- `contacts.ts`：`wechatChannels`、`contactInfo`、`CONTACT_DATA_NOTICE`；`config/site.ts` 从此处引用联系方式，保持单一数据源。

## 2. Mock 设计约束

1. **不依赖系统时间**：“近 3 天”使用固定 `isRecent: boolean`，日期为固定字符串，避免 SSR 与客户端水合不一致。
2. **明显虚构**：案件号统一 `MOCK-` 前缀，律所/品牌带“演示”字样，文章标题带【演示】前缀，避免被误认为真实案件。
3. **不伪造素材**：`imageSrc` / `qrSrc` 一律为 `null`，组件渲染“占位”样式，不生成假图片或假二维码。
4. **单一数据源**：页面组件只从 `data/mock/*` 与 `config/site.ts` 取数，不在组件内硬编码业务数据。

## 3. 搜索与分页（useMockCaseSearch）

`web/app/composables/useMockCaseSearch.ts`：

- 输入：`{ pageSize, syncQuery, source }`，`source` 默认 `mockCases`，可注入其他数据源。
- 搜索：`caseNumber` / `plaintiffBrand` / `lawFirm` 不区分大小写包含匹配；`caseType` / `state` 精确筛选。
- 分页：本地切片，`page` / `totalPages` / `pagedResults`；筛选变化自动回第 1 页，页数收敛自动纠正。
- URL 映射：`?cn=&brand=&firm=&type=&state=&page=`，`router.replace` 同步，刷新可恢复；仅客户端写入。
- 无 fetch、无后端接口伪造；搜索逻辑不在模板中。

## 4. 未来替换为真实 API 的策略

1. 新增数据仓库层（如 `web/app/repositories/`），暴露与 Mock 同签名的异步函数：`getCases(query)`、`getCaseBySlug(slug)`、`getArticles(category)`、`getSiteContact()`。
2. 页面组件改为消费仓库层返回的相同类型（`CaseRecord` 等类型定义保持不变），组件模板无需重写。
3. `useMockCaseSearch` 的筛选/分页参数结构可直接映射为 Laravel API 查询参数；届时把本地过滤替换为服务端查询 + `useFetch`。
4. 预渲染策略同步调整：案件详情页从 `nitro.prerender.routes` 静态枚举改为 SSR/ISR 或按后端数据生成。
5. Mock 数据保留用于开发与测试环境兜底（`source` 注入即可）。
