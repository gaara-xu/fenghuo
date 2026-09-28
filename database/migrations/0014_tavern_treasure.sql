-- 仅供 update-tavern.ts 在 fenghuo 库中逐条执行；脚本检测已有列、索引和约束，可中断续跑。
ALTER TABLE `tavern_pools` MODIFY COLUMN `pool_type` enum('HERO','SKILL','MIXED','ITEM') NOT NULL;
ALTER TABLE `tavern_pool_entries` MODIFY COLUMN `reward_type` enum('HERO','SKILL_BOOK','ITEM') NOT NULL;
ALTER TABLE `tavern_candidates` MODIFY COLUMN `reward_type` enum('HERO','SKILL_BOOK','ITEM') NOT NULL;
ALTER TABLE `tavern_pool_entries` ADD COLUMN `item_definition_id` bigint unsigned DEFAULT NULL;
ALTER TABLE `tavern_candidates` ADD COLUMN `item_definition_id` bigint unsigned DEFAULT NULL;
ALTER TABLE `tavern_candidates` ADD COLUMN `item_snapshot` json DEFAULT NULL COMMENT '物品抽出时的目录快照；入包后跟随统一物品资料';
ALTER TABLE `tavern_refreshes` ADD COLUMN `select_limit_snapshot` tinyint unsigned DEFAULT NULL COMMENT '本轮可选数量；旧轮次为空时兼容卡池配置';
ALTER TABLE `tavern_pool_entries` ADD UNIQUE KEY `uk_pool_item` (`pool_id`,`reward_type`,`item_definition_id`);
ALTER TABLE `tavern_pool_entries` ADD CONSTRAINT `fk_entry_item` FOREIGN KEY (`item_definition_id`) REFERENCES `item_definitions` (`id`);
ALTER TABLE `tavern_candidates` ADD CONSTRAINT `fk_candidate_item` FOREIGN KEY (`item_definition_id`) REFERENCES `item_definitions` (`id`);
