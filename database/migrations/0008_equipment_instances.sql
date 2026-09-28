CREATE TABLE IF NOT EXISTS `equipment_instances` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `player_id` bigint unsigned NOT NULL,
  `item_definition_id` bigint unsigned NOT NULL,
  `refine_level` tinyint unsigned NOT NULL DEFAULT 0 COMMENT '精炼增量0至9；装备显示1至10级',
  `sockets` tinyint unsigned NOT NULL DEFAULT 0 COMMENT '0至3孔，只有装备可打孔',
  `gems_json` json NOT NULL COMMENT '已镶嵌宝石快照：itemId,name,stat,amount',
  `extra_bonuses` json NOT NULL COMMENT '保留实例级扩展百分比属性',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_instance_player` (`player_id`,`item_definition_id`),
  CONSTRAINT `fk_instance_player` FOREIGN KEY (`player_id`) REFERENCES `player_profile` (`id`),
  CONSTRAINT `fk_instance_item` FOREIGN KEY (`item_definition_id`) REFERENCES `item_definitions` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `forge_operations` (
  `client_action_id` char(36) NOT NULL,
  `player_id` bigint unsigned NOT NULL,
  `request_json` text NOT NULL COMMENT '请求指纹，校验重复请求',
  `result_json` json NOT NULL COMMENT '幂等结果快照，保留七天',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`client_action_id`),
  KEY `idx_forge_retention` (`player_id`,`created_at`),
  CONSTRAINT `fk_forge_player` FOREIGN KEY (`player_id`) REFERENCES `player_profile` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- update-equipment.ts checks the column before applying this ALTER (restart safe).
ALTER TABLE `hero_equipment` ADD COLUMN `instance_id` bigint unsigned DEFAULT NULL,
  ADD UNIQUE KEY `uk_equipped_instance` (`instance_id`),
  ADD CONSTRAINT `fk_equipped_instance` FOREIGN KEY (`instance_id`) REFERENCES `equipment_instances` (`id`);
