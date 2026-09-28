ALTER TABLE `item_definitions` ADD COLUMN `deleted_at` datetime(3) DEFAULT NULL COMMENT '藏宝阁回收站；非空时隐藏图鉴、停止掉落和新穿戴，保留原库存与实例';
