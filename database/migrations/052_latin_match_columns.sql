-- 052_latin_match_columns.sql
--
-- 需求（2026-10-28）：案件里的品牌/律所与目录匹配时，中文译名后缀常不同
-- （Rubik Cube 魔方 vs Rubik's Cube魔方）。改为优先比较英文主干：
-- 取名称中的 ASCII 字母数字、转小写，作为匹配键。
--
-- 用生成列（STORED）自动维护，采集入库无需额外赋值。
--
-- 回滚：ALTER TABLE ... DROP COLUMN xxx_latin;

SET NAMES utf8mb4;

ALTER TABLE brands
  ADD COLUMN name_latin VARCHAR(191) GENERATED ALWAYS AS (LOWER(REGEXP_REPLACE(name, '[^A-Za-z0-9]', ''))) STORED,
  ADD KEY idx_brands_name_latin (name_latin);

ALTER TABLE law_firms
  ADD COLUMN name_latin VARCHAR(191) GENERATED ALWAYS AS (LOWER(REGEXP_REPLACE(name, '[^A-Za-z0-9]', ''))) STORED,
  ADD COLUMN short_latin VARCHAR(191) GENERATED ALWAYS AS (LOWER(REGEXP_REPLACE(short_name, '[^A-Za-z0-9]', ''))) STORED,
  ADD KEY idx_law_firms_name_latin (name_latin),
  ADD KEY idx_law_firms_short_latin (short_latin);

ALTER TABLE cases
  ADD COLUMN brand_latin VARCHAR(191) GENERATED ALWAYS AS (LOWER(REGEXP_REPLACE(brand_name, '[^A-Za-z0-9]', ''))) STORED,
  ADD COLUMN firm_latin VARCHAR(191) GENERATED ALWAYS AS (LOWER(REGEXP_REPLACE(law_firm_name, '[^A-Za-z0-9]', ''))) STORED,
  ADD KEY idx_cases_brand_latin (brand_latin),
  ADD KEY idx_cases_firm_latin (firm_latin);
