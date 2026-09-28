-- 内容新增仅插入缺失项，不覆盖已有道具或库存。
INSERT IGNORE INTO item_definitions (code,name,item_type,rarity,effect_config,description,enabled) VALUES
('talent_water','天赋水','CONSUMABLE',3,'{"kind":"TALENT","talentWeights":{"MEDIOCRE":15,"COMMON":40,"GOOD":28,"EXCELLENT":14,"PERFECT":3},"sourceStatus":"ESTIMATED"}','重新随机天赋，可能提升、降低或不变。旧版道具机制，概率为单机估算。',1),
('hero_experience_book','英雄经验书','CONSUMABLE',2,'{"kind":"EXPERIENCE","amount":500,"sourceStatus":"ESTIMATED"}','增加500点可分配经验，可用于英雄或技能升级。单机适配。',1),
('hero_stamina_potion','英雄体力药','CONSUMABLE',2,'{"kind":"STAMINA","amount":20,"sourceStatus":"ESTIMATED"}','恢复20点体力，不超过英雄体力上限。',1),
('refine_stone','精炼神石','MATERIAL',3,'{"sourceStatus":"ESTIMATED"}','宝物精炼材料。保留旧版材料特色，精炼功能尚未开放。',1),
('synthesis_stone','合成神石','MATERIAL',3,'{"sourceStatus":"ESTIMATED"}','宝物合成材料。保留旧版材料特色，合成功能尚未开放。',0),
('bronze_helmet','青铜头盔','EQUIPMENT',1,'{"slot":"HELMET","setCode":"BRONZE","bonuses":{"meleeDefense":1,"rangedDefense":1},"sourceStatus":"ESTIMATED"}','青铜防御套装。穿戴两件/五件/八件/十件额外双防+4%/7%/10%/25%（取最高档）。',1),
('bronze_shoulder','青铜肩铠','EQUIPMENT',1,'{"slot":"SHOULDER","setCode":"BRONZE","bonuses":{"meleeDefense":1,"rangedDefense":1},"sourceStatus":"ESTIMATED"}','青铜防御套装。穿戴两件/五件/八件/十件额外双防+4%/7%/10%/25%（取最高档）。',1),
('bronze_armor','青铜胸铠','EQUIPMENT',1,'{"slot":"ARMOR","setCode":"BRONZE","bonuses":{"meleeDefense":1,"rangedDefense":1},"sourceStatus":"ESTIMATED"}','青铜防御套装。穿戴两件/五件/八件/十件额外双防+4%/7%/10%/25%（取最高档）。',1),
('bronze_legs','青铜护腿','EQUIPMENT',1,'{"slot":"LEGS","setCode":"BRONZE","bonuses":{"meleeDefense":1,"rangedDefense":1},"sourceStatus":"ESTIMATED"}','青铜防御套装。穿戴两件/五件/八件/十件额外双防+4%/7%/10%/25%（取最高档）。',1),
('bronze_boots','青铜战靴','EQUIPMENT',1,'{"slot":"BOOTS","setCode":"BRONZE","bonuses":{"meleeDefense":1,"rangedDefense":1},"sourceStatus":"ESTIMATED"}','青铜防御套装。穿戴两件/五件/八件/十件额外双防+4%/7%/10%/25%（取最高档）。',1),
('bronze_necklace','青铜项链','EQUIPMENT',1,'{"slot":"NECKLACE","setCode":"BRONZE","bonuses":{"meleeDefense":1,"rangedDefense":1},"sourceStatus":"ESTIMATED"}','青铜防御套装。穿戴两件/五件/八件/十件额外双防+4%/7%/10%/25%（取最高档）。',1),
('bronze_bracelet','青铜手镯','EQUIPMENT',1,'{"slot":"BRACELET","setCode":"BRONZE","bonuses":{"meleeDefense":1,"rangedDefense":1},"sourceStatus":"ESTIMATED"}','青铜防御套装。穿戴两件/五件/八件/十件额外双防+4%/7%/10%/25%（取最高档）。',1),
('bronze_ring','青铜戒指','EQUIPMENT',1,'{"slot":"RING","setCode":"BRONZE","bonuses":{"meleeDefense":1,"rangedDefense":1},"sourceStatus":"ESTIMATED"}','青铜防御套装。穿戴两件/五件/八件/十件额外双防+4%/7%/10%/25%（取最高档）。',1),
('treasure_meleeattack','一星近攻宝物','TREASURE',1,'{"bonuses":{"meleeAttack":5},"sourceStatus":"ESTIMATED"}','携带后近攻提高5%。采用旧版两宝物槽机制，名称与加成为单机适配。',1),
('treasure_rangedattack','一星远攻宝物','TREASURE',1,'{"bonuses":{"rangedAttack":5},"sourceStatus":"ESTIMATED"}','携带后远攻提高5%。采用旧版两宝物槽机制，名称与加成为单机适配。',1),
('treasure_meleedefense','一星近防宝物','TREASURE',1,'{"bonuses":{"meleeDefense":5},"sourceStatus":"ESTIMATED"}','携带后近防提高5%。采用旧版两宝物槽机制，名称与加成为单机适配。',1),
('treasure_rangeddefense','一星远防宝物','TREASURE',1,'{"bonuses":{"rangedDefense":5},"sourceStatus":"ESTIMATED"}','携带后远防提高5%。采用旧版两宝物槽机制，名称与加成为单机适配。',1),
('treasure_speed','一星速度宝物','TREASURE',1,'{"bonuses":{"speed":5},"sourceStatus":"ESTIMATED"}','携带后速度提高5%。采用旧版两宝物槽机制，名称与加成为单机适配。',1),
('treasure_loadcapacity','一星负重宝物','TREASURE',1,'{"bonuses":{"loadCapacity":5},"sourceStatus":"ESTIMATED"}','携带后负重提高5%。采用旧版两宝物槽机制，名称与加成为单机适配。',1);
INSERT IGNORE INTO item_definitions (code,name,item_type,rarity,effect_config,description,enabled) SELECT CONCAT('skill_book_',code),name,'SKILL_BOOK',rarity,JSON_OBJECT('skillId',id,'sourceStatus','ESTIMATED'),description,enabled FROM skill_definitions;
INSERT IGNORE INTO drop_pools (code,name,node_type,min_level,max_level,chance,rolls) VALUES ('outpost_default','据点战利品','OUTPOST',1,100,1,1);
INSERT IGNORE INTO drop_pool_entries (pool_id,item_definition_id,weight,min_quantity,max_quantity) SELECT p.id,i.id,CASE WHEN i.code='talent_water' THEN 35 WHEN i.item_type='CONSUMABLE' THEN 20 WHEN i.item_type='EQUIPMENT' THEN 5 WHEN i.item_type='TREASURE' THEN 3 ELSE 2 END,1,1 FROM drop_pools p CROSS JOIN item_definitions i WHERE p.code='outpost_default' AND i.enabled=1;
