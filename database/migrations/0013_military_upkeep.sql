CREATE TABLE IF NOT EXISTS `military_upkeep` (
 `player_id` bigint unsigned NOT NULL,
 `last_game_at` datetime(3) NOT NULL COMMENT '上次军粮结算游戏时间；迁移时锚定，不追收迁移前军粮',
 `fraction` decimal(12,9) NOT NULL DEFAULT 0 COMMENT '不足1单位粮食的小数结余；缺粮时清零，不记负债',
 PRIMARY KEY (`player_id`),
 CONSTRAINT `fk_upkeep_player` FOREIGN KEY (`player_id`) REFERENCES `player_profile` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
