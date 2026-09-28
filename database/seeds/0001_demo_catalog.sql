-- 开发种子数据。2012 原始资料未核实的数值统一标为 ESTIMATED/DIY，后续可在管理台校准。
USE `fenghuo`;

INSERT INTO `game_clock` (`id`,`real_anchor_at`,`game_anchor_at`,`multiplier`)
VALUES (1, NOW(3), NOW(3), 1.000)
ON DUPLICATE KEY UPDATE `id`=VALUES(`id`);

INSERT INTO `player_profile` (`id`,`display_name`,`city_name`,`nation_code`)
VALUES (1,'城主','烽火城','ZHOU')
ON DUPLICATE KEY UPDATE `display_name`=VALUES(`display_name`);

INSERT INTO `resource_wallet` (`player_id`,`food`,`wood`,`stone`,`iron`,`gold`,`coupon`)
VALUES (1,5000000,5000000,5000000,5000000,5000000,10000)
ON DUPLICATE KEY UPDATE `player_id`=VALUES(`player_id`);

INSERT INTO `hero_definitions`
(`code`,`name`,`star`,`attack_type`,`melee_attack`,`ranged_attack`,`melee_defense`,`ranged_defense`,`speed`,`load_capacity`,`stamina_max`,`source_status`,`description`)
VALUES
('qin_shihuang','秦始皇',6,'BALANCED',126,126,112,112,95,140,120,'ESTIMATED','六星统帅；当前数值为待考证的游戏化配置。'),
('wu_wang_helv','吴王阖闾',5,'MELEE',116,82,106,91,92,120,110,'ESTIMATED','偏近战的五星英雄。'),
('yue_wang_goujian','越王勾践',5,'DEFENSE',91,88,119,113,84,128,115,'ESTIMATED','偏防守和负重的五星英雄。'),
('zhuangzi','庄子',4,'RANGED',72,102,78,94,98,108,105,'ESTIMATED','偏远程的四星英雄。'),
('song_xianggong','宋襄公',3,'BALANCED',76,76,72,72,88,96,100,'ESTIMATED','均衡型三星英雄。'),
('youxia','游侠',2,'MELEE',58,40,48,42,102,75,100,'DIY','通用低星近战英雄。'),
('ru_sheng','儒生',1,'RANGED',28,46,31,41,80,62,100,'DIY','通用低星远程英雄。')
ON DUPLICATE KEY UPDATE `name`=VALUES(`name`),`star`=VALUES(`star`),`attack_type`=VALUES(`attack_type`),`melee_attack`=VALUES(`melee_attack`),`ranged_attack`=VALUES(`ranged_attack`),`melee_defense`=VALUES(`melee_defense`),`ranged_defense`=VALUES(`ranged_defense`),`speed`=VALUES(`speed`),`load_capacity`=VALUES(`load_capacity`),`stamina_max`=VALUES(`stamina_max`),`source_status`=VALUES(`source_status`),`description`=VALUES(`description`);

INSERT INTO `skill_definitions`
(`code`,`name`,`rarity`,`effect_type`,`target_scope`,`trigger_rate`,`max_level`,`effect_config`,`source_status`,`description`)
VALUES
('rexue','热血',5,'ATTACK_PERCENT','SELF',0.1800,10,JSON_OBJECT('base',5,'perLevel',2),'ESTIMATED','战斗中概率提高攻击，参数可在管理台调整。'),
('jingzhun','精准',5,'RANGED_ATTACK_PERCENT','SELF',0.1800,10,JSON_OBJECT('base',6,'perLevel',2),'ESTIMATED','战斗中概率提高远程攻击。'),
('kuangre','狂热',4,'MELEE_ATTACK_PERCENT','SELF',0.2200,10,JSON_OBJECT('base',5,'perLevel',1.8),'ESTIMATED','战斗中概率提高近战攻击。'),
('fushi','腐蚀',4,'DEFENSE_REDUCE','ENEMY',0.2000,10,JSON_OBJECT('base',4,'perLevel',1.5),'ESTIMATED','概率降低敌方防御。'),
('chuanci','穿刺',4,'IGNORE_DEFENSE','ENEMY',0.1600,10,JSON_OBJECT('base',5,'perLevel',1.5),'ESTIMATED','概率忽略部分防御。'),
('jiaoxie','缴械',5,'ATTACK_REDUCE','ENEMY',0.1400,10,JSON_OBJECT('base',5,'perLevel',1.5),'ESTIMATED','概率降低敌方攻击。'),
('xueyuan','学院',3,'EXPERIENCE_PERCENT','SELF',1.0000,10,JSON_OBJECT('base',3,'perLevel',1),'ESTIMATED','提高英雄获得的经验。')
ON DUPLICATE KEY UPDATE `name`=VALUES(`name`),`rarity`=VALUES(`rarity`),`effect_type`=VALUES(`effect_type`),`target_scope`=VALUES(`target_scope`),`trigger_rate`=VALUES(`trigger_rate`),`max_level`=VALUES(`max_level`),`effect_config`=VALUES(`effect_config`),`source_status`=VALUES(`source_status`),`description`=VALUES(`description`);

INSERT INTO `tavern_pools`
(`code`,`name`,`pool_type`,`currency_code`,`refresh_cost`,`candidate_count`,`select_limit`,`version`,`enabled`)
VALUES
('hero_standard','聚贤馆·英雄','HERO','gold',10000,3,1,1,1),
('skill_standard','藏书阁·技能','SKILL','gold',6000,3,1,1,1)
ON DUPLICATE KEY UPDATE `name`=VALUES(`name`),`pool_type`=VALUES(`pool_type`),`currency_code`=VALUES(`currency_code`),`refresh_cost`=VALUES(`refresh_cost`),`candidate_count`=VALUES(`candidate_count`),`select_limit`=VALUES(`select_limit`),`enabled`=VALUES(`enabled`);

INSERT IGNORE INTO `tavern_pool_entries` (`pool_id`,`reward_type`,`hero_definition_id`,`weight`,`talent_weights`)
SELECT p.id,'HERO',h.id,
  CASE h.star WHEN 6 THEN 20 WHEN 5 THEN 90 WHEN 4 THEN 210 WHEN 3 THEN 300 WHEN 2 THEN 230 ELSE 150 END,
  JSON_OBJECT('MEDIOCRE',15,'COMMON',40,'GOOD',28,'EXCELLENT',14,'PERFECT',3)
FROM `tavern_pools` p JOIN `hero_definitions` h
WHERE p.code='hero_standard';

INSERT IGNORE INTO `tavern_pool_entries` (`pool_id`,`reward_type`,`skill_definition_id`,`weight`)
SELECT p.id,'SKILL_BOOK',s.id,
  CASE s.rarity WHEN 5 THEN 70 WHEN 4 THEN 150 ELSE 260 END
FROM `tavern_pools` p JOIN `skill_definitions` s
WHERE p.code='skill_standard';

INSERT IGNORE INTO `skill_levels` (`skill_definition_id`,`level`,`effect_value`,`upgrade_exp`,`same_book_cost`)
SELECT s.id,l.level_no,
  CAST(JSON_UNQUOTE(JSON_EXTRACT(s.effect_config,'$.base')) AS DECIMAL(12,4)) +
    (l.level_no - 1) * CAST(JSON_UNQUOTE(JSON_EXTRACT(s.effect_config,'$.perLevel')) AS DECIMAL(12,4)),
  (l.level_no - 1) * 100,1
FROM `skill_definitions` s
JOIN (
  SELECT 1 level_no UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5
  UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10
) l ON l.level_no <= s.max_level;

INSERT IGNORE INTO `map_nodes`
(`node_type`,`name`,`level`,`x`,`y`,`defense_bias`,`garrison_config`,`reward_config`,`reward_hint`,`status`)
VALUES
('OUTPOST','黑风寨',3,18,14,'MELEE',JSON_OBJECT('power',260),JSON_OBJECT('food',1800,'wood',900),'粮食、木材','ACTIVE'),
('WILD','赤土荒原',5,31,20,'RANGED',JSON_OBJECT('power',520),JSON_OBJECT('stone',2600,'iron',1200),'石料、铁矿','ACTIVE'),
('DUNGEON','长平遗迹',8,47,33,'BALANCED',JSON_OBJECT('power',1100),JSON_OBJECT('gold',3000,'heroExp',600),'金币、英雄经验','ACTIVE'),
('SYSTEM_CITY','北原城',12,67,42,'BALANCED',JSON_OBJECT('power',2400),JSON_OBJECT('food',8000,'wood',5000,'stone',5000),'大量资源','ACTIVE'),
('RANDOM_CITY','流民营寨',6,25,55,'BALANCED',JSON_OBJECT('power',720),JSON_OBJECT('food',3200,'gold',900),'随机资源','ACTIVE');

INSERT INTO `game_settings` (`setting_key`,`setting_value`,`value_type`,`description`)
VALUES
('ruleset_version','2012-year-end-inspired','STRING','目标玩法版本；未考证参数以 ESTIMATED 标识'),
('buildings_mode','MAXED_EXCEPT_DEFENSE','STRING','普通建筑和科技默认全满，仅开放城防建设'),
('max_battle_skill_triggers_per_side','4','INTEGER','2012 资料记载的单场每方随机技能触发上限')
ON DUPLICATE KEY UPDATE `setting_value`=VALUES(`setting_value`),`value_type`=VALUES(`value_type`),`description`=VALUES(`description`);

INSERT IGNORE INTO `city_defenses` (`player_id`,`defense_type`,`level`,`quantity`,`damaged_quantity`)
VALUES (1,'城墙',20,0,0),(1,'箭塔',20,0,0),(1,'陷阱',20,0,0);
