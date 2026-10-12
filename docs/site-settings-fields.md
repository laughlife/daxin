# 站点设置字段清单（2026-10-10）

现行字段 **34 个 / 3 组**（迁移 008 之后）。
由 `tools/list-setting-fields.mjs` 导出；「引用」一列由
`tools/check-setting-usage.mjs` 扫描全部前端与服务端源码得出。

## 本轮清理结果

**已删除 8 个无引用字段**（迁移 008，软删除 `is_current = 0`，可恢复）：

| 字段 | 删除原因 |
| --- | --- |
| `about_more_label` / `about_more_link` | 关于我们页用的是页面内硬编码链接 |
| `contact_notice` | 页脚与联系区都不再展示提示文案 |
| `home_consultation_title` | 对应组件 `ConsultationCta` 未被任何页面引用（该组件已一并删除） |
| `home_consultation_description` | 同上 |
| `home_consultation_button` | 同上 |
| `seo_home_title` / `seo_home_description` | 各页 SEO 走 `useSeoMeta` 与 `site_description` |

**新增 1 个**：`contact_wechat`（general，初始值取当前页脚展示的 TRO 咨询号）。

`seo` 组因此已为空。后台设置页会按数据库内容自动渲染，不再出现这些键。

## general（站点信息，8 个）

| 字段 | 类型 | 当前值 | 前台使用 |
| --- | --- | --- | --- |
| `site_name` | text | 大信法务 | ✅ 页脚、页头占位、结构化数据 |
| `site_subtitle` | text | 跨境电商与国际物流法律服务 | ✅ 页头（无 logo 时的占位副标题） |
| `site_description` | text | 大信法务团队，为跨境电商与国际物流企业提供… | ✅ 首页结构化数据 |
| `site_logo` | image | mediaId=3714 | ✅ 页头与页脚 |
| `contact_phone` | text | 15918796817 | ✅ 页脚「联系我们」 |
| `contact_email` | text | xiaohua131400@126.com | ✅ 页脚「联系我们」 |
| `contact_address` | text | 深圳市龙岗区…TOWER12 | ✅ 页脚「联系我们」 |
| `contact_wechat` | text | kjzx88 | ✅ 页脚「联系我们」（本轮新增） |

四项联系方式统一经 `useSiteIdentity()` 读取：**后台配置优先、config 兜底**。
后台改完立即生效，不再是改了不生效。

## home（首页文案，9 个）

| 字段 | 类型 | 当前值 | 前台使用 |
| --- | --- | --- | --- |
| `home_hero_badge` | text | 跨境电商 · 全链路法律服务 | ✅ 首屏 |
| `home_hero_title` | text | 跨境有我，法律无忧 | ✅ 首屏 |
| `home_hero_subtitle` | text | 专注于为跨境电商企业、品牌卖家… | ✅ 首屏 |
| `home_hero_primary_label` | text | 查询 TRO 案件 | ✅ 首屏按钮 |
| `home_hero_primary_link` | text | /tro/cases | ✅ 首屏按钮链接 |
| `home_hero_secondary_label` | text | 联系我们免费评估案件 | ✅ 首屏按钮 |
| `home_stats` | json | 5 条数据 | ✅ 团队介绍区 |
| `home_right_image` | image | mediaId=3721 | ✅ 团队介绍右侧 |
| `home_banner_image` | image | （空） | ✅ **已接入首页**：首屏之后整幅 Banner，未配置时完全不渲染 |

## about（关于我们，17 个）

| 字段 | 类型 | 当前值 | 前台使用 |
| --- | --- | --- | --- |
| `about_hero_welcome` | text | 欢迎您来访 大信法务 | ✅ |
| `about_hero_title` | text | 深圳市大信法务咨询有限公司 | ✅ |
| `about_hero_paragraph` | text | 大信法务团队为深耕跨境赛道的… | ✅ |
| `about_hero_image` | json | 1 张 | ✅ 简介左侧 |
| `about_team_title` | text | 团队介绍 | ✅ |
| `about_team_paragraphs` | json | 3 段 | ✅ |
| `about_team_image` | image | （空） | ⚪ 未渲染，作为 `about_hero_image` 的兼容回退仍被读取 |
| `about_contact_title` | text | 如果您有任何需求和问题… | ✅ |
| `about_business_images` | json | 2 张 | ✅ 核心业务 |
| `about_success_title` | text | TRO 成功案例 | ✅ |
| `about_success_images` | json | 4 张 | ✅ |
| `about_success_category` | text | tro-success | ⚪ 未渲染（成功案例已改为图片） |
| `about_lecture_title` | text | 企业宣讲 | ✅ |
| `about_lecture_images` | json | 14 张 | ✅ |
| `about_partner_title` | text | 我们的小伙伴 | ✅ |
| `about_partner_images` | json | 1 张 | ✅ |
| `about_honors_images` | json | `[]` | ⚪ 无对应区块（预留） |

`about_team_image`、`about_success_category`、`about_honors_images` 三项
虽然前台未渲染，但 `aboutContent.ts` 仍在读取（兼容或预留），
按「**未引用**才删」的口径保留。如需彻底删除请明确告知。

## 图片字段的交互

全部图片字段统一为「显示图片 + 选择文件」：

- 单图（`value_type = image`）：`SettingImageField`，写 `media_id`；
- 多图（`value_type = json`，URL 数组）：`AdminImageListField`，
  逐张显示且每张后面跟选择文件，支持替换、删除、上移下移、追加。
