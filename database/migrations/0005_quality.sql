-- 更新脚本逐表检查 quality_tier 是否存在后执行对应语句，兼容重复运行。
ALTER TABLE hero_definitions ADD COLUMN quality_tier tinyint unsigned NOT NULL DEFAULT 1 COMMENT '品质1白2蓝3黄4绿5蓝紫6橙黄7红，与星级独立';
ALTER TABLE skill_definitions ADD COLUMN quality_tier tinyint unsigned NOT NULL DEFAULT 1 COMMENT '品质1白2蓝3黄4绿5蓝紫6橙黄7红';
ALTER TABLE item_definitions ADD COLUMN quality_tier tinyint unsigned NOT NULL DEFAULT 1 COMMENT '品质1白2蓝3黄4绿5蓝紫6橙黄7红';
