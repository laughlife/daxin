# 旧库迁移核验报告

> 本模板用于记录一次旧库到新库的迁移过程与核验结论。
> 复制为 `docs/migration-report-YYYY-MM-DD.md` 后填写；不要在此文件中记录数据库密码、AccessKey 或 Session。

## 1. 基本信息

| 项目 | 内容 |
| --- | --- |
| 迁移日期（北京时间） | |
| 迁移批次号 `batch_key` | |
| 源库（只读） | `da` |
| 目标库（写入） | `daxin` |
| 执行人 | |
| 使用的命令 | `node tools/migrate-legacy/legacy-migrate.mjs --import --batch <批次号>` |
| dry-run 报告 | `docs/migration-dry-run.json`（生成时间：） |

## 2. 源库只读证明

迁移脚本只允许 `SELECT`，并且执行前后都需要核对源库未被改动。

| 核对项 | 迁移前 | 迁移后 | 结论 |
| --- | --- | --- | --- |
| `da` 表数量 | 76 | | 未变化 |
| `da.cn_list` 行数 | 315 | | 未变化 |
| `da.cn_list_5` 行数 | | | 未变化 |
| 源库连接使用的语句类型 | 仅 SELECT | 仅 SELECT | 无写入 |

记录方式（示例，实际输出粘贴在下表）：

```text
SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='da';
SELECT COUNT(*) FROM da.cn_list;
```

## 3. 目标库结构

| 项目 | 预期 | 实际 |
| --- | --- | --- |
| 业务表数量 | 29 | |
| 索引数量 | 89 | |
| 视图数量 | 1 | |
| 已应用迁移 | `001_initial_schema`、`002_indexes_and_constraints` | |
| DDL 重复执行 | 第二次全部跳过 | |

核对命令：

```powershell
node tools/migrate-legacy/schema-check.mjs --database daxin --apply
```

## 4. 迁移数量核对

dry-run 报告中的数量必须与导入结果一致。

| 项目 | dry-run 预期 | 导入结果 | 差异说明 |
| --- | --- | --- | --- |
| 映射文章数 | 288 | | |
| 有正文的文章 | 273 | | |
| 不同案件号 | | | |
| 案件字段完整数 | | | |
| 图片引用 | 3684 | | |
| 待人工核验项 | | | |

## 5. 案件字段质量

| 缺失字段 | 数量 | 处理方式 |
| --- | --- | --- |
| 原告 | | 进入 `migration_review_items`，后台人工补全 |
| 代理律所 | | 同上 |
| 立案时间 | | 同上 |

低置信度案件（`extraction_rule` 为 `content-fallback`）需要逐条人工确认：

| 案件号 | 来源文章 | 置信度 | 人工结论 |
| --- | --- | --- | --- |
| | | | |

重复案件号（同一案件号出现在多篇文章）需要确认是否同一案件：

| 案件号 | 出现次数 | 涉及文章 | 人工结论 |
| --- | --- | --- | --- |
| | | | |

## 6. 媒体资源

| 项目 | 数量 | 说明 |
| --- | --- | --- |
| 站内 `res/` 引用 | 3684 | 需要从旧站上传到 OSS 后才能显示 |
| 外链引用 | 0 | 外链不作为正式媒体地址 |
| 已登记 `media_assets` | | 迁移时仅登记对象 key，`public_url` 在上传后补全 |

旧站图片物理目录：

- 旧站源码目录：
- `res/` 目录是否存在：
- 上传 OSS 的对象 key 规则：`YYYYMMDD/{uuid}.{ext}`

## 7. 导入后校验

```text
批次文章数：
批次案件数：
待人工核验：
缺少原告的案件：
起诉时间范围：
重复案件号：
```

校验命令：

```powershell
node tools/migrate-legacy/legacy-migrate.mjs --import --batch <批次号>
```

## 8. 回滚步骤

迁移只做插入与更新，不删除源库数据，回滚按批次进行：

```sql
-- 1. 确认批次号
SELECT id, batch_key, status FROM migration_batches WHERE batch_key = '<批次号>';

-- 2. 删除该批次的核验项与案件来源（关系表无外键，需按顺序删除）
DELETE FROM migration_review_items WHERE batch_id = <批次 id>;

-- 3. 删除该批次案件的关系与案件本身
DELETE FROM case_sources WHERE case_id IN (SELECT id FROM cases WHERE migration_batch_id = <批次 id>);
DELETE FROM case_brands WHERE case_id IN (SELECT id FROM cases WHERE migration_batch_id = <批次 id>);
DELETE FROM case_law_firms WHERE case_id IN (SELECT id FROM cases WHERE migration_batch_id = <批次 id>);
DELETE FROM cases WHERE migration_batch_id = <批次 id>;

-- 4. 删除该批次文章及其图片关联
DELETE FROM article_images WHERE article_id IN (SELECT id FROM articles WHERE migration_batch_id = <批次 id>);
DELETE FROM articles WHERE migration_batch_id = <批次 id>;

-- 5. 标记批次已回滚
UPDATE migration_batches SET status = 'rolled_back', notes = CONCAT(notes, ' 已回滚') WHERE id = <批次 id>;
```

> 回滚只影响目标库 `daxin`；任何情况下都不要对源库 `da` 执行删除或更新。

## 9. 遗留问题与结论

| 序号 | 问题 | 影响 | 处理计划 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | | | | |

结论：

- [ ] 源库未被写入
- [ ] 目标库结构与迁移版本一致
- [ ] 数量核对一致或差异已解释
- [ ] 待人工核验项已登记
- [ ] 媒体资源上传计划已确认
- [ ] 回滚步骤已验证
