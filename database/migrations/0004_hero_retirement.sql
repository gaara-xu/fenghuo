ALTER TABLE owned_heroes ADD COLUMN retired_at datetime(3) DEFAULT NULL COMMENT '流放或斩首后隐藏，保留历史行军引用', ADD COLUMN retired_reason varchar(16) DEFAULT NULL COMMENT 'EXILE流放或EXECUTE斩首';
