-- 001_initial_schema.sql
-- 新业务库 daxin 的初始结构（站点配置、媒体、业务、内容、案例、管理员）。
--
-- 约定：
--   1. 只建表，不写数据；重复执行安全（CREATE TABLE IF NOT EXISTS）。
--   2. 主键统一 BIGINT UNSIGNED（业务表 AUTO_INCREMENT，关联表使用组合主键）。
--   3. 不使用外键约束，关联完整性由应用层和迁移校验保证，避免迁移顺序耦合。
--   4. 所有 NOT NULL 列都给出默认值，便于增量加列。
--   5. 事务安全：不含 DROP、TRUNCATE、ALTER 等隐式提交语句。
--   6. 本文件不接触旧库 da，只作用于目标库 daxin。

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------------
-- 站点配置
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS site_settings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  setting_key VARCHAR(128) NOT NULL COMMENT '配置键，例如 site_logo、home_right_image',
  setting_group VARCHAR(64) NOT NULL DEFAULT 'general' COMMENT '配置分组：general、home、about、contact、seo',
  setting_value LONGTEXT NULL COMMENT '配置值，JSON 或纯文本',
  value_type VARCHAR(16) NOT NULL DEFAULT 'text' COMMENT 'text、json、url、image、bool',
  media_id BIGINT UNSIGNED NULL COMMENT '图片类配置关联 media_assets.id',
  version INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '版本号，支持草稿与发布',
  status VARCHAR(16) NOT NULL DEFAULT 'published' COMMENT 'draft、published、archived',
  is_current TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1 表示当前生效版本',
  note VARCHAR(255) NOT NULL DEFAULT '' COMMENT '后台备注',
  updated_by BIGINT UNSIGNED NULL COMMENT '最后修改的管理员 admin_users.id',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_site_settings_key_version (setting_key, version),
  KEY idx_site_settings_current (setting_key, status),
  KEY idx_site_settings_group (setting_group, is_current)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '站点配置（含首页、关于我们、页脚和 SEO）';

CREATE TABLE IF NOT EXISTS media_assets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  object_key VARCHAR(512) NOT NULL COMMENT 'OSS 对象 key，北京时间 YYYYMMDD/{uuid}.{ext}',
  public_url VARCHAR(768) NOT NULL DEFAULT '' COMMENT '由公网域名与 object_key 拼出的访问地址',
  file_name VARCHAR(255) NOT NULL DEFAULT '' COMMENT '原始文件名（仅作展示）',
  mime_type VARCHAR(128) NOT NULL DEFAULT '' COMMENT '服务端校验后的 MIME',
  byte_size BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '文件字节数，上限 20971520',
  width INT UNSIGNED NULL COMMENT '图片宽，非图片为 NULL',
  height INT UNSIGNED NULL COMMENT '图片高，非图片为 NULL',
  usage_scope VARCHAR(32) NOT NULL DEFAULT 'general' COMMENT 'logo、background、banner、article、about、qr、general',
  title VARCHAR(255) NOT NULL DEFAULT '' COMMENT '后台标题或替代文本',
  legacy_source_table VARCHAR(64) NOT NULL DEFAULT '' COMMENT '旧库来源表',
  legacy_source_id BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '旧库来源主键',
  uploaded_by BIGINT UNSIGNED NULL COMMENT '上传管理员 admin_users.id',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL COMMENT '软删除时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_media_assets_object_key (object_key),
  KEY idx_media_assets_usage (usage_scope, deleted_at),
  KEY idx_media_assets_legacy (legacy_source_table, legacy_source_id),
  KEY idx_media_assets_created (usage_scope, created_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'OSS 媒体资源台账';

-- ---------------------------------------------------------------------------
-- 核心业务模块与页脚
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS service_sections (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug VARCHAR(64) NOT NULL COMMENT '板块标识，例如 tro、domestic、overseas、consulting',
  title VARCHAR(128) NOT NULL DEFAULT '' COMMENT '板块标题',
  subtitle VARCHAR(255) NOT NULL DEFAULT '' COMMENT '副标题',
  summary TEXT NULL COMMENT '板块简介',
  icon_key VARCHAR(64) NOT NULL DEFAULT '' COMMENT '图标标识',
  link_path VARCHAR(255) NOT NULL DEFAULT '' COMMENT '跳转路径，首页仅 TRO 板块跳成功案例',
  show_detail_link TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否显示“了解详情”，只有 TRO 全流程处理为 1',
  sort_order INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '排序，从 0 开始',
  status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1 启用，0 停用',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_service_sections_slug (slug),
  KEY idx_service_sections_order (status, sort_order)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '首页核心业务板块';

CREATE TABLE IF NOT EXISTS service_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  section_id BIGINT UNSIGNED NOT NULL COMMENT '所属板块 service_sections.id',
  slug VARCHAR(64) NOT NULL COMMENT '子业务标识',
  title VARCHAR(128) NOT NULL DEFAULT '',
  summary TEXT NULL,
  icon_key VARCHAR(64) NOT NULL DEFAULT '',
  link_path VARCHAR(255) NOT NULL DEFAULT '',
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  status TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_service_items_slug (slug),
  KEY idx_service_items_section (section_id, sort_order)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '核心业务子项';

CREATE TABLE IF NOT EXISTS footer_services (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  item_key VARCHAR(64) NOT NULL COMMENT '稳定标识',
  title VARCHAR(128) NOT NULL DEFAULT '',
  link_path VARCHAR(255) NOT NULL DEFAULT '',
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  status TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_footer_services_key (item_key),
  KEY idx_footer_services_order (status, sort_order)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '页脚业务范围';

CREATE TABLE IF NOT EXISTS footer_links (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  item_key VARCHAR(64) NOT NULL,
  title VARCHAR(128) NOT NULL DEFAULT '',
  link_path VARCHAR(255) NOT NULL DEFAULT '',
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  status TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_footer_links_key (item_key),
  KEY idx_footer_links_order (status, sort_order)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '页脚导航链接';

CREATE TABLE IF NOT EXISTS contact_channels (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  item_key VARCHAR(64) NOT NULL,
  channel_type VARCHAR(32) NOT NULL DEFAULT 'phone' COMMENT 'phone、email、address、wechat、worktime',
  label VARCHAR(128) NOT NULL DEFAULT '',
  value VARCHAR(512) NOT NULL DEFAULT '',
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  status TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_contact_channels_key (item_key),
  KEY idx_contact_channels_order (status, sort_order)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '联系渠道（电话、邮箱、地址等）';

CREATE TABLE IF NOT EXISTS qr_assets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  item_key VARCHAR(64) NOT NULL,
  title VARCHAR(128) NOT NULL DEFAULT '',
  media_id BIGINT UNSIGNED NULL COMMENT 'media_assets.id',
  caption VARCHAR(255) NOT NULL DEFAULT '',
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  status TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_qr_assets_key (item_key),
  KEY idx_qr_assets_order (status, sort_order)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '页脚二维码资源';

-- ---------------------------------------------------------------------------
-- 文章与分类
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS article_categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug VARCHAR(64) NOT NULL COMMENT '分类标识，例如 tro-alert、tro-success、labor-case、freight-case',
  name VARCHAR(128) NOT NULL DEFAULT '',
  section VARCHAR(32) NOT NULL DEFAULT 'news' COMMENT 'news、tro、labor、freight',
  description TEXT NULL,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  status TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_article_categories_slug (slug),
  KEY idx_article_categories_order (status, sort_order)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '文章分类（TRO 预警、TRO 成功案例、劳动法案例、货代案例等）';

CREATE TABLE IF NOT EXISTS articles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug VARCHAR(191) NOT NULL COMMENT 'URL 标识',
  title VARCHAR(255) NOT NULL DEFAULT '',
  summary TEXT NULL COMMENT '摘要，列表页展示',
  content_html LONGTEXT NULL COMMENT '服务端白名单清洗后的正文 HTML',
  content_text LONGTEXT NULL COMMENT '正文纯文本，供检索与摘要兜底',
  category_id BIGINT UNSIGNED NULL COMMENT 'article_categories.id',
  cover_media_id BIGINT UNSIGNED NULL COMMENT '封面 media_assets.id',
  published_at DATETIME NULL COMMENT '发布时间，NULL 表示未发布',
  status VARCHAR(16) NOT NULL DEFAULT 'draft' COMMENT 'draft、published、archived',
  is_featured TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否精选',
  view_count INT UNSIGNED NOT NULL DEFAULT 0,
  legacy_source_table VARCHAR(64) NOT NULL DEFAULT '' COMMENT '旧库来源表，例如 cn_list',
  legacy_source_id BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '旧库来源主键，0 表示本站新建',
  migration_batch_id BIGINT UNSIGNED NULL COMMENT 'migration_batches.id',
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_articles_slug (slug),
  UNIQUE KEY uk_articles_legacy_source (legacy_source_table, legacy_source_id),
  KEY idx_articles_published (status, published_at),
  KEY idx_articles_published_desc (status, published_at DESC),
  KEY idx_articles_category_published (category_id, status, published_at),
  KEY idx_articles_category_order (category_id, status, sort_order),
  KEY idx_articles_featured (is_featured, status, published_at),
  KEY idx_articles_source (legacy_source_table, migration_batch_id),
  KEY idx_articles_batch (migration_batch_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '文章（含 TRO 预警与法治资讯）';

CREATE TABLE IF NOT EXISTS article_images (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  article_id BIGINT UNSIGNED NOT NULL,
  media_id BIGINT UNSIGNED NULL COMMENT 'media_assets.id，NULL 表示仅记录原始外链',
  source_url VARCHAR(768) NOT NULL DEFAULT '' COMMENT '正文中的原始图片地址',
  position INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '在正文中的顺序，从 0 开始',
  alt_text VARCHAR(255) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_article_images_position (article_id, position),
  KEY idx_article_images_media (media_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '文章正文图片与 OSS 资源关联';

-- ---------------------------------------------------------------------------
-- 案例主体与关联
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS brands (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug VARCHAR(191) NOT NULL COMMENT '品牌 URL 标识',
  name VARCHAR(191) NOT NULL DEFAULT '' COMMENT '品牌名称',
  name_en VARCHAR(191) NOT NULL DEFAULT '',
  aliases VARCHAR(512) NOT NULL DEFAULT '' COMMENT '别名，逗号分隔',
  logo_media_id BIGINT UNSIGNED NULL,
  summary TEXT NULL COMMENT '当前维权情况说明',
  case_count INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '冗余统计，仅供列表展示',
  status TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_brands_slug (slug),
  KEY idx_brands_name (name),
  KEY idx_brands_name_en (name_en),
  KEY idx_brands_status (status)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '涉案品牌';

CREATE TABLE IF NOT EXISTS law_firms (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug VARCHAR(191) NOT NULL COMMENT '律所 URL 标识',
  name VARCHAR(191) NOT NULL DEFAULT '' COMMENT '律所名称',
  name_en VARCHAR(191) NOT NULL DEFAULT '',
  aliases VARCHAR(512) NOT NULL DEFAULT '',
  region VARCHAR(64) NOT NULL DEFAULT '',
  summary TEXT NULL,
  case_count INT UNSIGNED NOT NULL DEFAULT 0,
  status TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_law_firms_slug (slug),
  KEY idx_law_firms_name (name),
  KEY idx_law_firms_name_en (name_en),
  KEY idx_law_firms_status (status)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '代理律所';

CREATE TABLE IF NOT EXISTS ip_types (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug VARCHAR(191) NOT NULL COMMENT '侵权类型标识，例如 trademark、copyright、patent',
  name VARCHAR(191) NOT NULL DEFAULT '' COMMENT '侵权类型名称',
  description VARCHAR(512) NOT NULL DEFAULT '',
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  status TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ip_types_slug (slug),
  KEY idx_ip_types_order (status, sort_order)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '侵权类型';

CREATE TABLE IF NOT EXISTS cases (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  case_number VARCHAR(64) NOT NULL COMMENT '案件号，例如 24-cv-00066',
  case_year SMALLINT UNSIGNED NULL COMMENT '起诉年份，由案件号解析',
  case_seq INT UNSIGNED NULL COMMENT '案件序号，由案件号解析',
  case_type VARCHAR(16) NOT NULL DEFAULT 'cv' COMMENT '案件类型段，例如 cv',
  court VARCHAR(191) NOT NULL DEFAULT '' COMMENT '受理法院',
  filed_at DATE NULL COMMENT '起诉时间（旧称立案日期）',
  plaintiff VARCHAR(255) NOT NULL DEFAULT '' COMMENT '原告',
  title VARCHAR(255) NOT NULL DEFAULT '' COMMENT '内部标题，不强制前台展示',
  summary TEXT NULL COMMENT '案件摘要',
  status VARCHAR(32) NOT NULL DEFAULT 'open' COMMENT '内部状态：open、closed、archived，不进入前台列',
  publish_status VARCHAR(16) NOT NULL DEFAULT 'draft' COMMENT 'draft、published、archived',
  legacy_source_table VARCHAR(64) NOT NULL DEFAULT '' COMMENT '旧库来源表',
  legacy_source_id BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '旧库来源主键',
  migration_batch_id BIGINT UNSIGNED NULL,
  verified_at DATETIME NULL COMMENT '人工核验通过时间',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_cases_case_number (case_number),
  KEY idx_cases_filed_at (filed_at),
  KEY idx_cases_filed_desc (publish_status, filed_at DESC),
  KEY idx_cases_year (case_year, publish_status),
  KEY idx_cases_batch (migration_batch_id),
  KEY idx_cases_number (case_number),
  KEY idx_cases_publish (publish_status, filed_at),
  KEY idx_cases_legacy (legacy_source_table, legacy_source_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'TRO 侵权案件主体';

CREATE TABLE IF NOT EXISTS case_progress (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  case_id BIGINT UNSIGNED NOT NULL,
  occurred_on DATE NULL COMMENT '进展发生日期',
  title VARCHAR(191) NOT NULL DEFAULT '',
  content TEXT NULL COMMENT '公开进展文案',
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  migration_item_key VARCHAR(191) NULL COMMENT '迁移幂等键：{batch_key}:{legacy_table}:{legacy_id}:{序号}',
  migration_item_key_safe VARCHAR(191) GENERATED ALWAYS AS (COALESCE(migration_item_key, '')) STORED COMMENT '把 NULL 归一化后参与唯一键',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_case_progress_batch_item (case_id, migration_item_key_safe),
  KEY idx_case_progress_timeline (case_id, occurred_on),
  KEY idx_case_progress_order (case_id, sort_order)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '案件进展时间线';

CREATE TABLE IF NOT EXISTS case_brands (
  case_id BIGINT UNSIGNED NOT NULL,
  brand_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (case_id, brand_id),
  UNIQUE KEY uk_case_brands (case_id, brand_id),
  KEY idx_case_brands_brand (brand_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '案件与品牌多对多';

CREATE TABLE IF NOT EXISTS case_law_firms (
  case_id BIGINT UNSIGNED NOT NULL,
  law_firm_id BIGINT UNSIGNED NOT NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否主代理律所',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (case_id, law_firm_id),
  UNIQUE KEY uk_case_law_firms (case_id, law_firm_id),
  KEY idx_case_law_firms_law_firm (law_firm_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '案件与代理律所多对多';

CREATE TABLE IF NOT EXISTS case_ip_types (
  case_id BIGINT UNSIGNED NOT NULL,
  ip_type_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (case_id, ip_type_id),
  UNIQUE KEY uk_case_ip_types (case_id, ip_type_id),
  KEY idx_case_ip_types_ip_type (ip_type_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '案件与侵权类型多对多';

CREATE TABLE IF NOT EXISTS case_sources (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  case_id BIGINT UNSIGNED NOT NULL,
  source_table VARCHAR(64) NOT NULL COMMENT '旧库来源表',
  source_id BIGINT UNSIGNED NOT NULL COMMENT '旧库来源主键',
  source_title VARCHAR(255) NOT NULL DEFAULT '',
  source_url VARCHAR(768) NOT NULL DEFAULT '',
  extraction_rule VARCHAR(64) NOT NULL DEFAULT '' COMMENT '案件号提取方式：title、content、manual',
  verified TINYINT(1) NOT NULL DEFAULT 0 COMMENT '人工是否已核验',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_case_sources (case_id, source_table, source_id),
  KEY idx_case_sources_source (source_table, source_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '案件与旧库文章来源关联';

-- ---------------------------------------------------------------------------
-- 迁移批次与人工核验
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS migration_batches (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  batch_key VARCHAR(64) NOT NULL COMMENT '批次标识，例如 20261009-01',
  source_name VARCHAR(64) NOT NULL DEFAULT 'da' COMMENT '源库名',
  mode VARCHAR(16) NOT NULL DEFAULT 'dry-run' COMMENT 'dry-run、import',
  status VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT 'pending、running、completed、failed',
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  articles_created INT UNSIGNED NOT NULL DEFAULT 0,
  cases_created INT UNSIGNED NOT NULL DEFAULT 0,
  brands_created INT UNSIGNED NOT NULL DEFAULT 0,
  law_firms_created INT UNSIGNED NOT NULL DEFAULT 0,
  media_created INT UNSIGNED NOT NULL DEFAULT 0,
  review_items_created INT UNSIGNED NOT NULL DEFAULT 0,
  report_path VARCHAR(512) NOT NULL DEFAULT '',
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_migration_batches_batch (batch_key),
  KEY idx_migration_batches_status (status, created_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '旧库迁移批次与统计';

CREATE TABLE IF NOT EXISTS case_related_cases (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  case_id BIGINT UNSIGNED NOT NULL,
  related_case_id BIGINT UNSIGNED NOT NULL,
  relation_type VARCHAR(32) NOT NULL DEFAULT 'brand' COMMENT 'brand、law_firm、ip_type、manual',
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_case_related_cases (case_id, related_case_id),
  KEY idx_case_related_cases_related (related_case_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '案件详情中的历史关联案件';

CREATE TABLE IF NOT EXISTS migration_review_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  batch_id BIGINT UNSIGNED NOT NULL COMMENT 'migration_batches.id',
  entity_type VARCHAR(32) NOT NULL COMMENT 'case、brand、law_firm、ip_type、article、media',
  legacy_source_table VARCHAR(64) NOT NULL COMMENT '旧库来源表',
  legacy_source_id BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '旧库来源主键',
  field_name VARCHAR(64) NOT NULL DEFAULT '' COMMENT '待确认字段，例如 case_number、plaintiff',
  candidate_value VARCHAR(512) NOT NULL DEFAULT '' COMMENT '候选值',
  normalized_value VARCHAR(512) NOT NULL DEFAULT '' COMMENT '归一化后的候选值',
  context_snippet VARCHAR(512) NOT NULL DEFAULT '' COMMENT '原文片段，供人工判断',
  confidence DECIMAL(5,4) NOT NULL DEFAULT 0.0000 COMMENT '提取置信度 0-1',
  status VARCHAR(16) NOT NULL DEFAULT 'open' COMMENT 'open、confirmed、rejected',
  resolved_by BIGINT UNSIGNED NULL COMMENT '处理人 admin_users.id',
  resolved_at DATETIME NULL,
  resolution_note VARCHAR(512) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_migration_review_dedupe (batch_id, entity_type, legacy_source_table, legacy_source_id),
  KEY idx_migration_review_open (status, entity_type),
  KEY idx_migration_review_batch (batch_id, status),
  KEY idx_migration_review_confidence (entity_type, field_name, confidence)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '迁移人工核验队列';

-- ---------------------------------------------------------------------------
-- 管理员、Session 与审计
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS admin_users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(64) NOT NULL COMMENT '登录名',
  display_name VARCHAR(64) NOT NULL DEFAULT '',
  password_hash VARCHAR(255) NOT NULL COMMENT 'Argon2id 或 bcrypt 哈希，禁止明文',
  password_algo VARCHAR(32) NOT NULL DEFAULT 'argon2id',
  email VARCHAR(191) NOT NULL DEFAULT '',
  status VARCHAR(16) NOT NULL DEFAULT 'active' COMMENT 'active、disabled',
  failed_login_count INT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME NULL COMMENT '登录限速锁定截止时间',
  last_login_at DATETIME NULL,
  last_login_ip VARCHAR(64) NOT NULL DEFAULT '' COMMENT '登录 IP 摘要',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_admin_users_username (username),
  KEY idx_admin_users_status (status)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '后台管理员账号';

CREATE TABLE IF NOT EXISTS admin_roles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(32) NOT NULL COMMENT 'admin、editor、viewer',
  name VARCHAR(64) NOT NULL DEFAULT '',
  description VARCHAR(255) NOT NULL DEFAULT '',
  permissions JSON NULL COMMENT '权限码数组，例如 ["article:write","media:write"]',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_admin_roles_code (code)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '后台角色（admin 全量、editor 内容、viewer 只读）';

CREATE TABLE IF NOT EXISTS admin_user_roles (
  user_id BIGINT UNSIGNED NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role_id),
  UNIQUE KEY uk_admin_user_roles (user_id, role_id),
  KEY idx_admin_user_roles_role (role_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '管理员与角色关系';

CREATE TABLE IF NOT EXISTS admin_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL COMMENT 'Session token 的 SHA-256，不存原文',
  ip_digest VARCHAR(64) NOT NULL DEFAULT '' COMMENT '登录 IP 摘要',
  user_agent VARCHAR(255) NOT NULL DEFAULT '',
  expires_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '过期时间，服务端控制，写入时必须显式赋值',
  revoked_at DATETIME NULL COMMENT '退出或强制失效时间',
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_admin_sessions_token_hash (token_hash),
  KEY idx_admin_sessions_user (user_id, expires_at),
  KEY idx_admin_sessions_expiry (revoked_at, expires_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '后台 HttpOnly Session';

CREATE TABLE IF NOT EXISTS admin_login_attempts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(64) NOT NULL DEFAULT '',
  ip_digest VARCHAR(64) NOT NULL DEFAULT '',
  succeeded TINYINT(1) NOT NULL DEFAULT 0,
  reason VARCHAR(64) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_admin_login_attempts_window (username, created_at),
  KEY idx_admin_login_attempts_failed (username, succeeded, created_at),
  KEY idx_admin_login_attempts_ip (ip_digest, created_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '登录尝试记录，用于失败限速';

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL COMMENT '操作管理员 admin_users.id',
  username VARCHAR(64) NOT NULL DEFAULT '' COMMENT '冗余登录名，账号删除后仍可追溯',
  action VARCHAR(64) NOT NULL COMMENT 'create、update、delete、login、logout、upload 等',
  entity_type VARCHAR(48) NOT NULL DEFAULT '' COMMENT 'settings、article、case、brand、law_firm、media、admin_user',
  entity_id BIGINT UNSIGNED NULL,
  before_json JSON NULL COMMENT '变更前快照（脱敏）',
  after_json JSON NULL COMMENT '变更后快照（脱敏）',
  ip_digest VARCHAR(64) NOT NULL DEFAULT '',
  note VARCHAR(512) NOT NULL DEFAULT '',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_admin_audit_logs_created (created_at),
  KEY idx_admin_audit_logs_user (user_id, created_at),
  KEY idx_admin_audit_logs_action (action, created_at),
  KEY idx_admin_audit_logs_entity (entity_type, entity_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '后台操作审计日志';
