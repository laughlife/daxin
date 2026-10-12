# 后台模块清查与数据库变更分析（2026-10-10）

按需求「只保留以下模块」重新梳理后台。本文先给出**是否需要改数据库结构**的结论，
再列出各模块的落点，避免先写代码才发现字段不够。

## 一、数据库结构分析结论

### 不需要改的（现有结构已满足）

| 需求 | 现有字段 | 结论 |
| --- | --- | --- |
| 文章富文本（排版/字体/图片） | `articles.content_html` (longtext) 已存在 | 直接使用，无需新增 |
| 文章纯文本检索/摘要 | `articles.content_text`、`articles.summary` | 已有 |
| 文章封面图存 OSS | `articles.cover_media_id` → `media_assets.public_url` | 已有 |
| 案例添加与维护 | `cases` 的 `case_number/title/summary/filed_at/plaintiff/court/status/publish_status` | 已足够 |
| 律所简介 | `law_firms.summary` (text) 已存在 | 直接使用；另 `name_en/aliases/region` 可作补充 |

说明：律所简介**不需要新字段**。`summary` 是 text，够放简介；
前台按「有简介显示、无则只显示律所名字」渲染即可（`law_firms/[slug].vue` 调整渲染逻辑，
不是数据库问题）。

### 需要改的

| 变更 | 原因 |
| --- | --- |
| `articles` 新增 `show_in_sidebar` TINYINT(1) NOT NULL DEFAULT 0，并加索引 | 「侧边栏管理」要求推荐阅读内容标记为侧边栏显示。现有 `is_featured` 语义是「推荐」（前台已用于显示「推荐」角标），直接复用会让两个含义纠缠，因此单独加一个显式标记 |

### 需要补的配置项（数据，非结构）

| 配置键 | 用途 |
| --- | --- |
| `home_banner_image` | 图片管理要维护「首页 Banner 图片」，现有 home 组只有 `home_right_image`，缺 Banner |

## 二、模块落点

### 1. 案例管理（保留）
现有 `web/app/pages/admin/cases.vue` + `server/api/admin/cases*` 已能添加与维护，
本模块按「保留」处理，只做必要核对，不重写。

### 2. 文章管理（保留并升级为富文本）
- 现有 `admin/articles.vue` 用的是纯 textarea 之类的纯文本编辑；
- 需求要求「富文本支持排版字体以及图片，保存时图片上传 OSS，文章里图片直接存 OSS 访问路径，
  整个文章入库」——即编辑器产物是带 `<img src="OSS 地址">` 的 HTML，写入 `content_html`。
- 落点：文章编辑页换成富文本编辑器（内容可编辑 div + 工具栏，不引入第三方依赖），
  图片按钮走既有 `/api/admin/upload-policy` → OSS 直传 → `/api/admin/media` 登记，
  拿到 `publicUrl` 后插入编辑器。

### 3. 律所模块（补齐页面）
`admin/law-firms.vue` 目前只有 0.6KB（占位/极简），需补齐「添加及维护 + 填写简介」。
前台 `law-firms/[slug].vue` 需按「有简介才显示简介区」渲染。

### 4. 图片管理（新模块）
只显示四条配置记录，可上传替换：
- `home_banner_image` 首页 Banner
- `home_right_image` 团队介绍右侧
- 业务板块图片（`about_business_images`）
- `about_hero_image` 关于我们简介左侧

其中后两条是 json 数组，图片管理页需要既能改单图也能改多图。
按需求「图片或多个图片都按照站点信息里 logo 图片的修改方式」统一为
「显示图片 + 选择文件」。

### 5. 侧边栏管理（新模块）
用文章的方式维护推荐阅读：即复用文章表，筛选 `show_in_sidebar = 1` 的文章。
页面结构参照文章管理，但列表只显示侧边栏文章，并显式标注「侧边栏显示」。

### 6. 站点设置（调整字段）
- 去掉不再使用的字段；
- 所有图片/多图字段统一为「显示当前图片 + 选择文件」，与 logo 一致。

## 三、导航调整

按「只保留以下模块」，后台导航调整为：
站点设置、文章管理、案例管理、律所管理、图片管理、侧边栏管理。
（品牌管理、媒体库、内容审核、用户与权限不在本次保留清单内——但**页面与接口保留不删**，
仅从导航移除，避免误删已完成的功能；如需彻底移除请再确认。）
