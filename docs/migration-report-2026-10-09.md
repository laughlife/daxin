# 旧库迁移核验报告（2026-10-09）

## 1. 基本信息

| 项目 | 内容 |
| --- | --- |
| 迁移日期（北京时间） | 2026-10-09 |
| 迁移批次号 `batch_key` | `20261009-01` |
| 源库（只读） | `da`（76 张旧站表） |
| 目标库（写入） | `daxin` |
| 执行命令 | `node tools/migrate-legacy/legacy-migrate.mjs --import --batch 20261009-01` |
| dry-run 报告 | `docs/migration-dry-run.json`（可随时用 `--dry-run` 重新生成） |
| 隔离验证库 | `daxin_import_dev`（先验证幂等后再写入 `daxin`） |

## 2. 源库只读证明

迁移工具链（`tools/migrate-legacy/legacy-source.mjs`）只使用 `SELECT`；
`legacy-migrate.mjs` 在执行 `--import` 前会拒绝目标库与源库同名的配置。

| 核对项 | 迁移前 | 迁移后 | 结论 |
| --- | --- | --- | --- |
| `da` 表数量 | 76 | 76 | 未变化 |
| `da.cn_list` 行数 | 315 | 315 | 未变化 |
| `da.cn_list_5` 行数 | 273 | 273 | 未变化 |
| `da.cn_res` 行数 | 5677 | 5677 | 未变化 |
| 源库写入语句 | 无 | 无 | 全程只读 |

## 3. 目标库结构

| 项目 | 预期 | 实际 |
| --- | --- | --- |
| 业务表数量 | 29 | 29 |
| 索引数量 | 89 | 89 |
| 视图数量 | 1 | 1 |
| 已应用迁移 | `001_initial_schema`、`002_indexes_and_constraints` | 一致 |
| DDL 重复执行 | 第二次全部跳过 | 通过（`--force` 重放亦通过） |

## 4. 迁移数量核对

| 项目 | dry-run 预期 | 隔离库 | daxin 实际 |
| --- | --- | --- | --- |
| 映射文章数 | 288 | 288 | 288 |
| 有正文的文章 | 273 | 273 | 273 |
| 不同案件号 | 832 | 832 | 832 |
| 案件来源关联 | 863 | 863 | 863 |
| 品牌 | — | 228 | 228 |
| 律所 | — | 95 | 95 |
| 图片关联行 | — | 3690 | 3690 |
| 媒体资源 | 3684 | 3684 | 3684 |
| 待人工核验（去重后） | 101（提交）/ 34 | 34 | 34 |
| 重复案件号 | 0 | 0 | 0 |

幂等性验证：在隔离库对同一批次连续执行两次导入，`articles`、`cases`、`brands`、
`law_firms`、`article_images`、`case_brands`、`case_law_firms`、`case_sources`、
`media_assets`、`migration_review_items` 的行数完全一致，未产生重复数据。

## 5. 案件字段质量

| 字段 | 已填充 | 缺失 | 处理方式 |
| --- | --- | --- | --- |
| 原告 | 800 / 832 | 32 | 进入 `migration_review_items`，后台人工补全 |
| 起诉时间 | 818 / 832 | 14 | 同上 |
| 受理法院 | 5 / 832 | 827 | 旧站仅 19 篇提到法院，不阻断公开列表六列展示 |

案件号提取来源分布（dry-run）：

| 来源 | 数量 | 置信度 |
| --- | --- | --- |
| 正文“案件号/案件编号”标签 | 804 | 1.0 或 0.75 |
| 标题中的案件号 | 9 | 1.0 |
| 正文正则兜底 | 19 | 0.25 |

低置信兜底案件必须在后台逐条人工确认后再对外展示；这类记录已进入核验队列。

重复案件号 30 个（同一案件号出现在多篇文章），已合并为单条 `cases` 记录，
并通过 `case_sources` 保留全部来源文章，后台可按来源追溯。

## 6. 媒体资源

| 项目 | 数量 | 说明 |
| --- | --- | --- |
| 站内 `res/` 引用 | 3684 | 对象 key 为 `res/YYYYMM/DD/<name>.<ext>` |
| 外链引用 | 0 | — |
| 已登记 `media_assets` | 3684 | `public_url` 为空，上传 OSS 后补全 |
| 已关联 `article_images` | 3690 | 同一图片在同一文章重复出现时按位置分别记录 |

后续动作：把旧站 `res/` 目录图片按 `YYYYMMDD/{uuid}.{ext}` 上传 OSS，
再回填 `media_assets.public_url` 与 `byte_size`、`mime_type`。当前缺失不影响迁移正确性。

## 7. 导入后校验输出

```text
批次文章数：288
批次案件数：832
待人工核验：34
缺少原告的案件：32
起诉时间范围：2021-10-14 ~ 2025-01-06
重复案件号：0
```

## 8. 回滚步骤

迁移只做插入与更新，源库不参与回滚。

```sql
SELECT id, batch_key, status FROM migration_batches WHERE batch_key = '20261009-01';

DELETE FROM migration_review_items WHERE batch_id = 1;
DELETE FROM case_sources WHERE case_id IN (SELECT id FROM cases WHERE migration_batch_id = 1);
DELETE FROM case_brands WHERE case_id IN (SELECT id FROM cases WHERE migration_batch_id = 1);
DELETE FROM case_law_firms WHERE case_id IN (SELECT id FROM cases WHERE migration_batch_id = 1);
DELETE FROM cases WHERE migration_batch_id = 1;
DELETE FROM article_images WHERE article_id IN (SELECT id FROM articles WHERE migration_batch_id = 1);
DELETE FROM articles WHERE migration_batch_id = 1;
UPDATE migration_batches SET status = 'rolled_back' WHERE id = 1;
```

> 品牌、律所与媒体为共享主体表，回滚时保留：它们可能已被后续批次或其他内容引用。

## 9. 遗留问题与结论

| 序号 | 问题 | 影响 | 处理计划 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 34 项人工核验（缺原告 32、缺起诉时间 14、缺律所等） | 案件详情字段不完整 | 后台核验页面逐条确认 | 待处理 |
| 2 | 19 个低置信兜底案件号 | 可能含历史案件提及 | 后台核验时人工判定或删除 | 待处理 |
| 3 | 30 个重复案件号合并后的归属 | 需确认是否同一案件 | 核验时按 `case_sources` 追溯 | 待处理 |
| 4 | 3684 个旧站图片尚未上传 OSS | 前台图片无法显示 | Task 5 完成后批量上传并回填 | 待处理 |
| 5 | 受理法院仅 5 条有值 | 前台不展示法院列，暂不影响 | 后续按需补充 | 可接受 |
| 6 | 密码哈希使用 scrypt 而非 Argon2id | 与 design 字面要求有差异 | 引入 argon2id 后按 `needsRehash` 平滑升级 | 已记录 |

结论：

- [x] 源库未被写入
- [x] 目标库结构与迁移版本一致
- [x] 数量核对一致，重复导入无重复数据
- [x] 待人工核验项已登记
- [ ] 媒体资源上传 OSS（Task 5）
- [x] 回滚步骤已确认
