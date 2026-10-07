# 大信法务官网

新官网与旧 PHPOK 网站隔离，当前为 Nuxt 4 + Vue 3 + TypeScript 静态展示项目，使用本地演示资料。API、数据库及后台维护尚未接入。

## 当前页面（2026-10-07）

- 首页：团队、业务、按北京时间筛选的近三天案件及文章、联系侧栏。
- TRO 案件：案件号/品牌/律所/类型/州/立案日期查询、分页、详情。
- TRO 业务：侵权预警、成功案例、CPSC 召回、科普干货、热点资讯列表及详情。
- 国内业务：劳动纠纷、货代案例、跨境资讯列表及详情。
- 品牌库：商标/专利/版权分类检索、品牌档案与历史发案。
- 常见问题：TRO、劳动争议、跨境干货列表详情，以及原告律所目录及档案。
- 关于我们：团队介绍、业务、成功案例、企业宣讲列表与详情。
- 其他：产品侵权检测演示表单、隐私说明、免责声明。

内容页面采用共享两栏布局，窄屏下改为上下排列。PDF 四种二维码已分别提取并用于对应栏目；页脚团队区展示两个公众号，联系区展示两个咨询号。

## 环境与启动

Node.js 22.19+（或符合 web/package.json engines 的版本），npm 10+。保持 npm 与已提交的 package-lock.json。

```powershell
cd web
npm ci
npm run dev -- --host 127.0.0.1
```

地址：http://127.0.0.1:3000/。Windows 受限执行环境可能不允许文件监听或访问本机端口，可在普通开发终端启动。

## 验证与静态构建

在 `web/` 运行：

```powershell
npm run typecheck
npm run test
npm run generate
npm run check:static
npm run smoke
```

`smoke` 需要正在运行的网站，默认端口 3000，可通过 `SMOKE_BASE_URL` 覆盖。`generate` 产物位于 `web/.output/public`，可用任意支持目录 index.html 的静态服务器预览。

### 浏览器验收

`npm run check:browser` 需要已有 Playwright 运行时。默认导入 `playwright`，也可设置 `PLAYWRIGHT_MODULE` 为安装位置的 `file://` 模块地址；`BROWSER_EXECUTABLE` 可设置为已有 Edge/Chrome 路径；`SMOKE_BASE_URL` 指定开发服务或静态预览地址。无需向生产项目增加依赖。

验收覆盖公告复制、四类二维码对应、文章阅读、关联检索、日期及页码边界、URL 更新/刷新、品牌律所关联、手机无溢出及抽屉焦点。

## 内容与素材维护

- 栏目/文章：`web/app/data/mock/catalog.ts`，修改后重新静态构建。
- 案件：`web/app/data/mock/cases.ts`；品牌/律所档案由 `entities.ts` 自动关联。
- 联系方式：`contacts.ts`；四类二维码：`qr.ts` 和 `web/public/images/qr/`。
- 导航及站点文案：`web/app/config/site.ts`。
- 近三天为北京时间今天及前两天，不包含未来日期。日期固定保存，不能将旧案件日期每日改写为当天。客户端会在跨日后刷新近期展示，无近期资料时显示空状态。

案件、品牌、律所、文章、成功案例及宣讲均明确标为演示，不代表真实办案成果。正式内容、Logo、团队/活动照片、合作伙伴素材及备案信息仍需确认。

本地提交按 AGENTS.md 逐项执行，推送与合并需明确授权。
