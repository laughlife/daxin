# 站点设置图片字段统一方案（2026-10-10）

需求：「图片或多个图片都按照站点信息里 logo 图片的修改方式，显示图片，
每个图片后显示选择文件」。

## 现状

图片字段目前有两种形态，交互不一致：

| 形态 | value_type | 涉及字段 | 当前交互 |
| --- | --- | --- | --- |
| 单图 | `image` | `site_logo`、`home_banner_image`、`home_right_image`、`about_team_image` | ✅ 已统一：显示图片 + 选择文件（SettingImageField） |
| 图片数组 | `json` | `about_hero_image`、`about_business_images`、`about_success_images`、`about_lecture_images`、`about_partner_images`、`about_honors_images` | ❌ 走 JSON 结构化编辑器，用户要手写 URL 数组 |

## 为什么不把 json 直接改成 image

`site_settings.value_type='image'` 只关联**一个** `media_id`，
装不下多图。而 `about_lecture_images` 有 14 张、`about_success_images` 有 4 张，
改成单图字段会直接丢图，因此**不能改 value_type**。

## 方案：新增图片列表控件，保持存储形态不变

新增 `AdminImageListField` 组件：
- 逐张显示当前图片（每张后面跟「选择文件」按钮，符合需求描述）；
- 每张可单独替换（选中文件 → 上传 OSS → 替换该位置 URL）；
- 可删除某张、可追加一张；
- 值为 **URL 字符串数组**，与数据库中现有 json 数组格式完全一致，
  因此**不需要改表、不需要迁移数据**；
- 选文件即上传并写回配置，与 logo 的交互节奏一致。

然后 `settings.vue` 对上述 6 个 json 图片键改用该控件，
不再显示 JSON 编辑器（JSON 编辑器保留给 `home_stats` / `about_team_paragraphs`
这类真正的结构化数据）。

## 注意

`about_team_image`（单图，当前为空）与 `about_hero_image`（数组首图）语义重叠，
已在字段清单中标注为建议删除项；本次不处理，等确认。
