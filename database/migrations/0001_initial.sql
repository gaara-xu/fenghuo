-- 0001 initial schema. Canonical definition: ../schema.sql
-- Deployment tooling applies database/schema.sql for a fresh installation.
-- This migration marker intentionally has no duplicate DDL; schema.sql is the
-- mandatory, complete and data-free structure file requested for this project.
INSERT IGNORE INTO `schema_migrations` (`version`, `description`)
VALUES ('0001', 'initial complete schema');
