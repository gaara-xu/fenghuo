CREATE TABLE IF NOT EXISTS `incoming_raids` (
 `id` bigint unsigned NOT NULL AUTO_INCREMENT,
 `player_id` bigint unsigned NOT NULL,
 `name` varchar(64) NOT NULL,
 `attack_power` bigint unsigned NOT NULL COMMENT '刷新时锁定的总攻击力，不再额外叠加敌方科技',
 `troop_count` int unsigned NOT NULL COMMENT '每100攻击折算1名来袭士兵，最少1名',
 `attack_type` enum('MELEE','RANGED','BALANCED') NOT NULL,
 `origin_x` tinyint unsigned NOT NULL,
 `origin_y` tinyint unsigned NOT NULL,
 `depart_game_at` datetime(3) NOT NULL,
 `arrive_game_at` datetime(3) NOT NULL COMMENT '出发后300游戏秒抵达',
 `loot_rules` json NOT NULL COMMENT 'IncomingRaidRules快照；后台修改不影响已出发军队',
 `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY (`id`),
 KEY `idx_raid_due` (`player_id`,`arrive_game_at`,`id`),
 CONSTRAINT `fk_raid_player` FOREIGN KEY (`player_id`) REFERENCES `player_profile` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
