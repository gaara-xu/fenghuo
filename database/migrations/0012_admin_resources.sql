CREATE TABLE IF NOT EXISTS `admin_resource_grants` (
 `player_id` bigint unsigned NOT NULL,
 `client_action_id` char(36) NOT NULL,
 `amounts_json` json NOT NULL COMMENT '本次增加food,wood,stone,iron,gold,coupon；不是覆盖余额',
 `result_json` json NOT NULL COMMENT '请求编号、增加量、操作后余额、现实完成时间；七日幂等凭据',
 `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY (`player_id`,`client_action_id`),
 KEY `idx_resource_grant_recent` (`player_id`,`created_at`),
 CONSTRAINT `fk_resource_grant_player` FOREIGN KEY (`player_id`) REFERENCES `player_profile` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
