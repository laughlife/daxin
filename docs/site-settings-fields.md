# 站点设置字段清单（2026-10-10）

用于圈定「哪些字段现在不用了」。共 **41 个字段 / 4 组**。

「使用情况」一列由 `tools/check-setting-usage.mjs` 扫描 176 个源码文件得出，
指该 key 是否出现在代码里；「前端可见」指当前前台页面是否真的会渲染该值。

## general（站点信息，8 个）

| 字段 | 类型 | 当前值 | 使用情况 |
| --- | --- | --- | --- |
| `site_name` | text | 大信法务 | ✅ 公开接口读取 |
| `site_subtitle` | text | 跨境电商与国际物流法律服务 | ⚪ 代码未引用（页头副标题已按需求去掉） |
| `site_description` | text | 大信法务团队，为跨境电商与国际物流企业提供… | ⚪ 代码未引用 |
| `site_logo` | image | mediaId=3714（官方 logo） | ✅ 页头/页脚展示 |
| `contact_phone` | text | 15918796817 | ✅ 公开接口读取 |
| `contact_email` | text | xiaohua131400@126.com | ⚪ 代码未引用（联系信息走 config/contact.ts） |
| `contact_address` | text | 深圳市龙岗区…TOWER12 | ⚪ 代码未引用（同上） |
| `contact_notice` | text | （空） | ⚪ 代码未引用 |

## home（首页文案，12 个）

| 字段 | 类型 | 当前值 | 使用情况 |
| --- | --- | --- | --- |
| `home_hero_badge` | text | 跨境电商 · 全链路法律服务 | ✅ 本轮接入首页首屏 |
| `home_hero_title` | text | 跨境有我，法律无忧 | ✅ 本轮接入 |
| `home_hero_subtitle` | text | 专注于为跨境电商企业、品牌卖家… | ✅ 本轮接入 |
| `home_hero_primary_label` | text | 查询 TRO 案件 | ✅ 本轮接入 |
| `home_hero_primary_link` | text | /tro/cases | ✅ 本轮接入 |
| `home_hero_secondary_label` | text | 联系我们免费评估案件 | ✅ 本轮接入 |
| `home_stats` | json | 5 条数据（7 年 / 1000+ / 10000+ / 95% / 24 小时） | ✅ 本轮接入 |
| `home_right_image` | image | mediaId=3721（团队著作图） | ✅ 团队介绍右侧 |
| `home_banner_image` | image | （空） | ⚠️ 本轮新增；图片管理页可上传，**前台尚未使用** |
| `home_consultation_title` | text | 24H/7 联系法务团队 | ⚪ 代码未引用（对应组件未渲染） |
| `home_consultation_description` | text | 无论 TRO 案件、物流纠纷还是劳动用工问题… | ⚪ 代码未引用 |
| `home_consultation_button` | text | 微信二维码咨询 | ⚪ 代码未引用 |

## about（关于我们，19 个）

| 字段 | 类型 | 当前值 | 使用情况 |
| --- | --- | --- | --- |
| `about_hero_welcome` | text | 欢迎您来访 大信法务 | ✅ 首页/关于我们 |
| `about_hero_title` | text | 深圳市大信法务咨询有限公司 | ✅ |
| `about_hero_paragraph` | text | 大信法务团队为深耕跨境赛道的… | ✅ |
| `about_hero_image` | json | 1 张（法庭天平图） | ✅ 关于我们简介左侧 |
| `about_team_title` | text | 团队介绍 | ✅ |
| `about_team_paragraphs` | json | 3 段 | ✅ |
| `about_team_image` | image | （空） | ⚪ 与 `about_hero_image` 重复，仅作兼容回退 |
| `about_contact_title` | text | 如果您有任何需求和问题，24H/7 联系… | ✅ |
| `about_business_images` | json | 2 张（国内/国外业务图） | ✅ 核心业务 |
| `about_success_title` | text | TRO 成功案例 | ✅ |
| `about_success_images` | json | 4 张案例图 | ✅ |
| `about_success_category` | text | tro-success | ⚪ 代码未引用（成功案例已改为图片，不再按分类取文章） |
| `about_lecture_title` | text | 企业宣讲 | ✅ |
| `about_lecture_images` | json | 14 张 | ✅ |
| `about_partner_title` | text | 我们的小伙伴 | ✅ |
| `about_partner_images` | json | 1 张（伙伴 logo 墙） | ✅ |
| `about_honors_images` | json | `[]`（空） | ⚪ **前台无对应区块**（荣誉与资质未实现） |
| `about_more_label` | text | 了解更多关于我们 | ⚪ 无引用（首页链接文案来自 config） |
| `about_more_link` | text | /about | ⚪ 无引用 |

## seo（2 个）

| 字段 | 类型 | 当前值 | 使用情况 |
| --- | --- | --- | --- |
| `seo_home_title` | text | 大信法务 · 跨境电商与国际物流法律服务 | ⚪ 代码未引用（页面 SEO 走各页 useSeoMeta） |
| `seo_home_description` | text | 大信法务团队，为跨境电商与国际物流企业提供… | ⚪ 代码未引用 |

## 我的建议

**建议删除（确实无用途、且不会丢内容）**
- `about_more_label`、`about_more_link`：关于我们页用的是页面内硬编码链接。
- `about_team_image`：与 `about_hero_image` 重复，属早期兼容键。
- `about_success_category`：成功案例已按旧站改为图片，不再按文章分类取数。

**建议先确认再接线的（不是「不用了」，而是「改了不生效」）**
- `site_subtitle`、`site_description`、`contact_email`、`contact_address`、`contact_notice`：
  这些是真实站点信息，只是当前前台读 `config/site.ts` 与 `config/contact.ts`。
  要么删掉避免两处维护，要么把前台接到数据库（推荐后者，后台才真正可维护）。
- `seo_home_title`、`seo_home_description`：同上，可接到首页 `useSeoMeta`。
- `home_consultation_*`：对应的咨询区组件当前未渲染。要么恢复该区块，要么删除这三项。

**建议保留**
- `home_banner_image`：首页 Banner 位已由图片管理页维护，前台接入待做。
- `about_honors_images`：留空占位，等「荣誉与资质」区块确认后再用。

请直接告诉我删除哪些、以及哪些要接到前台，我按你说的处理。
