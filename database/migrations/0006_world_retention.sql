ALTER TABLE battle_reports ADD COLUMN direction enum('OUTGOING','INCOMING') NOT NULL DEFAULT 'OUTGOING' COMMENT 'OUTGOING主动出征仅留50条；INCOMING被攻击永久保存' AFTER player_id;
ALTER TABLE battle_reports ADD KEY idx_report_direction (player_id,direction,id);
