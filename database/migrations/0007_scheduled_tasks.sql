CREATE TABLE IF NOT EXISTS `scheduled_task_runs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `player_id` bigint unsigned NOT NULL,
  `task_code` varchar(64) NOT NULL COMMENT '任务注册表代码，不接受任意脚本或SQL',
  `request_key` varchar(128) NOT NULL COMMENT '调度器Idempotency-Key，同一任务重试复用',
  `result_json` json NOT NULL COMMENT '成功执行结果；与业务变更同事务提交',
  `completed_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_task_request` (`player_id`,`task_code`,`request_key`),
  KEY `idx_task_recent` (`player_id`,`task_code`,`id`),
  CONSTRAINT `fk_task_run_player` FOREIGN KEY (`player_id`) REFERENCES `player_profile` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
