# 实施进度

## 2026-10-01 — Task 1：建立项目和执行规则

### 改动

- 在独立工作区创建最小 Nuxt 4 + Vue 3 + TypeScript npm 工程 `web/`。
- 锁定前端直接依赖并生成 npm lockfile；补充 `typecheck` 脚本及所需开发依赖。
- 创建根目录 README，说明环境基线、当前 Mock 数据边界、目录结构及干净环境操作命令。
- 创建 `api/` 第二阶段 Laravel 13 + Filament 5 占位说明。
- 创建阻塞记录、根目录与前端 `.gitignore`、Node 22 `.nvmrc`。
- 未实现设计令牌、Header/Footer、布局、业务页面或后端工程；未修改旧 PHP 网站。

### 实际验证

验证环境：Windows，Node.js `v24.16.0`，npm `11.17.0`。README 的项目基线仍为 Node.js 22 LTS（22.19.0+）。

- `npm install`（`web/`）：成功，执行 `nuxt prepare` 并生成 `.nuxt` 类型文件；生成 `package-lock.json`。npm 11 提示 `esbuild@0.28.2` 的安装脚本尚未列入 `allowScripts`，不影响后续类型检查或构建。
- 首次 `npm run typecheck`（`web/`）：失败。原因是 TypeScript `7.0.2` 不再导出 `typescript/lib/tsc`，与当前 `vue-tsc@3.3.11` 不兼容。将 TypeScript 锁定为兼容的 `5.9.3` 后重新安装。
- `npm ci`（`web/`）：成功，从 lockfile 干净安装 593 个包并成功执行 `nuxt prepare`；同样出现上述非阻塞 `allowScripts` 提示。
- `npm run typecheck`（`web/`，修复后及 `npm ci` 后）：成功，退出码 0，无类型错误。
- `npm run build`（`web/`，修复后及 `npm ci` 后）：成功，退出码 0；Nuxt 4.5.2 完成客户端、服务端与 Nitro node-server 构建，输出到 `.output/`。Node 24 下出现依赖包 `@vue/shared` 的 `DEP0155` 弃用提示，但构建成功。
- `npm ls --depth=0`（`web/`）：成功，确认顶层依赖为 Nuxt 4.5.2、Vue 3.5.43、Vue Router 5.3.1、TypeScript 5.9.3、vue-tsc 3.3.11。

### 验收结论

Task 1 验收通过：新项目目录结构清晰，旧 PHP 网站未被删除、覆盖或修改；根 README 包含从干净环境安装、开发启动、类型检查、生产构建和预览所需命令。

## 2026-10-01 — Task 2：建立官网全局设计系统与站点壳层

### 改动

- 设计令牌：新增 `web/app/assets/styles/tokens.css`（品牌色、深色/浅色背景、正文/次要文字、边框、成功/警告/错误色、容器宽度、间距、圆角、阴影、字体层级、响应式断点、z-index、过渡）与 `main.css`（box-sizing 统一、body/链接/图片/按钮基础样式、页面容器 `.page-container`、`:focus-visible` 焦点样式、移动端与 reduced-motion 适配）。
- 全局配置：新增 `web/app/config/site.ts`（站名、副标题、Logo/微信号/电话/邮箱/地址占位、主导航、Footer 导航、产品侵权检测 CTA、ICP/版权/隐私/免责占位）与 `web/app/types/site.ts`；导航数据单一来源，组件不硬编码。
- 新增 `web/app/composables/useCopyText.ts`：纯前端复制逻辑，Clipboard API 不可用时降级 `execCommand`，返回 copied/failed 状态。
- 布局与壳层组件：`app.vue` 移除 NuxtWelcome，改为 NuxtRouteAnnouncer + NuxtLayout + NuxtPage；新增 `layouts/default.vue`（公告栏 + Header + 主内容区 + Footer）；新增 `SiteAnnouncement`（复制微信号 + aria-live 反馈）、`SiteHeader`（Logo 占位、站名、CTA、汉堡按钮、sticky）、`DesktopNavigation`（点击/键盘开合子菜单、Escape 与点击外部关闭、当前路由高亮）、`MobileNavigation`（遮罩 + 抽屉、Escape 关闭、body 滚动锁定、子菜单手风琴、点击后关闭）、`SiteFooter`（公司信息/业务导航/联系方式/ICP/版权/隐私/免责占位）。
- 通用 UI 组件：`PageContainer`、`SectionHeading`、`BaseButton`、`BaseCard`，均支持 props/插槽复用。
- 预览页：新增 `pages/index.vue`，明确标注为“Task 2 站点壳层预览，非正式首页”，含主/次按钮、SectionHeading、三个 BaseCard 与色彩令牌示例。
- 元信息：`nuxt.config.ts` 配置 `lang="zh-CN"`、viewport、默认 description；`app.vue` 通过 useHead 配置默认标题与 titleTemplate。未修改 robots.txt 生产策略。
- 构建配置：`nuxt generate` 关闭链接爬取（`crawlLinks: false`、`routes: ['/']`），避免导航中未实现的规划路由导致预渲染 404。
- 文档：新增 `docs/design-tokens.md`、`docs/navigation-map.md`，更新 `docs/progress.md`、`docs/blockers.md`。
- 依赖：零新增，仍为 Nuxt 4.5.2 + Vue 3.5.43 + TypeScript；继续使用 npm 与原 package-lock.json（本次未变更 lockfile）。
- 未连接 Laravel / MySQL / 旧数据库 / 旧 PHP CMS；未开发任何业务页面。

### 实际验证

验证环境：Windows，Node.js v24.16.0，npm 11.17.0（web/ 目录）。

- `npm ci`：成功，593 个包；仍有 esbuild allowScripts 非阻塞提示（与 Task 1 相同）。
- `npm run typecheck`：首次失败——`nuxt.config.ts` 引入的 `app/config/site.ts` 在 node 侧 tsconfig 项目下无法解析 `~/types/site` 别名，改为相对路径导入后通过（退出码 0）。
- `npm run build`：成功，退出码 0。
- `npm run generate`：首次失败——链接爬虫抓取导航中未实现路由（/tro/cases 等）产生预渲染 404；在 nuxt.config 中设置 `nitro.prerender.crawlLinks: false`、`routes: ['/']` 后成功，输出 `.output/public/index.html`。
- 预渲染产物检查：index.html 含 `lang="zh-CN"`、站点标题“大信法务”、页面标题“站点壳层预览”、Header（site-header、复制微信号、产品侵权检测、主导航）与 Footer（site-footer）文本。
- `npm run preview -- --port 3123` + `Invoke-WebRequest http://127.0.0.1:3123/`：HTTP 200，响应含“大信法务”“site-header”“site-footer”“复制微信号”。
- 交互实现说明（本环境未做自动化浏览器点击测试，以下为代码级实现，建议在浏览器中人工复核）：桌面导航子菜单点击/键盘开合、Escape 与点击外部关闭；移动端抽屉遮罩/关闭按钮/Escape 关闭、打开时锁定 body 滚动、抽屉宽度 min(85vw, 320px) 不会在 390px 产生横向滚动；复制按钮通过 aria-live 区域给出成功/失败反馈。

### 验收结论

Task 2 验收通过：站点壳层（公告栏、Header、桌面/移动端导航、Footer）与全局设计系统就绪，`/` 可正常访问，验证命令全部通过；未接入任何后端、数据库或旧 PHP；未新增依赖。正式 Logo、微信二维码、联系方式、品牌色仍为 TODO 占位。

## 2026-10-01 — Task 3 阶段 0：开发基线验证

- 起点提交：8ef6fca（Task 2 最新提交），工作区干净。
- 基线验证（web/，Windows，Node v24.16.0，npm 11.17.0）：npm ci、npm run typecheck、npm run build、npm run generate 全部成功（退出码 0）。
- Task 2 无遗留问题，无需修复即进入 Task 3 开发。
