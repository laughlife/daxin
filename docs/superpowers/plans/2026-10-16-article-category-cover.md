# 文章栏目与封面迁移实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 dxfw 文章按新官网栏目归类，接入完整后台分类选择和封面编辑，并从旧附件路径下载封面上传 OSS、关联到新库文章。

**Architecture:** 用一个纯函数将旧栏目与文章 ID 映射到新分类，用一份幂等重分类脚本更新已导入文章。旧封面先从 `dr_1_news.thumb` 关联 `dr_attachment_data.id`，按 `https://daxinfawu.com/uploadfile/{attachment}` 下载并上传 OSS，再将媒体 ID 写入 `articles.cover_media_id`；后台新建和编辑则复用现有文章图片上传链路。

**Tech Stack:** Nuxt 4、Vue 3、TypeScript、Node.js 22+、MySQL、阿里云 OSS、Node test runner。

**Spec:** `docs/superpowers/specs/2026-10-16-article-category-cover-design.md`

## Global Constraints

- 只从 `dxfw` 读取旧站数据；业务数据只写入新库 `daxin`。
- 不删除文章、正文、旧分类记录或已存在的 OSS 正文图片；停用无引用的旧分类并保留其 ID。
- 分类计数保持 858 篇：TRO侵权预警 718、TRO成功案例 13、CPSC召回 2、货代案例 87、跨境咨询 9、科普干货 24、热点资讯 5、劳动纠纷 0。
- 旧封面地址使用 `https://daxinfawu.com/uploadfile/` 加附件表相对路径；OSS 对象按 `Img/YYYYMMDD/` 存放。
- 文章图片最多 20 MB；只对下载和 OSS 上传都成功的图片关联封面。
- 后台分类列表只返回活动分类；所有写操作保留现有 `article:write` 权限检查。
- Git 每个独立任务单独提交，仅暂存当前任务文件；提交信息使用英文类型前缀和中文说明，不 push、不 merge。

## Review Focus

- 附件路径已有 `/uploadfile/` 前缀或开头斜线时不能重复拼接；测试相对、绝对及空路径。
- 同一附件可被多篇文章引用；每个 OSS 对象只上传/登记一次，但每篇文章都应绑定到该媒体 ID。
- 图片地址能访问但响应不是图片、超过 20 MB 或上传失败时，不得写入 `cover_media_id`，并要记录文章 ID、附件 ID 和失败原因。
- 编辑时封面字段为空应按用户操作清除关联；上传后未保存不能误称已绑定。
- 已停用分类不能被新建/编辑 API 重新分配；合法活动分类必须不受分页影响地出现在表单中。

---

### Task 1: 旧文章分类识别与附件 URL 规范化

**Files:**
- Modify: `tools/migrate-legacy/legacy-source.mjs`
- Modify: `tools/migrate-legacy/legacy-migrate.mjs`
- Test: `tools/migrate-legacy/legacy-source.test.mjs`

**Interfaces:**
- 产出纯函数 `resolveDxfwArticleCategory(row)`，输入 `catid/id/title/content`，返回 `{ slug, name, section }`。
- 产出纯函数 `buildDxfwAttachmentUrl(attachment)`，把附件相对路径转换为旧站访问 URL。
- `mapDxfwArticleRow()` 和 `fetchDxfwArticles()` 共用以上映射，分类和封面来源不再由两份规则决定。

- [ ] **Step 1: 为分类拆分和封面地址规则写失败测试**

验证：国外 ID 1909、1918 为 CPSC，1661、1663 为货代；国内已确认 9 个 ID 为跨境咨询、其余为货代；1977 的附件路径得到 `/uploadfile/202610/d3a71f84fefdfee.png`；`/83/3b/.../380x250_crop.jpg` 不产生双斜线或重复 `uploadfile` 前缀；空附件返回空串。

- [ ] **Step 2: 运行对应测试确认失败**

Run: `node --test tools/migrate-legacy/legacy-source.test.mjs`
Expected: 新增的分类与附件 URL 测试因函数或当前映射不符而失败。

- [ ] **Step 3: 实现分类解析和 URL 规范化，并让 dry-run 报告使用新分类**

在 `legacy-source.mjs` 为相对路径去除开头斜线和已有 `uploadfile/` 前缀，再拼接基址；完整 HTTP(S) 地址保持原样。用源文章 ID 和栏目 ID 执行已确认的分类规则，返回对应新版名称和 section。更新旧库读取 SQL，使 `dr_attachment_data.attachment` 按此规则生成 `cover_url`。`legacy-migrate.mjs` 的报告生成必须优先使用解析后的 slug，同时保持 TRO 案例实体抽取不依赖展示名称。

- [ ] **Step 4: 运行旧库映射测试并检查迁移报告计数**

Run: `node --test tools/migrate-legacy/legacy-source.test.mjs`
Expected: PASS；随后运行迁移 dry-run，报告仍为 858 篇，9 个咨询 ID 与国外 4 篇分类准确，封面参考记录为 833 个唯一附件路径。

- [ ] **Step 5: 提交**

```powershell
git add -- tools/migrate-legacy/legacy-source.mjs tools/migrate-legacy/legacy-migrate.mjs tools/migrate-legacy/legacy-source.test.mjs
git commit -m "fix: 修正旧文章分类与封面路径映射"
```

### Task 2: 新库文章分类幂等重分类

**Files:**
- Create: `tools/migrate-legacy/legacy-reclassify-articles.mjs`
- Test: `tools/migrate-legacy/legacy-reclassify-articles.test.mjs`
- Modify: `tools/migrate-legacy/legacy-import.mjs`

**Interfaces:**
- 产出 CLI：默认 `--dry-run`，仅传入 `--apply` 时更新 `daxin`；不重新导入或覆盖正文。
- 目标行只限定 `legacy_source_table='dr_1_news'`，新旧分类通过 slug 定位，不硬编码自增 ID。

- [ ] **Step 1: 写失败测试**

测试重分类生成的映射/SQL：国外 2 篇进入 `cpsc-recalls`、2 篇进入 `freight-case`；国内 9 个指定 ID 进入 `cross-border-consulting`、余下 85 篇进入 `freight-case`；ID 1627 进入 `tro-alert`，ID 1979 进入 `knowledge`；其他文章不匹配更新条件。

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tools/migrate-legacy/legacy-reclassify-articles.test.mjs`
Expected: FAIL，脚本与分类构造器尚未实现。

- [ ] **Step 3: 实现 dry-run/apply 和活动分类种子**

dry-run 输出写入前后分类计数及预计更新篇数；`--apply` 只改 `category_id` 与分类名称/section/status，不修改文章正文、日期、发布状态或媒体。重跑 `--apply` 结果不变。停用无引用旧分类，保留记录。

- [ ] **Step 4: 运行测试并执行数据库变更**

Run: `node --test tools/migrate-legacy/legacy-reclassify-articles.test.mjs`，再先运行脚本 dry-run 核对 858 篇总量和分类计数，核对无误后以 `--apply` 执行并查询验证。旧库连接仅 SELECT。
Expected: 分类计数与 spec 一致；文章总量和非分类字段保持不变。

- [ ] **Step 5: 提交**

```powershell
git add -- tools/migrate-legacy/legacy-reclassify-articles.mjs tools/migrate-legacy/legacy-reclassify-articles.test.mjs tools/migrate-legacy/legacy-import.mjs
git commit -m "feat: 按新版栏目重分类迁移文章"
```

### Task 3: 公开栏目和文章详情路径

**Files:**
- Modify: `web/app/config/contentSections.ts`
- Modify: `web/app/config/site.ts`
- Modify: `web/app/components/home/ArticlePreviewSection.vue`
- Modify: `web/server/utils/public/article-query.ts`
- Modify: `web/scripts/public-api-articles.test.mjs`

**Interfaces:**
- `/tro/cpsc-recalls` 查询 `cpsc-recalls`。
- `/domestic/cross-border-news` 查询 `cross-border-consulting`，保留现有 URL 并显示“跨境咨询”。
- `articleHref(categorySlug, slug)` 对 CPSC、跨境咨询和科普干货生成正确详情 URL。

- [ ] **Step 1: 为栏目查询与详情链接写失败测试**

测试 CPSC 读取 `cpsc-recalls`、跨境页面读取 `cross-border-consulting`，以及新旧分类的详情 URL 前缀。

- [ ] **Step 2: 运行测试确认新 slug 当前无法正确查找或生成详情链接**

Run: `node --test scripts/public-api-articles.test.mjs`（工作目录 `web`）
Expected: 新增的 CPSC/跨境详情路径断言失败。

- [ ] **Step 3: 更新栏目配置、导航名称和详情路径映射**
- [ ] **Step 4: 运行公开文章测试**

Run: `node --test scripts/public-api-articles.test.mjs`（工作目录 `web`）
Expected: PASS；新栏目路由使用指定 slug，旧跨境 URL 保持有效。

- [ ] **Step 5: 提交**

```powershell
git add -- web/app/config/contentSections.ts web/app/config/site.ts web/app/components/home/ArticlePreviewSection.vue web/server/utils/public/article-query.ts web/scripts/public-api-articles.test.mjs
git commit -m "feat: 接通CPSC与跨境咨询文章栏目"
```

### Task 4: 后台完整分类字典

**Files:**
- Create: `web/server/api/admin/article-categories.get.ts`
- Modify: `web/app/pages/admin/articles.vue`
- Create: `web/scripts/admin-article-categories.test.mjs`

**Interfaces:**
- `GET /api/admin/article-categories` 要求 `article:read`，返回活动分类 `{ id, slug, name }[]`。
- 新建与编辑文章共用完整字典；分类选择不从当前分页数据推导。

- [ ] **Step 1: 写失败测试**

测试有权限时只返回 `status=1` 的全部分类，无权限时拒绝；当当前文章分类未在本页文章结果中时，表单仍能显示它。

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test scripts/admin-article-categories.test.mjs`（工作目录 `web`）
Expected: FAIL，活动分类 API 不存在，分页外类别无法验证。

- [ ] **Step 3: 实现活动分类 API 与表单数据加载**
- [ ] **Step 4: 运行管理文章测试和类型检查**

Run: `npm test`、`npm run typecheck`（工作目录 `web`）
Expected: PASS；分类加载与文章列表分页彼此独立。

- [ ] **Step 5: 提交**

```powershell
git add -- web/server/api/admin/article-categories.get.ts web/app/pages/admin/articles.vue web/scripts/admin-article-categories.test.mjs
git commit -m "feat: 后台文章使用完整分类字典"
```

### Task 5: 后台文章封面上传、显示和保存

**Files:**
- Create: `web/app/components/admin/AdminArticleCoverField.vue`
- Modify: `web/app/pages/admin/articles.vue`
- Modify: `web/app/types/adminContent.ts`
- Modify: `web/server/utils/admin/content-queries.ts`
- Modify: `web/server/api/admin/articles.post.ts`
- Modify: `web/server/api/admin/articles/[id].get.ts`
- Modify: `web/server/api/admin/articles/[id].put.ts`
- Modify: `web/scripts/admin-content.test.mjs`
- Modify: `web/scripts/oss-upload.test.mjs`

**Interfaces:**
- `AdminArticleDetail` 增加 `coverMediaId: number | null`、`coverUrl: string`。
- POST/PUT 接受可空 `coverMediaId`，且只允许绑定未软删除、`usage_scope='article'` 的媒体记录。
- 上传控件走 `useOssUpload`，用途 `article`；上传只更新表单暂存值，点击保存后才写文章。

- [ ] **Step 1: 为封面详情读取、合法媒体绑定、停用分类拒绝与清空关联写失败测试**
- [ ] **Step 2: 运行相关测试确认失败**

Run: `npm test`（工作目录 `web`）
Expected: 新增封面字段测试失败，现有测试不回归。

- [ ] **Step 3: 扩展详情 SQL、POST/PUT 校验与字段持久化；拒绝已停用分类**
- [ ] **Step 4: 在新建/编辑表单添加封面预览、上传/替换/清除和保存状态**
- [ ] **Step 5: 运行管理 API、OSS 上传和类型检查**

Run: `npm test`、`npm run typecheck`（工作目录 `web`）
Expected: PASS；保存后刷新仍有封面，详情正文不自动重复插入封面。

- [ ] **Step 6: 提交**

```powershell
git add -- web/app/components/admin/AdminArticleCoverField.vue web/app/pages/admin/articles.vue web/app/types/adminContent.ts web/server/utils/admin/content-queries.ts web/server/api/admin/articles.post.ts web/server/api/admin/articles/[id].get.ts web/server/api/admin/articles/[id].put.ts web/scripts/admin-content.test.mjs web/scripts/oss-upload.test.mjs
git commit -m "feat: 后台文章支持封面上传与编辑"
```

### Task 6: 旧站封面图片下载、OSS 上传及关联

**Files:**
- Create: `tools/migrate-legacy/legacy-cover-backfill.mjs`
- Test: `tools/migrate-legacy/legacy-cover-backfill.test.mjs`
- Reuse: `tools/migrate-legacy/legacy-source.mjs`, `tools/migrate-legacy/legacy-oss-migration.mjs`, `tools/migrate-legacy/mysql-client.mjs`

**Interfaces:**
- CLI 默认 dry-run；`--apply` 才下载、上传、写媒体记录和更新文章。
- 仅处理 `dr_1_news.thumb` 有效且目标文章 `legacy_source_table='dr_1_news'` 的文章；不修改正文或其他迁移内容。
- 同一附件路径只上传/登记一次；多个文章通过 `cover_media_id` 共享媒体 ID。

- [ ] **Step 1: 为附件路径、媒体复用、失败不关联写测试**
- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tools/migrate-legacy/legacy-cover-backfill.test.mjs`
Expected: FAIL，回填执行器尚未实现。

- [ ] **Step 3: 实现源附件选择、20 MB 图片下载校验、日期目录 OSS 上传、媒体登记和文章封面关联**
- [ ] **Step 4: dry-run 列出文章数、唯一附件数、已有绑定数和缺失目标行，不写库**
- [ ] **Step 5: 运行样例 1977 源图片验证并执行封面回填**

验证地址：`https://daxinfawu.com/uploadfile/202610/d3a71f84fefdfee.png`；成功后 OSS 对象位于 `Img/YYYYMMDD/`，文章 1977 的 `cover_media_id` 指向已登记的 `media_assets` 行。

- [ ] **Step 6: 查询验证封面关联和公开卡片 URL**

Expected: 成功上传的文章有 `cover_media_id` 和 OSS `public_url`；失败项仍为空且写入报告，不关联外链。

- [ ] **Step 7: 提交**

```powershell
git add -- tools/migrate-legacy/legacy-cover-backfill.mjs tools/migrate-legacy/legacy-cover-backfill.test.mjs
git commit -m "feat: 从旧站附件回填文章封面"
```

### Task 7: 全量验证与运行预览

**Files:**
- Test existing affected suites; no additional product files unless verification reveals a defect.

- [ ] **Step 1: 运行全部项目测试、静态检查、类型检查和构建**

Run: `npm test`、`npm run check:static`、`npm run typecheck`、`npm run build`（工作目录 `web`）
Expected: 全部 PASS。

- [ ] **Step 2: 检查新分类页面、文章卡片封面和后台新建/编辑表单**

Expected: CPSC 和跨境咨询列表有正确文章；公开卡片显示已上传封面；详情正文不重复显示封面；后台能选完整分类并上传、替换、清除封面。

- [ ] **Step 3: 按此前约定在端口 3002 启动新项目并报告数据库/OSS回填数量**

若 3002 被占用，先确认占用进程并按用户此前约定停止当前监听进程，再启动新项目；打开首页、文章栏目页和后台文章管理页面验证。

- [ ] **Step 4: 仅提交本任务实际修改文件，并报告验证结果**
