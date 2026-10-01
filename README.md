# 大信法务官网

本目录是与旧 PHP 网站完全隔离的新官网工程。Task 1 仅建立可运行、可构建的 Nuxt 4 前端骨架和后续 API 目录占位；不会删除、覆盖或修改旧 PHP 网站。

## 当前阶段

- 前端：Nuxt 4、Vue 3、TypeScript，使用 npm 管理依赖。
- 第一阶段仅使用本地 Mock 数据；Laravel API、MySQL 和旧数据库均未接入。
- `api/` 将在第二阶段初始化 Laravel 13 + Filament 5；Task 1 不包含后端工程。
- 当前不包含设计令牌、Header/Footer、站点布局或业务页面。

## 环境要求

### 当前前端

- Node.js 22 LTS（至少 22.19.0；推荐使用根目录 `.nvmrc`）
- npm 10 或更高版本

### 后续后端

- PHP 8.3 或更高版本
- Composer 2

PHP 与 Composer 在 Task 1 无需安装。

## 目录结构

```text
.
├── api/              # 第二阶段 Laravel 13 + Filament 5 占位
├── docs/             # 进度与阻塞记录
├── web/              # Nuxt 4 前端
├── .nvmrc
└── README.md
```

## 从干净环境启动

取得项目文件后，在项目根目录执行：

```bash
nvm use
cd web
npm ci
npm run dev
```

开发服务器默认运行在 `http://localhost:3000`。

如果未安装 Node 版本管理器，请手动安装符合要求的 Node.js 22 LTS，再从 `web/` 目录执行 `npm ci`。

## 验证与构建

以下命令均在 `web/` 目录执行：

```bash
# TypeScript / Vue 类型检查
npm run typecheck

# 生产构建
npm run build

# 本地预览生产构建（先运行 build）
npm run preview
```

必须使用已提交的 `package-lock.json` 和 `npm ci` 进行可复现安装；不要改用其他包管理器生成新的锁文件。
