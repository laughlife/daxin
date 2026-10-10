-- 004_repair_duplicate_site_settings.sql
--
-- @data-migration
--
-- 修复 site_settings 的重复行。
--
-- 原因：种子脚本早期版本使用
--   INSERT ... (setting_key, version=1) ... ON DUPLICATE KEY UPDATE version = version + 1
-- 而本表唯一键是 (setting_key, version)。第二次执行会命中 (key,1) 把旧行改成 version=2，
-- 同时再插入一行 version=1，于是每个 key 出现两行 is_current=1；第三次执行插入 version=2
-- 时直接撞唯一键报错。实际结果：26 个 key 各 2 行，共 52 行，其中 52 行都是 is_current=1。
--
-- 修复策略：每个 key 只保留 version 最大的一行（并列时取 id 最小），
-- 其余行标记为历史版本（is_current=0、status='archived'）而不是物理删除，
-- 保留可追溯性；物理删除一条配置历史得不偿失。
--
-- 幂等：重复执行不会改变已有结果（只剩一行 is_current=1 时不会再更新任何行）。

SET NAMES utf8mb4;

-- 1) 非最新版本的当前行降级为历史版本。
UPDATE site_settings s
JOIN (
  SELECT setting_key,
         MAX(version) AS max_version,
         MIN(id) AS keep_id
  FROM site_settings
  GROUP BY setting_key
) m ON m.setting_key = s.setting_key
SET s.is_current = 0,
    s.status = 'archived',
    s.updated_at = NOW()
WHERE s.is_current = 1
  AND (s.version < m.max_version OR (s.version = m.max_version AND s.id > m.keep_id));

-- 2) 同一 key 在同一版本上若仍有重复（脏数据），只保留 id 最小的一行。
UPDATE site_settings s
JOIN (
  SELECT setting_key, version, MIN(id) AS keep_id
  FROM site_settings
  GROUP BY setting_key, version
  HAVING COUNT(*) > 1
) d ON d.setting_key = s.setting_key AND d.version = s.version
SET s.is_current = 0,
    s.status = 'archived',
    s.updated_at = NOW()
WHERE s.is_current = 1 AND s.id > d.keep_id;
