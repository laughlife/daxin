-- 005_fix_admin_role_permissions.sql
--
-- @data-migration
--
-- 修正 admin_roles.permissions 与代码里的权限矩阵不一致的问题。
--
-- 背景：种子脚本 migration 002 给 editor 写的是只写权限：
--   ["article:write","case:write","brand:write","law_firm:write","service:write","media:write","settings:write"]
-- 但后台接口的列表与详情需要对应的 :read 权限（web/server/utils/auth/permissions.ts 的
-- ROLE_PERMISSIONS 里 editor 同时具备 read 与 write）。结果 editor 登录后调用
-- GET /api/admin/articles 会直接 403，角色实际不可用。
--
-- 处理：把 admin_roles.permissions 与代码里的 ROLE_PERMISSIONS 对齐，
-- 让数据库中的角色描述与真实生效的权限一致，避免「数据库看起来有权限、实际被拒」的假象。
--
-- 注意：当前鉴权的唯一来源是代码里的 ROLE_PERMISSIONS（按角色码展开），
-- admin_roles.permissions 只作为角色说明；改这里不会放宽或收紧实际权限。
-- 若将来改为读库鉴权，需要同时提供后台角色管理界面并按本表驱动。

SET NAMES utf8mb4;

UPDATE admin_roles
SET permissions = JSON_ARRAY(
  'article:read', 'article:write',
  'case:read', 'case:write',
  'brand:read', 'brand:write',
  'law_firm:read', 'law_firm:write',
  'service:read', 'service:write',
  'media:read', 'media:write',
  'settings:read', 'settings:write',
  'review:read', 'review:write'
)
WHERE code = 'editor';

UPDATE admin_roles
SET permissions = JSON_ARRAY(
  'article:read', 'case:read', 'brand:read', 'law_firm:read',
  'service:read', 'media:read', 'settings:read', 'review:read'
)
WHERE code = 'viewer';

UPDATE admin_roles
SET permissions = JSON_ARRAY('*')
WHERE code = 'admin';
