-- 同步 schema.sql：技能初始等级修正为 0；现有玩家技能等级保持原值。
ALTER TABLE `owned_hero_skills` MODIFY COLUMN `skill_level` tinyint unsigned NOT NULL DEFAULT 0 COMMENT '技能初学为0级，最高10级';
