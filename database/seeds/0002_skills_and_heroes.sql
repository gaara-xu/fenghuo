-- 0002 内容升级。仅修改指定目录数据，不重置钱包、招募、英雄、战报。
USE fenghuo;
INSERT IGNORE INTO hero_definitions (code,name,star,attack_type,melee_attack,ranged_attack,melee_defense,ranged_defense,speed,load_capacity,stamina_max,source_status,description) VALUES
('zhang_han','章邯',6,'MELEE',2187,0,4375,4375,5000,50000,120,'ESTIMATED','后期六星属性参考网络属性表：近攻2187、双防4375、速度5000、负重50000；原表未注明等级与天赋，仍待校准。'),
('shen_shanshan','神珊珊',6,'BALANCED',35000,35000,40000,40000,4900,100000,150,'DIY','依城主记忆定制的稀有六星：速度略低于章邯，攻击、防御、负重远超其他六星。尚未找到确切历史属性；本配置不是官方原始数值。酒馆权重最低，无保底。'),
('meng_tian','蒙恬',3,'MELEE',120,0,70,45,100,110,100,'ESTIMATED','三星近战武将；具体属性暂按单机平衡配置，待历史数值校准。'),
('wang_ben','王贲',3,'RANGED',0,120,45,70,102,110,100,'ESTIMATED','三星远程武将；具体属性暂按单机平衡配置，待历史数值校准。');
UPDATE hero_definitions SET portrait_key=code WHERE code IN ('zhang_han','qin_shihuang','wu_wang_helv','yue_wang_goujian','zhuangzi','song_xianggong','youxia','ru_sheng','meng_tian','wang_ben','shen_shanshan') AND (portrait_key IS NULL OR portrait_key='');
UPDATE skill_definitions SET effect_type='MELEE_ATTACK_PERCENT',target_scope='SELF_ONE',trigger_rate=0.2,max_level=10,icon_key='rexue',effect_config='{"base":10,"perLevel":5,"ratePerLevel":0.04,"mode":"ATTACK"}',source_status='ESTIMATED',description='进攻时概率提高我方一个兵种的近战攻击。参考满级：60%概率、近攻提升60%。技能与科技加成相加，不连乘。当前单英雄模式作用于英雄近攻；低级曲线为估算。' WHERE code='rexue';
UPDATE skill_definitions SET effect_type='RANGED_ATTACK_PERCENT',target_scope='SELF_ONE',trigger_rate=0.2,max_level=10,icon_key='jingzhun',effect_config='{"base":10,"perLevel":5,"ratePerLevel":0.04,"mode":"ATTACK"}',source_status='ESTIMATED',description='进攻时概率提高我方一个兵种的远程攻击。参考满级：60%概率、远攻提升60%。与科技加成相加；当前单英雄模式作用于英雄远攻，低级曲线为估算。' WHERE code='jingzhun';
UPDATE skill_definitions SET effect_type='ATTACK_PERCENT',target_scope='SELF',trigger_rate=0.5,max_level=10,icon_key='kuangre',effect_config='{"base":20,"perLevel":5,"ratePerLevel":0.05,"mode":"ATTACK"}',source_status='ESTIMATED',description='进攻时概率提高我方全军的近战和远程攻击。参考满级：100%概率、全攻提升70%。与科技加成相加；低级曲线为估算。' WHERE code='kuangre';
UPDATE skill_definitions SET effect_type='ENEMY_MELEE_ATTACK_REDUCE',target_scope='ENEMY_ONE',trigger_rate=0.2,max_level=10,icon_key='fushi',effect_config='{"base":10,"perLevel":5,"ratePerLevel":0.04,"mode":"DEFENSE"}',source_status='ESTIMATED',description='仅防守时生效：概率削弱敌方一个兵种的近战攻击。不是降低防御。主动出征不会发动；触发率与成长数值暂为估算。' WHERE code='fushi';
UPDATE skill_definitions SET effect_type='ENEMY_RANGED_ATTACK_REDUCE',target_scope='ENEMY_ONE',trigger_rate=0.2,max_level=10,icon_key='chuanci',effect_config='{"base":10,"perLevel":5,"ratePerLevel":0.04,"mode":"DEFENSE"}',source_status='ESTIMATED',description='仅防守时生效：概率削弱敌方一个兵种的远程攻击。不是忽略防御。主动出征不会发动；触发率与成长数值暂为估算。' WHERE code='chuanci';
UPDATE skill_definitions SET effect_type='ATTACK_REDUCE',target_scope='ENEMY',trigger_rate=0.3,max_level=10,icon_key='jiaoxie',effect_config='{"base":10,"perLevel":5,"ratePerLevel":0.04,"mode":"DEFENSE"}',source_status='ESTIMATED',description='仅防守时生效：概率削弱敌方全军近战与远程攻击。主动出征不会发动；触发率与成长数值暂为估算。' WHERE code='jiaoxie';
UPDATE skill_definitions SET effect_type='TECH_ATTACK_PERCENT',target_scope='SELF',trigger_rate=0.5,max_level=10,icon_key='xueyuan',effect_config='{"base":10,"perLevel":6,"ratePerLevel":0.05,"mode":"ATTACK"}',source_status='ESTIMATED',description='进攻时提升本次战斗的科技攻击加成，并非增加经验。科技全满时仍可生效；本单机模式按基础攻击乘技能百分比追加攻击，具体成长曲线暂为估算。' WHERE code='xueyuan';
INSERT INTO skill_levels (skill_definition_id,level,effect_value,upgrade_exp,same_book_cost)
SELECT s.id,l.level_no,CAST(JSON_UNQUOTE(JSON_EXTRACT(s.effect_config,'$.base')) AS DECIMAL(12,4))+l.level_no*CAST(JSON_UNQUOTE(JSON_EXTRACT(s.effect_config,'$.perLevel')) AS DECIMAL(12,4)),l.level_no*100,1
FROM skill_definitions s JOIN (SELECT 0 level_no UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10) l
WHERE s.code IN ('rexue','jingzhun','kuangre','fushi','chuanci','jiaoxie','xueyuan')
ON DUPLICATE KEY UPDATE effect_value=VALUES(effect_value),upgrade_exp=VALUES(upgrade_exp),same_book_cost=VALUES(same_book_cost);
INSERT IGNORE INTO tavern_pool_entries (pool_id,reward_type,hero_definition_id,weight,talent_weights)
SELECT p.id,'HERO',h.id,CASE h.code WHEN 'shen_shanshan' THEN 1 WHEN 'zhang_han' THEN 10 ELSE 150 END,
JSON_OBJECT('MEDIOCRE',15,'COMMON',40,'GOOD',28,'EXCELLENT',14,'PERFECT',3)
FROM tavern_pools p JOIN hero_definitions h WHERE p.code='hero_standard' AND h.code IN ('shen_shanshan','zhang_han','meng_tian','wang_ben');
UPDATE tavern_pools SET version=version+1 WHERE code IN ('hero_standard','skill_standard');
