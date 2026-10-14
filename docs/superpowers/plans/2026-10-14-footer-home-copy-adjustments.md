# 页脚与首页文案调整实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 移除页脚占位型法律/备案信息，新增可配置备案文案；调整后台默认入口和菜单顺序，并清理公开页自动生成的辅助介绍。

**Architecture:** 继续使用现有站点设置 API 和 `site_settings` 配置，不改数据库结构。页脚从公共站点设置读取备案信息并在底部居中展示；后台首页入口改为文章管理，站点设置移动到末项；公开页只清除标题下方模板生成的浅色说明，不删除真实正文内容。

**Tech Stack:** Nuxt 4、Vue 3、TypeScript、Node.js `node:test`。

**Spec:** 用户在 2026-10-14 明确批准的本轮对话需求。

## Global Constraints

- 不显示隐私声明、免责声明或“备案信息待确认”占位。
- 备案信息通过后台配置维护，并在官网页脚最下方居中显示。
- 首页团队介绍标题读取现有配置。
- 后台菜单将站点设置置于最后，登录后的默认管理页为文章管理。
- 删除官网标题下方浅色辅助介绍，以及类似“输入即时筛选，无需提交；查询条件会同步到 URL，刷新后可恢复。”的操作说明；保留实际字段标签、栏目正文、结果与操作反馈。
- 不改数据库结构，不修改无关内容或用户已有文件。

## Review Focus

- 新增备案字段需要正确映射、保存并从公开设置接口供页脚读取。
- 备案为空时不显示占位文字或空段落。
- 默认后台入口和菜单顺序必须在不同角色可见菜单过滤后仍正确。
- 清理辅助介绍时不得移除真实文章、团队或业务正文。

---

### Task 1: 页脚备案配置及展示

**Files:**
- Modify: `web/app/config/site.ts`
- Modify: `web/app/types/site.ts`
- Modify: `web/app/pages/admin/settings.vue`
- Modify: `web/server/api/public/settings.get.ts`
- Modify: `web/app/components/layout/SiteFooter.vue`
- Create: `database/migrations/016_footer_registration.sql` (data-only, idempotent insert)
- Test: `web/scripts/site-settings-consolidation.test.mjs`
- Test: `web/scripts/footer-registration.test.mjs`

- [ ] 先补测试：后台配置存在中文备案信息字段；数据迁移会幂等新增空配置；页脚不渲染隐私/免责声明链接或待确认占位；配置值非空时在底部居中展示，为空时不渲染。
- [ ] 运行相关测试并确认因当前实现而失败。
- [ ] 在现有页脚配置组加入备案字段，公共设置接口返回该值；页脚只渲染配置值并居中，移除隐私/免责声明链接和静态占位。
- [ ] 运行相关测试、typecheck 和 diff check。
- [ ] 仅暂存本任务文件并提交：`feat: 增加页脚备案信息配置`。

### Task 2: 后台默认页面与菜单顺序

**Files:**
- Modify: `web/app/layouts/admin.vue`
- Modify: `web/app/pages/admin/index.vue`
- Test: `web/scripts/admin-settings.test.mjs`

- [ ] 先补测试：站点设置为菜单最后一项，管理员默认后台入口重定向至文章管理。
- [ ] 运行相关测试确认失败。
- [ ] 调整菜单定义和默认重定向；保留角色过滤及既有授权行为。
- [ ] 运行相关测试、typecheck 和 diff check。
- [ ] 仅暂存本任务文件并提交：`style: 调整后台默认入口与菜单顺序`。

### Task 3: 清理官网与后台辅助说明

**Files:**
- Modify: `web/app/components/home/HomeCoreAdvantages.vue`
- Modify: `web/app/components/cases/CaseSearchPanel.vue`
- Modify: other public page/components identified by `description`/`eyebrow` bindings
- Test: `web/scripts/admin-public-copy-simplification.test.mjs`

- [ ] 先补测试：模板生成的浅色介绍文案及案例查询操作说明不输出；真实团队介绍、字段标签与结果仍存在。
- [ ] 运行相关测试确认失败。
- [ ] 移除匹配该模式的辅助说明配置/组件绑定以及案例查询辅助句；首页团队标题继续读取现有配置。
- [ ] 运行全量 `npm test`、`npm run typecheck`、diff check，并检查公开页预览。
- [ ] 仅暂存本任务文件并提交：`style: 清理官网标题辅助说明`。
