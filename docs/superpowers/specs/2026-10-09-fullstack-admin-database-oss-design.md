# Nuxt 全栈后台、结构化数据库与 OSS 媒体管理设计

**状态：待用户评审**  
**日期：2026-10-09**

## 目标

将当前 Nuxt 静态展示站升级为 Nuxt 全栈网站：页面通过服务端 API 读取新数据库 `daxin`，后台提供管理员登录、退出、基础权限和内容配置；旧库数据只读解析，不覆盖现有数据；图片通过阿里云 OSS 前端直传，服务端签发 RAM 角色的 STS 临时凭证。

关于我们页面恢复旧网站 `http://yan1.qinianyun.com/about/` 的内容结构，删除“扫码领取 TRO 侵权大礼包”区域及蓝色框标记内容，不保留当前已确认的新版模块。该地址当前无法由浏览工具直接访问，实施时以需求文档截图、旧源码和用户提供的正式素材为准。

## 已确认的产品规则

- 首页核心业务第一块“**TRO 全流程处理**”可点击进入 TRO 成功案例；其他首页核心业务不显示“了解详情”链接。
- 案件查询列表删除第二个“代理律所”字段和“状态”字段。
- 案件查询字段顺序为：起诉时间、案件号、代理律所、原告、涉案品牌、侵权类型。
- “立案日期”显示名称改为“起诉时间”；需求文档标记的另一组日期筛选删除。
- 案件号、代理律所、涉案品牌均可进入详情页面。
- 关于我们恢复旧网站结构，删除“扫码领取 TRO 侵权大礼包”及蓝色框内容。
- 旧数据库只读，迁移过程不覆盖、不删除、不修改源数据。
- 新业务库名称为 `daxin`；源库按约定使用 `da`。若本机现有数据库名称与约定不一致，迁移前先核对，不自动重命名或删除。
- 前端直传 OSS，后端返回 STS 临时授权；单文件最大 20MB；对象路径使用 `YYYYMMDD/{uuid}.{ext}`。
- OSS 长期 AccessKey 只存在服务端环境变量，不进入前端、数据库、Git 或浏览器。
- 前台不展示“旧站”“旧库”“静态快照”“演示数据”等数据来源提示；来源记录保留在后台和数据库中。

## 架构

Nuxt 4 运行在 Node 服务端模式，使用 Nitro `server/api` 提供 API。浏览器通过 API 访问 MySQL `daxin`，服务端使用参数化查询和事务；旧库 `da` 仅由迁移脚本读取。静态预渲染不再作为正式数据通道，保留开发预览能力。

目录边界：

- `web/server/api/public/*`：公开页面查询接口；
- `web/server/api/admin/*`：登录、权限、配置和内容管理接口；
- `web/server/utils/db/*`：连接池、事务、查询和迁移辅助函数；
- `web/server/utils/auth/*`：密码哈希、Session、权限检查；
- `web/server/utils/oss/*`：STS 签发、对象 key 校验和 OSS 配置；
- `web/app/repositories/*`：页面数据访问层，屏蔽 API 与组件；
- `web/app/pages/admin/*`：后台页面；
- `database/migrations/*`：版本化 DDL；
- `tools/migrate-legacy/*`：旧库只读解析、清洗、导入和校验脚本。

页面组件不直接调用数据库，也不拼接 SQL。接口返回统一格式：

```ts
type ApiResult<T> = {
  data: T
  meta?: { page?: number; pageSize?: number; total?: number }
  error?: { code: string; message: string }
}
```

## 数据库设计

### 站点、素材和业务配置

- `site_settings`：Logo、背景资源、首页右侧图、关于我们资源、SEO 和联系配置；使用 key/version，支持发布与草稿。
- `media_assets`：OSS key、外网 URL、MIME、字节数、宽高、用途、上传人、创建时间、删除状态。
- `service_sections`：四大核心业务板块、标题、简介、排序、跳转路径、启用状态。
- `service_items`：板块子服务、描述、排序和关联页面。
- `footer_services`、`footer_links`、`contact_channels`、`qr_assets`：页脚业务、联系信息和二维码。

### 内容和案例

- `articles`：文章标题、摘要、正文安全 HTML、分类、发布日期、封面资源、发布状态、内部来源信息。
- `article_categories`：TRO 预警、TRO 成功案例、劳动法案例、货代案例等。
- `article_images`：文章正文图片与 OSS 资源关联。
- `cases`：案件号、法院、起诉时间、原告、状态内部字段、摘要、公开进展和更新时间。
- `case_progress`：案件进展时间线、公开文案、时间和排序。
- `brands`、`law_firms`、`ip_types`：品牌、代理律所和侵权类型主体表。
- `case_brands`、`case_law_firms`、`case_ip_types`：多对多关联表并设置唯一约束。
- `case_sources`：案件与旧库文章的关联、来源 ID 和人工核验状态。
- `case_related_cases`：品牌、律所和案件详情中的历史关联案件。
- `migration_review_items`：无法从旧正文确定的案件、品牌、律所和侵权类型候选，供管理员核验。

所有公开列表使用明确的 `page`、`page_size`、`total`，页码在服务端限制范围，避免出现 `999/3`、`4/3` 等显示。

### 管理员

- `admin_users`：账号、密码哈希、状态、最后登录时间。
- `admin_roles`：`admin`、`editor`、`viewer` 三种基础角色。
- `admin_user_roles`：用户与角色关系。
- `admin_sessions`：HttpOnly Session、过期时间、撤销时间和登录 IP 摘要。
- `admin_audit_logs`：配置、内容、素材和关系变更记录。

权限建议：`admin` 管理全部内容和账号；`editor` 管理文章、案例、品牌、律所、业务和媒体；`viewer` 只能查看后台数据。首个管理员账号通过一次性环境变量或 CLI 初始化，不在迁移脚本中写明密码。

## 旧库迁移

迁移脚本只连接源库执行 SELECT：

1. 读取 `cn_list`、`cn_project`、`cn_cate` 和 `cn_list_N` 扩展表；
2. 保存旧文章 ID、表名、标题、摘要、正文和发布日期；
3. 从文章标题和正文解析案件号、原告、品牌、代理律所和侵权类型候选值；
4. 无法确认的字段进入 `migration_review_items`，由后台人工确认；
5. 将安全清洗后的正文和图片写入 `daxin`；
6. 为每条迁移记录保留 `legacy_source_table`、`legacy_source_id` 和迁移批次号；
7. 迁移后校验文章数、图片数、关联数、日期范围和重复案件号；
8. 校验通过后，公开 API 只读取 `daxin`。

迁移脚本默认拒绝 DROP、TRUNCATE、DELETE、UPDATE 和 ALTER 源库语句。目标库写入使用事务和可重复执行的 `migration_batch_id`，避免重复导入。源库重命名不纳入自动脚本，必须先确认本机实际数据库状态并完成备份。

## OSS 直传

后台先请求：

```text
POST /api/admin/upload-policy
```

服务端检查 Session、角色、用途和文件类型后，通过 RAM Role ARN 生成短时 STS 凭证和 policy。前端使用临时凭证直传 OSS；上传完成后调用：

```text
POST /api/admin/media
```

服务端再次校验对象 key、大小、MIME 和日期目录，随后写入 `media_assets`。服务端不接受前端任意外链作为正式媒体地址。

所需配置放置方式：

- 本地开发：`web/.env`，该文件必须被 `.gitignore` 忽略；
- 团队模板：`web/.env.example`，只放变量名和示例值；
- 生产环境：部署平台的服务端环境变量，不上传 `.env`。

预留变量：

```text
DB_HOST
DB_PORT
DB_USER
DB_PASSWORD
DB_NAME=daxin
LEGACY_DB_NAME=da
ALIYUN_OSS_REGION
ALIYUN_OSS_BUCKET
ALIYUN_OSS_ENDPOINT
ALIYUN_OSS_ROLE_ARN
ALIYUN_OSS_ACCESS_KEY_ID
ALIYUN_OSS_ACCESS_KEY_SECRET
ALIYUN_OSS_PUBLIC_BASE_URL
UPLOAD_MAX_BYTES=20971520
```

如果部署环境支持实例 RAM 角色，则可省略长期 AccessKey；否则 AccessKey 只放在服务端 `web/.env` 或部署平台 Secret 中，绝不放到前端公开变量（例如 `NUXT_PUBLIC_*`）。

## 页面接入

- 首页读取 `site_settings`、`service_sections`、近期案例和四类文章，每类默认展示三条。
- 首页 TRO 全流程卡片链接至 `/tro/success-cases`。
- 案件查询只显示确认后的六列，关键词搜索和分页由 API 执行；起诉时间作为列表字段和详情字段展示，页面不再提供需求文档标记的日期筛选框。
- 案件详情通过 API 获取案件、公开进展、品牌、律所和历史关联案件。
- 品牌页先显示品牌当前维权信息，底部显示历史案件。
- 律所页显示律所信息和代理案件。
- 关于我们按旧网站结构重新编排，删除 TRO 大礼包扫码区域及需求文档蓝色框内容，图片来自 `site_settings` 和 `media_assets`。
- 页脚业务范围和联系信息从后台配置读取，业务项带路由链接。
- 所有前端数据来源提示改为普通页面内容，不显示迁移来源说明。

## 安全和运行约束

- 所有 SQL 使用参数绑定；列表 API 设置最大 `page_size`；
- Session 使用 HttpOnly、SameSite 和服务端过期控制；
- 登录失败限速，密码使用 Argon2id 或 bcrypt；
- OSS policy 限制 bucket、key 前缀、MIME 和 20MB 大小；
- 正文 HTML 在服务端白名单清洗，禁止脚本、事件属性、外部任意图片和危险 CSS；
- 后台操作写审计日志；
- 生产环境禁止使用 root 数据库账号；
- 迁移、DDL 和管理员初始化均提供 dry-run 或备份检查步骤；
- 旧库只读账号与新库写账号分离。

## 验证标准

- 新库 DDL 可重复执行，源库无写入痕迹；
- 文章、图片、案件、品牌和律所迁移数量与核验报告一致；
- 案件六列、品牌详情、律所详情和历史案件关系可通过 API 和页面验证；
- 管理员登录、退出、权限拒绝、Session 过期均有自动化测试；
- OSS 20MB 边界、非法 MIME、错误 key、过期 STS 和重复上传均有测试；
- 前端 API 断开时显示可理解的错误状态，不回退到旧站提示；
- `typecheck`、单元测试、API 测试、静态资源检查和浏览器验收全部通过；
- 局域网预览和生产启动方式分别验证。

## 实施顺序

1. 先提交并评审本设计文档；
2. 编写分阶段实施计划；
3. 建立新库 DDL、迁移 dry-run 和校验报告；
4. 实现服务端 DB、认证、权限和 OSS STS；
5. 导入旧库数据并人工确认待核验项；
6. 将页面切换到 API；
7. 实现后台页面和表单；
8. 重排关于我们和首页业务模块；
9. 完成端到端测试、浏览器验收和迁移报告。

## 待补充的外部配置

开始 OSS 接入前需要提供：OSS Region、Bucket、Endpoint、公网访问域名、RAM Role ARN，以及服务端使用的 AccessKey ID/Secret（如果运行环境没有实例 RAM 角色）。这些值写入 `web/.env` 或部署平台 Secret，不写入 Git。

