# 导航地图（navigation-map.md）

> 状态：Task 2 站点壳层阶段。导航唯一数据源为 `web/app/config/site.ts`（`mainNav` / `footerNav` / `cta`），组件不硬编码导航。
> 下表中的路由为规划路径，除首页外均未实现；`nuxt generate` 已暂时关闭链接爬取（`crawlLinks: false`），业务页面落地后再开启并补充预渲染路由。

## 1. 一级导航与二级导航

| 一级导航 | 二级导航 | 规划路由 | 实现状态 |
| --- | --- | --- | --- |
| 首页 | — | `/` | ✅ 已实现（Task 2 为壳层预览页，非正式首页） |
| TRO 案件查询 | — | `/tro/cases` | ❌ 未实现 |
| TRO 业务 | TRO 侵权预警 | `/tro/alerts` | ❌ 未实现 |
| | TRO 成功案例 | `/tro/success-cases` | ❌ 未实现 |
| | CPSC 召回 | `/tro/cpsc-recalls` | ❌ 未实现 |
| | 科普干货 | `/tro/guides` | ❌ 未实现 |
| | 热点资讯 | `/tro/news` | ❌ 未实现 |
| 国内业务 | 劳动纠纷 | `/domestic/labor-disputes` | ❌ 未实现 |
| | 货代案例 | `/domestic/freight-cases` | ❌ 未实现 |
| | 跨境资讯 | `/domestic/cross-border-news` | ❌ 未实现 |
| 侵权品牌库 | — | `/brands` | ❌ 未实现 |
| 常见问题 | TRO 常见问题 | `/faq/tro` | ❌ 未实现 |
| | TRO 原告律所 | `/faq/plaintiff-firms` | ❌ 未实现 |
| | 劳动争议 | `/faq/labor` | ❌ 未实现 |
| | 跨境干货 | `/faq/cross-border` | ❌ 未实现 |
| 关于我们 | — | `/about` | ❌ 未实现 |
| 产品侵权检测（CTA 按钮） | — | `/infringement-check` | ❌ 未实现 |

「TRO 业务」「国内业务」「常见问题」为纯下拉分组，父级不可点击（`NavItem.to` 为空），仅展开子菜单。

## 2. Footer 导航

Footer 使用 `siteConfig.footerNav` 分组：

- TRO 业务：TRO 案件查询、TRO 侵权预警、TRO 成功案例、CPSC 召回
- 国内业务：劳动纠纷、货代案例、跨境资讯
- 常见问题：TRO 常见问题、TRO 原告律所、劳动争议、跨境干货
- 其他：侵权品牌库、关于我们、科普干货、热点资讯

Footer 底部另含占位链接：隐私政策 `/privacy`、免责声明 `/disclaimer`（均未实现），以及 ICP / 版权占位文本。

## 3. 暂未实现的页面汇总

`/tro/cases`、`/tro/alerts`、`/tro/success-cases`、`/tro/cpsc-recalls`、`/tro/guides`、`/tro/news`、
`/domestic/labor-disputes`、`/domestic/freight-cases`、`/domestic/cross-border-news`、
`/brands`、`/faq/tro`、`/faq/plaintiff-firms`、`/faq/labor`、`/faq/cross-border`、
`/about`、`/infringement-check`、`/privacy`、`/disclaimer`。

以上链接目前指向 Nuxt 默认 404 页面，属于预期行为；请勿在 Task 2 阶段为其创建业务页面。

## 4. 后续页面路由建议

| 页面 | 建议路由 | 说明 |
| --- | --- | --- |
| 正式首页 | `/` | 替换当前壳层预览页 |
| TRO 案件查询 | `/tro/cases` | 列表 + 查询参数（案号 / 品牌 / 原告），详情建议 `/tro/cases/[id]` |
| TRO 侵权预警 | `/tro/alerts` | 列表 + 详情 `/tro/alerts/[id]` |
| TRO 成功案例 | `/tro/success-cases` | 列表 + 详情 `/tro/success-cases/[id]` |
| CPSC 召回 | `/tro/cpsc-recalls` | 列表 + 详情 `/tro/cpsc-recalls/[id]` |
| 科普干货 / 热点资讯 / 跨境资讯 | `/tro/guides`、`/tro/news`、`/domestic/cross-border-news` | 资讯类列表，详情统一 `[id]` 或 `[slug]` 动态段 |
| 劳动纠纷 / 货代案例 | `/domestic/labor-disputes`、`/domestic/freight-cases` | 列表 + 详情 |
| 侵权品牌库 | `/brands` | 品牌列表 `/brands/[id]` 或 `/brands/[slug]`，支持字母 / 行业筛选 |
| 常见问题 | `/faq/tro`、`/faq/plaintiff-firms`、`/faq/labor`、`/faq/cross-border` | 也可评估合并为 `/faq/[category]` 单动态路由 |
| 关于我们 | `/about` | 单页 |
| 产品侵权检测 | `/infringement-check` | 表单 + 结果页 `/infringement-check/result` |
| 隐私政策 / 免责声明 | `/privacy`、`/disclaimer` | 单页，内容待法务确认 |

约定：新增页面时只在 `web/app/pages/` 下按上述路径创建，并同步更新本文件与 `site.ts`（如路由调整）。
