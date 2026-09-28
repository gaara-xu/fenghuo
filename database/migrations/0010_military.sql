CREATE TABLE IF NOT EXISTS `military_definitions` (
 `code` varchar(64) NOT NULL,
 `name` varchar(64) NOT NULL,
 `kind` enum('TROOP','DEFENSE') NOT NULL,
 `config_json` json NOT NULL COMMENT 'MilitaryDefinition：四项攻防、速度、负重、cost五资源单价、seconds每单位游戏秒、role、description、enabled、sourceStatus、sourceNote',
 `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS `player_forces` (
 `player_id` bigint unsigned NOT NULL,
 `unit_code` varchar(64) NOT NULL,
 `quantity` int unsigned NOT NULL DEFAULT 0 COMMENT '仅本城可用数量，不含训练中和出征中',
 PRIMARY KEY (`player_id`,`unit_code`),
 CONSTRAINT `fk_force_player` FOREIGN KEY (`player_id`) REFERENCES `player_profile` (`id`),
 CONSTRAINT `fk_force_unit` FOREIGN KEY (`unit_code`) REFERENCES `military_definitions` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS `military_orders` (
 `id` bigint unsigned NOT NULL AUTO_INCREMENT,
 `player_id` bigint unsigned NOT NULL,
 `unit_code` varchar(64) NOT NULL,
 `lane` enum('TROOP','DEFENSE') NOT NULL COMMENT '军营和城防各一条串行队列，互不阻塞',
 `quantity` int unsigned NOT NULL,
 `completed` int unsigned NOT NULL DEFAULT 0,
 `seconds_per_unit` int unsigned NOT NULL,
 `start_game_at` datetime(3) NOT NULL,
 `end_game_at` datetime(3) NOT NULL,
 `snapshot_json` json NOT NULL COMMENT '提交时锁定名称、单价、耗时，后台改价不影响已有订单',
 `client_action_id` varchar(64) NOT NULL,
 `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (`id`),
 UNIQUE KEY `uk_military_request` (`player_id`,`client_action_id`),
 KEY `idx_military_queue` (`player_id`,`lane`,`end_game_at`),
 CONSTRAINT `fk_military_order_player` FOREIGN KEY (`player_id`) REFERENCES `player_profile` (`id`),
 CONSTRAINT `fk_military_order_unit` FOREIGN KEY (`unit_code`) REFERENCES `military_definitions` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
