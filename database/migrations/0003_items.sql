CREATE TABLE IF NOT EXISTS `hero_equipment` (
  `owned_hero_id` bigint unsigned NOT NULL,
  `slot` varchar(32) NOT NULL COMMENT '八个装备槽及两个宝物槽，枚举由服务端验证',
  `item_definition_id` bigint unsigned NOT NULL,
  `equipped_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`owned_hero_id`,`slot`),
  CONSTRAINT `fk_equipped_hero` FOREIGN KEY (`owned_hero_id`) REFERENCES `owned_heroes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_equipped_item` FOREIGN KEY (`item_definition_id`) REFERENCES `item_definitions` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `drop_pools` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(64) NOT NULL,
  `name` varchar(64) NOT NULL,
  `node_type` varchar(32) NOT NULL,
  `min_level` smallint unsigned NOT NULL DEFAULT 1,
  `max_level` smallint unsigned NOT NULL DEFAULT 100,
  `chance` decimal(8,6) NOT NULL DEFAULT 1 COMMENT '每次胜利进行掉落抽选的概率，0至1',
  `rolls` tinyint unsigned NOT NULL DEFAULT 1 COMMENT '独立抽选次数',
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`), UNIQUE KEY `uk_drop_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `drop_pool_entries` (
  `pool_id` bigint unsigned NOT NULL,
  `item_definition_id` bigint unsigned NOT NULL,
  `weight` int unsigned NOT NULL DEFAULT 1,
  `min_quantity` smallint unsigned NOT NULL DEFAULT 1,
  `max_quantity` smallint unsigned NOT NULL DEFAULT 1,
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`pool_id`,`item_definition_id`),
  CONSTRAINT `fk_drop_pool` FOREIGN KEY (`pool_id`) REFERENCES `drop_pools` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_drop_item` FOREIGN KEY (`item_definition_id`) REFERENCES `item_definitions` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `item_use_logs` (
  `client_action_id` char(36) NOT NULL,
  `player_id` bigint unsigned NOT NULL,
  `owned_hero_id` bigint unsigned NOT NULL,
  `item_definition_id` bigint unsigned NOT NULL,
  `result_json` json NOT NULL COMMENT '请求与结果快照，用于重试幂等',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`client_action_id`),
  CONSTRAINT `fk_item_use_player` FOREIGN KEY (`player_id`) REFERENCES `player_profile` (`id`),
  CONSTRAINT `fk_item_use_hero` FOREIGN KEY (`owned_hero_id`) REFERENCES `owned_heroes` (`id`),
  CONSTRAINT `fk_item_use_item` FOREIGN KEY (`item_definition_id`) REFERENCES `item_definitions` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
