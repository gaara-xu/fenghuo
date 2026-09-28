-- JSON snapshot extension only. Existing gems and progress are retained unchanged.
-- Seed/update data is transactionally applied by scripts/hero-update-data.ts once.
ALTER TABLE equipment_instances MODIFY COLUMN gems_json json NOT NULL COMMENT '已镶嵌宝石快照：itemId,name,stat,amount,bonuses?,icon?,level?';
