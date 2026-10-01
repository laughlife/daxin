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
