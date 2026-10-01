# 设计令牌说明（design-tokens.md）

> 状态：Task 2 站点壳层阶段的暂定设计系统。正式品牌色、字体与 Logo 确认后，仅需修改 `web/app/assets/styles/tokens.css`，组件无需改动。

令牌文件位置：

- `web/app/assets/styles/tokens.css`：全部 CSS Variables 定义。
- `web/app/assets/styles/main.css`：全局基础样式（通过 `@import './tokens.css'` 引入令牌）。

## 1. 色彩变量

| 变量 | 当前值 | 用途 |
| --- | --- | --- |
| `--color-primary` | `#1f4e8c` | 品牌主色（TODO：正式品牌色待最终确认） |
| `--color-primary-dark` | `#16395f` | 主色加深，hover / 深色底 |
| `--color-primary-light` | `#e9f0fa` | 主色浅底，选中态背景 |
| `--color-accent` | `#c9a45c` | 点缀金色（TODO：待品牌确认） |
| `--color-bg-page` | `#ffffff` | 页面默认背景 |
| `--color-bg-light` | `#f5f7fa` | 浅色分区背景 |
| `--color-bg-dark` | `#101826` | 深色背景（公告栏 / Footer） |
| `--color-bg-overlay` | `rgb(16 24 38 / 55%)` | 移动端菜单遮罩 |
| `--color-text` | `#1f2937` | 正文颜色 |
| `--color-text-muted` | `#6b7280` | 次要文字颜色 |
| `--color-text-inverse` | `#ffffff` | 深色底上的文字 |
| `--color-text-on-primary` | `#ffffff` | 主色底上的文字 |
| `--color-border` | `#e5e7eb` | 常规边框 |
| `--color-border-strong` | `#c7cdd6` | 加重边框 |
| `--color-success` | `#16a34a` | 成功状态 |
| `--color-warning` | `#d97706` | 警告状态 |
| `--color-error` | `#dc2626` | 错误状态 |

规则：核心颜色一律通过变量引用，组件内不得散落硬编码色值（透明度微调可使用 `rgb(... / n%)` 基于既有色彩语义表达）。

## 2. 字体层级

字体族：`--font-family-base`（PingFang SC / Microsoft YaHei / Noto Sans SC / system-ui 等系统字体栈，未引入 Web Font）。

| 变量 | 大小 | 典型用途 |
| --- | --- | --- |
| `--text-xs` | 12px | 辅助说明、公告反馈 |
| `--text-sm` | 14px | 次要链接、子菜单 |
| `--text-base` | 16px | 正文、导航 |
| `--text-lg` | 18px | 卡片标题 |
| `--text-xl` | 20px | 站名、区块小标题 |
| `--text-2xl` | 24px | SectionHeading 默认 |
| `--text-3xl` | 30px | 页面主标题（移动端降为 24px） |
| `--text-4xl` | 36px | 大号标题（移动端降为 28px） |

行高：`--leading-tight: 1.3`（标题）、`--leading-normal: 1.6`（正文）、`--leading-relaxed: 1.8`（长文）。

## 3. 间距规则

4px 基准，`--space-1` 至 `--space-20`：

| 变量 | 值 | | 变量 | 值 |
| --- | --- | --- | --- | --- |
| `--space-1` | 4px | | `--space-6` | 24px |
| `--space-2` | 8px | | `--space-8` | 32px |
| `--space-3` | 12px | | `--space-10` | 40px |
| `--space-4` | 16px | | `--space-12` | 48px |
| `--space-5` | 20px | | `--space-16` | 64px |
| | | | `--space-20` | 80px |

约定：组件内边距优先使用 `--space-2` ~ `--space-6`；区块上下留白使用 `--space-10` ~ `--space-20`。

## 4. 容器宽度

| 变量 | 值 | 用途 |
| --- | --- | --- |
| `--container-max-width` | 1200px | 默认内容宽度 |
| `--container-narrow-width` | 840px | 文章 / 表单类窄容器 |
| `--container-wide-width` | 1400px | 宽屏数据展示 |
| `--container-padding` | 24px（<768px 时 16px） | 容器左右内边距 |
| `--header-height` | 64px | 桌面端 Header 高度 |

对应全局类 `.page-container`（含 `--narrow` / `--wide` 修饰），组件 `PageContainer.vue` 复用该类。

## 5. 圆角和阴影

| 圆角 | 值 | | 阴影 | 定义 |
| --- | --- | --- | --- | --- |
| `--radius-sm` | 4px | | `--shadow-sm` | `0 1px 2px rgb(16 24 38 / 8%)` |
| `--radius-md` | 8px | | `--shadow-md` | `0 4px 12px rgb(16 24 38 / 10%)` |
| `--radius-lg` | 16px | | `--shadow-lg` | `0 12px 32px rgb(16 24 38 / 16%)` |
| `--radius-full` | 9999px | | | |

## 6. 响应式断点

| 断点 | 值 | 说明 |
| --- | --- | --- |
| sm | 640px | 小屏手机：公告栏换行、隐藏 Header CTA |
| md | 768px | 平板：Footer 两列、容器内边距收紧 |
| lg | 1024px | 桌面导航启用阈值（<1024px 显示汉堡菜单） |
| xl | 1280px | 大屏 |

注意：CSS 变量无法用于媒体查询条件，`tokens.css` 中的 `--breakpoint-*` 仅作记录；媒体查询统一使用上表字面量。

## 7. 其他令牌

- 层级：`--z-header: 100`、`--z-nav-dropdown: 120`、`--z-mobile-overlay: 190`、`--z-mobile-panel: 200`。
- 过渡：`--transition-base: 0.2s ease`；`prefers-reduced-motion` 时全局动画降级（见 main.css）。
- 焦点：全局 `:focus-visible` 主色描边；深色区域（公告栏 / Footer / 移动抽屉）使用反色描边。

## 8. 组件使用原则

1. 新组件优先复用 `ui/` 下的基础组件（PageContainer、SectionHeading、BaseButton、BaseCard），不重复造轮子。
2. 组件样式一律引用令牌变量，禁止新增硬编码色值 / 魔法间距；确需新令牌时先加入 `tokens.css` 并更新本文档。
3. 文案、导航、联系方式等来自 `web/app/config/site.ts`，组件内不硬编码内容数据。
4. 使用 scoped style；穿透子组件时使用 `:deep()`，跨组件覆盖需保证足够选择器优先级。
5. 当前阶段使用原生 CSS + CSS Variables，未引入 Tailwind 或第三方 UI 库；如确有需要应单独立任务评估。
