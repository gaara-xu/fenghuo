-- 烽火战国单机版：完整数据库结构（唯一结构基线，不包含业务数据）
-- 兼容 MySQL 5.7+ / 8.0+。每次结构变更必须同步修改本文件和 migrations/。
-- JSON 字段约定（类型设计，不含业务数据）：
-- game_settings.tavern_recording: {enabled:boolean,afterRefreshId:number}；三类酒馆共用开关。
-- 0023_zhengtu_equipment_preview：纯数据更新，无新增库表字段。item_definitions新增27种征途主题装备，
-- 0024_zhengtu_expansion：无DDL；追加三套肩铠/MOUNT坐骑/两种TREASURE共12定义及一次性赠送。
-- 卓越ZT_EXCELLENT_TIANZUN降至quality_tier=3、rarity=3，固定属性及套装效果降低；已有装备实例不改动。
-- 27原定义icon改为SVG原图包装；schema_migrations防重复，admin_audit_logs记录修改前后与赠送明细。
-- effect_config沿用slot/icon/flatBonuses/setCode/setBonuses/requiredStrength/refineStep/initialSockets/sourceStatus/sourceUrl；
-- 三套均支持3/5/8/10/11件最高档攻防百分比加成，左右护腕与戒指各计一件；绿色4、紫色5、红色7品质。
-- player_inventory向配置玩家一次性增发33件；schema_migrations记录版本防重复，admin_audit_logs记录GRANT明细。
-- 关闭后刷新结果/候选/随机种子/请求编号仅在进程内存，不新增或更新 tavern_refreshes/tavern_candidates。
-- afterRefreshId 为最后切换时旧历史边界，防止旧候选复活；原表和历史不删，余额与实际领取正常持久化。
-- 单进程部署；内存候选在浏览器刷新后仍保留，游戏服务重启丢失；不支持跨进程共享与重启后幂等。
-- game_settings.hero_growth_rules: {combatRate:number,loadRate:number,speedRate:number,
--   starFactors:number[6],talentFactors:{MEDIOCRE,COMMON,GOOD,EXCELLENT,PERFECT:number},sourceStatus:ESTIMATED|DIY}
-- item_definitions.effect_config: {kind?:TALENT|EXPERIENCE|STAMINA|RENAME,amount?:number,
--   slot?:HELMET|SHOULDER|ARMOR|LEGS|BOOTS|NECKLACE|BRACELET|RING|WEAPON|SHIELD|MOUNT,
--   bonuses?:{meleeAttack?,rangedAttack?,meleeDefense?,rangedDefense?,speed?,loadCapacity?:number},
--   flatBonuses?:同bonuses的固定数值,icon?:本地/art/路径,requiredStrength?:number,
--   refineStep?:number,initialSockets?:0|1|2|3,setCode?:string,setBonuses?:[{count:number,bonuses:百分比属性}],
--   gemStat?:属性键,gemAmount?:number,gemBonuses?:固定属性表,gemFamily?:string,gemLevel?:1..8,gemSlots?:装备位置[],sourceUrl?:string,
--   skillId?:number,talentWeights?:{MEDIOCRE,COMMON,GOOD,EXCELLENT,PERFECT:number},sourceStatus?:VERIFIED|ESTIMATED|DIY}
-- bonuses 为百分比；skillId 指向 skill_definitions，技能书库存唯一来源为 player_skill_books。
-- hero_equipment.slot 另支持 BRACELET_2、RING_2、TREASURE_1、TREASURE_2。
-- 套装按同setCode的实际穿戴槽位计件，左右手镯/戒指分别计数，不按物品定义id去重；只取达到的最高档。
-- 0021_equipment_ten_piece_sets：无DDL，补八件套的十件档主题属性25%；保留旧档、已配十件档及库存/实例。
-- 未培养的新物品可堆叠在 player_inventory；首次穿戴转成 equipment_instances，每实例一件。
-- 卸下/流放只移除 hero_equipment 的关联；实例及精炼/孔/宝石均保留，未穿戴实例即包裹库存。
-- game_settings.forge_rules: {refineRates:number[9],divineBonus:number,downgradeChance:number,
--   drillRates:number[3],drillCost:number,sourceStatus:ESTIMATED|DIY}；概率均0至1。
-- 0015 为数据迁移：宝石五系各1至8级、改名卡，家族/科技技能初始下架，可由后台重新上架。
-- 手动维护 db:cleanup:obsolete 仅清理六种旧无等级宝石及未实现用途的synthesis_stone；不按停用/缺图标泛化清理。
-- 保留item_definitions及外键历史，enabled=0；停用对应drop_pool_entries/tavern_pool_entries，并删除当前玩家的目标库存行。
-- CLEAN_OBSOLETE_ITEMS管理审计before_json:{playerId,definition,inventory,dropEntries,tavernEntries}保留恢复数据；
-- after_json:{playerId,enabled:false,removedQuantity,reason}。全部同一事务，无新增表或DDL；检测到镶嵌引用则整体拒绝。
-- 已清理且停用的废弃道具旧酒馆候选隐藏且不可领取，避免再次入包；正常物品已付费候选规则不变。
-- 手动clear-backpack.ts清空指定玩家player_inventory、player_skill_books及未被hero_equipment引用的装备实例。
-- CLEAR_BACKPACK审计before_json:{playerId,inventory:完整库存行[],skillBooks:完整技能书行[],equipmentInstances:未穿戴实例完整行[]}。
-- after_json:{stackRows,stackQuantity,skillBookRows,skillBookQuantity,unequippedInstances,preservedEquippedInstances}。
-- 清空与审计同事务，保留所有已穿戴实例/镶嵌、已学技能、英雄、资源、物品定义、掉落配置和历史记录；无新增表字段。
-- 0016_wild_gem_drops 为一次性掉落配置更新，无新增库表字段；已有库存、其他目标掉落池不变。
-- drop_pool_entries.min_quantity/max_quantity 为闭区间整数随机范围；后台校验1至1000，min<=max。
-- 默认野地池只含五系一级宝石，胜利抽一种、数量1至1000；后台可调整，升级脚本不会反复覆盖。
-- 0017_outpost_gem_rates 为一次性配置更新：三档据点宝石池chance提高至1，等级系数仍为0.25至1。
-- 不改变drop_pool_entries数量、权重、启停，亦不改变非宝石掉落及野地/副本池；无需新增字段。
-- 0018_outpost_gem_quantities 修正上述据点宝石数量：三档池中的宝石条目min_quantity=1、max_quantity=1000。
-- 仅更新这两个数量字段，不改概率、权重、启停、非宝石条目、其他池及库存；字段结构不变。
-- 0019_equipment_calibration_salvage：装备按部位校准基础值，新增refine_advanced材料；实例及库存不重置。
-- 0020_world_boss：配置更新，无新增表或DDL，不修改旧目标及库存。
-- game_settings.world_boss_rules: {enabled:boolean,level:1..1000,meleeDefense:1..1000000000000,rangedDefense:1..1000000000000,spawnChance:0..1,itemChance:0..1,
--   quantities:{EQUIPMENT,TREASURE,SKILL_BOOK,CONSUMABLE,GEM,MATERIAL:{min:1..100000,max:1..100000}}}。
-- map_nodes 世界首领复用node_type=WILD，level为生成时等级快照；默认200级，默认双防4000100000。
-- garrison_config:{worldBoss:true,power:max(双防),meleeDefense:number,rangedDefense:number,expiresGameAt:UTC ISO游戏时间字符串}。
-- 强度保存时仅作用于新首领；旧配置缺少等级双防时读取默认值；旧首领无期限时首次维护补游戏时间300秒，仅补一次，无DDL。
-- 每只存活300秒游戏时间，刷新/重启/败战不续时；到期隐藏，后到部队空返。离线期限内到达仍补结算。
-- 普通刷新不覆盖worldBoss标记节点；每轮含据点或野地的刷新额外判定一次，同场最多一只未击败且未过期首领。
-- map_nodes.x/y刷新时重新随机分散，按等距地图投影保证图标间距；在途目标、首领和非本次刷新类型保持坐标。
-- 坐标交换在同一事务使用临时空坐标避免uk_map_coordinate冲突，失败回滚，不留下临时位置。
-- 首领仅普通出征：胜利或到期置level=0/status=DEPLETED，败战保留生成时等级和防御；所有引用行军返城后物理清理。
-- battle_reports.battle_config.worldBoss为首领标记；loot仍为实际逐物品入包数量，技能书写player_skill_books。
-- 首领掉落不复用普通drop_pools：遍历已上架且非回收物品逐项按itemChance判定，技能书还须对应技能上架。
-- 首领宝石只限gemLevel=1，各系分别判定掉率和随机数量；二至八级及旧无等级宝石排除，不进入其他材料分类。
-- 0022_incoming_raids：只由外部GET生成军队，无内部周期生成器；复用游戏时钟和既有离线结算。
-- game_settings.incoming_raid_rules: {enabled:boolean,attackMin:1..10000000000,attackMax:1..10000000000,itemChance:0..1,
--   quantities:{EQUIPMENT,TREASURE,SKILL_BOOK,CONSUMABLE,GEM,MATERIAL:{min:1..10000,max:1..10000}}}，各min<=max。
-- incoming_raids 仅保存未结算来袭；生成时固化总攻击/人数/方向/抵达时间和loot_rules配置，300游戏秒后进攻。
-- 抵达时使用player_forces中已建成城防与留城士兵，以及未退休且不在行军/返程/ACTIVE自动任务中的全部武将。
-- 武将按当前等级、天赋、装备、宝石和套装计算属性，全军享受满科技；未完成训练不参与。
-- battle_reports.direction=INCOMING；battle_config另含incomingRaidId、baseAttackPower、attackPower、defensePower、attackerLosses。
-- defendingHeroes:[{heroId,name,meleeDefense,rangedDefense}]记录技能后的武将防御；skillEvents含ownerCode/ownerName。
-- 技能按武将最多四个；同名全军/城防技能仅最高级判定一次不叠加，自身技能各自生效；下架及未解锁技能不参与。
-- defenderLossReduction仅减少普通士兵伤亡，不降低城防损耗；技能判定以raid编号固定随机种子，重试不重抽。
-- troopLosses为守方损失，attackerLosses为敌方损失，结构均[{code,name,sent,lost,remaining}]。
-- 守方技能后战力大于敌方才发放loot；无减伤时相等DRAW双方士兵/城防全灭，武将不按兵损删除。
-- 无减伤时强方损失floor(总人数*(弱方战力/强方战力)^2)，按各编队人数分摊；减伤先修正普通士兵权重再统一取整。
-- 扣兵、发奖、写永久被攻击战报与删除incoming_raids同事务；重复结算不再伤亡或发奖。
-- 来袭GET复用scheduled_task_runs最近50条去重窗口；规则快照只固化掉率和数量，结算仍仅从当前上架目录发奖。
-- item_definitions.effect_config.refineMultipliers可选10个逐级倍率，对应+0至+9，优先于refineStep。
-- 批量分解只接受包裹装备；穿戴中或镶有宝石拒绝；以forge_operations保存SALVAGE幂等请求与产出（七天清理）。
-- 分解按精确实例id删除equipment_instances，或扣除player_inventory中的指定数量；全部与材料入包同事务。
-- forge_operations.request_json 亦存 {operation:GEM_COMBINE,itemId,quantity}，合成每份扣4颗得1颗。
-- 独立工坊请求存 {target:{kind:EQUIPPED,heroId,slot,instanceId}|{kind:INSTANCE,instanceId}|{kind:STACK,itemId},operation,materialId?}。
-- 免费取石 operation=UNSOCKET，另含 gemIndex(0..2)、gemItemId；删除已镶快照并返包1颗，不扣道具/金币，不减少孔数。
-- 首次加工堆叠装备时仅分离1件为equipment_instances，失败校验整体回滚；结果gear.instanceId供界面继续选中该件。
-- forge_operations 用于七天内幂等；过期记录在工坊操作后清理，不修改装备实例。
-- item_use_logs.result_json: {itemName:string,before?:TalentGrade,after?:TalentGrade}，改名结果另为 {operation:RENAME,name:string,consumed:1}。唯一请求标识防重复扣道具。
-- tavern_candidates.item_snapshot: 抽出时的 ItemDefinition（id,code,name,itemType,rarity,qualityTier,
--   description,enabled,deletedAt,effectConfig）；入包后属性跟随 item_definitions 统一管理。
-- 酒馆 ITEM 奖励每次入包1件；与技能书的 player_skill_books 存储严格分开。
-- skill_definitions.effect_config: {base:number,perLevel:number,ratePerLevel:number,mode:ATTACK|DEFENSE|BOTH}
-- battle_reports.battle_config 包括战力、skillEvents 数组、loot:[{itemId,name,quantity}]、experience 和英雄/节点编号快照。
-- 军事结算另含 meleeAttack/rangedAttack/meleeDefense/rangedDefense、troopLosses:[{code,name,sent,lost,remaining}]。
-- military_definitions.config_json 保存基础攻防、速度、负重、cost:{food,wood,stone,iron,gold}、seconds及来源备注。
-- military_orders.snapshot_json 为付费时的MilitaryDefinition，后改目录不重算已付款时间；completed防止重复发兵。
-- snapshot_json.speedup可选:{clientActionId,result:{orderId,goldSpent,completedUnits,savedSeconds,completedAt}}，复用订单七天保留期防重复扣金。
-- 金币加速每300游戏秒1金币向上取整，只计本单剩余生产而不收前置等待；完成当前单并提前后续同lane订单，不更改另一队列。
-- 加速须先按时间顺序处理旧来袭/行军与耗粮，然后原子扣金、入城、改订单和回执；没有新表或字段。
-- player_forces仅存已完成且可用数量；出征及自动编队所持士兵不同时计入本城。
-- 0011_military_catalog为配置校正，无新字段：停用未考证快骑；不物理删除已有兵力或订单。
-- admin_resource_grants按请求编号防重复补资源；created_at为现实时间，记录最多保留七天，不受游戏加速影响。
-- military_definitions.config_json.foodPerHour为每单位每游戏小时耗粮；城防为0。
-- ArmyStack快照包含foodPerHour，行军与自动任务持有部队计入耗粮但不能重复计数。
-- battle_reports 每玩家主动出征仅保留最新50条，超额与手动清空均物理删除；被攻击记录永久保留，不回滚发奖。
-- owned_heroes.retired_at 非空后从名册排除；保留最小历史引用，装备退回，已学技能移除。
CREATE DATABASE IF NOT EXISTS `fenghuo`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_bin;
USE `fenghuo`;

CREATE TABLE IF NOT EXISTS `schema_migrations` (
  `version` varchar(64) NOT NULL,
  `description` varchar(255) NOT NULL,
  `applied_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `game_settings` (
  `setting_key` varchar(64) NOT NULL,
  `setting_value` text NOT NULL,
  `value_type` enum('STRING','INTEGER','DECIMAL','BOOLEAN','JSON') NOT NULL DEFAULT 'STRING',
  `description` varchar(255) NOT NULL DEFAULT '',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `game_clock` (
  `id` tinyint unsigned NOT NULL,
  `real_anchor_at` datetime(3) NOT NULL,
  `game_anchor_at` datetime(3) NOT NULL,
  `multiplier` decimal(10,3) NOT NULL DEFAULT 1.000,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `player_profile` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `display_name` varchar(32) NOT NULL,
  `city_name` varchar(32) NOT NULL,
  `nation_code` varchar(16) NOT NULL DEFAULT 'ZHOU',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `resource_wallet` (
  `player_id` bigint unsigned NOT NULL,
  `food` bigint unsigned NOT NULL DEFAULT 0,
  `wood` bigint unsigned NOT NULL DEFAULT 0,
  `stone` bigint unsigned NOT NULL DEFAULT 0,
  `iron` bigint unsigned NOT NULL DEFAULT 0,
  `gold` bigint unsigned NOT NULL DEFAULT 0,
  `coupon` bigint unsigned NOT NULL DEFAULT 0,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`player_id`),
  CONSTRAINT `fk_wallet_player` FOREIGN KEY (`player_id`) REFERENCES `player_profile` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `hero_definitions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(64) NOT NULL,
  `name` varchar(64) NOT NULL,
  `star` tinyint unsigned NOT NULL,
  `quality_tier` tinyint unsigned NOT NULL DEFAULT 1 COMMENT '品质1白2蓝3黄4绿5蓝紫6橙黄7红，与星级独立',
  `attack_type` enum('MELEE','RANGED','BALANCED','DEFENSE') NOT NULL,
  `melee_attack` int unsigned NOT NULL DEFAULT 0,
  `ranged_attack` int unsigned NOT NULL DEFAULT 0,
  `melee_defense` int unsigned NOT NULL DEFAULT 0,
  `ranged_defense` int unsigned NOT NULL DEFAULT 0,
  `speed` int unsigned NOT NULL DEFAULT 0,
  `load_capacity` int unsigned NOT NULL DEFAULT 0,
  `stamina_max` int unsigned NOT NULL DEFAULT 100,
  `portrait_key` varchar(128) DEFAULT NULL,
  `source_status` enum('VERIFIED','ESTIMATED','DIY') NOT NULL DEFAULT 'DIY',
  `description` text NOT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_hero_code` (`code`),
  KEY `idx_hero_star_enabled` (`star`,`enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `skill_definitions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(64) NOT NULL,
  `name` varchar(64) NOT NULL,
  `rarity` tinyint unsigned NOT NULL,
  `quality_tier` tinyint unsigned NOT NULL DEFAULT 1 COMMENT '品质1白2蓝3黄4绿5蓝紫6橙黄7红',
  `effect_type` varchar(64) NOT NULL,
  `target_scope` varchar(64) NOT NULL,
  `trigger_rate` decimal(7,4) NOT NULL DEFAULT 0.0000,
  `max_level` tinyint unsigned NOT NULL DEFAULT 10,
  `icon_key` varchar(128) DEFAULT NULL,
  `effect_config` json DEFAULT NULL,
  `source_status` enum('VERIFIED','ESTIMATED','DIY') NOT NULL DEFAULT 'DIY',
  `description` text NOT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_skill_code` (`code`),
  KEY `idx_skill_rarity_enabled` (`rarity`,`enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `skill_levels` (
  `skill_definition_id` bigint unsigned NOT NULL,
  `level` tinyint unsigned NOT NULL,
  `effect_value` decimal(12,4) NOT NULL,
  `upgrade_exp` int unsigned NOT NULL DEFAULT 0,
  `same_book_cost` int unsigned NOT NULL DEFAULT 1,
  PRIMARY KEY (`skill_definition_id`,`level`),
  CONSTRAINT `fk_skill_level_definition` FOREIGN KEY (`skill_definition_id`) REFERENCES `skill_definitions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `item_definitions` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(64) NOT NULL,
  `name` varchar(64) NOT NULL,
  `item_type` varchar(32) NOT NULL,
  `rarity` tinyint unsigned NOT NULL DEFAULT 1,
  `quality_tier` tinyint unsigned NOT NULL DEFAULT 1 COMMENT '品质1白2蓝3黄4绿5蓝紫6橙黄7红',
  `effect_config` json DEFAULT NULL,
  `description` text NOT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  `deleted_at` datetime(3) DEFAULT NULL COMMENT '藏宝阁回收站；非空时隐藏图鉴、停止掉落和新穿戴，保留原库存与实例',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_item_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `tavern_pools` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `code` varchar(64) NOT NULL,
  `name` varchar(64) NOT NULL,
  `pool_type` enum('HERO','SKILL','MIXED','ITEM') NOT NULL,
  `currency_code` enum('food','wood','stone','iron','gold','coupon') NOT NULL DEFAULT 'gold',
  `refresh_cost` bigint unsigned NOT NULL DEFAULT 0,
  `candidate_count` tinyint unsigned NOT NULL DEFAULT 3,
  `select_limit` tinyint unsigned NOT NULL DEFAULT 1,
  `version` int unsigned NOT NULL DEFAULT 1,
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tavern_pool_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `tavern_pool_entries` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `pool_id` bigint unsigned NOT NULL,
  `reward_type` enum('HERO','SKILL_BOOK','ITEM') NOT NULL,
  `hero_definition_id` bigint unsigned DEFAULT NULL,
  `skill_definition_id` bigint unsigned DEFAULT NULL,
  `item_definition_id` bigint unsigned DEFAULT NULL,
  `weight` int unsigned NOT NULL,
  `talent_weights` json DEFAULT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_pool_hero` (`pool_id`,`reward_type`,`hero_definition_id`),
  UNIQUE KEY `uk_pool_skill` (`pool_id`,`reward_type`,`skill_definition_id`),
  UNIQUE KEY `uk_pool_item` (`pool_id`,`reward_type`,`item_definition_id`),
  KEY `idx_pool_entry_pool_enabled` (`pool_id`,`enabled`),
  CONSTRAINT `fk_pool_entry_pool` FOREIGN KEY (`pool_id`) REFERENCES `tavern_pools` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pool_entry_hero` FOREIGN KEY (`hero_definition_id`) REFERENCES `hero_definitions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pool_entry_skill` FOREIGN KEY (`skill_definition_id`) REFERENCES `skill_definitions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_entry_item` FOREIGN KEY (`item_definition_id`) REFERENCES `item_definitions` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `tavern_refreshes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `player_id` bigint unsigned NOT NULL,
  `pool_id` bigint unsigned NOT NULL,
  `pool_version` int unsigned NOT NULL,
  `rng_seed` varchar(64) NOT NULL,
  `currency_code` enum('food','wood','stone','iron','gold','coupon') NOT NULL,
  `currency_cost` bigint unsigned NOT NULL,
  `client_action_id` varchar(64) NOT NULL,
  `select_limit_snapshot` tinyint unsigned DEFAULT NULL COMMENT '本轮可选数量；旧轮次为空时兼容卡池配置',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_refresh_action` (`player_id`,`client_action_id`),
  KEY `idx_refresh_player_created` (`player_id`,`created_at`),
  CONSTRAINT `fk_refresh_player` FOREIGN KEY (`player_id`) REFERENCES `player_profile` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_refresh_pool` FOREIGN KEY (`pool_id`) REFERENCES `tavern_pools` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `tavern_candidates` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `refresh_id` bigint unsigned NOT NULL,
  `slot_no` tinyint unsigned NOT NULL,
  `reward_type` enum('HERO','SKILL_BOOK','ITEM') NOT NULL,
  `hero_definition_id` bigint unsigned DEFAULT NULL,
  `skill_definition_id` bigint unsigned DEFAULT NULL,
  `item_definition_id` bigint unsigned DEFAULT NULL,
  `item_snapshot` json DEFAULT NULL COMMENT '物品抽出时的目录快照；入包后跟随统一物品资料',
  `name_snapshot` varchar(64) NOT NULL,
  `rarity_snapshot` tinyint unsigned NOT NULL,
  `talent_grade` enum('MEDIOCRE','COMMON','GOOD','EXCELLENT','PERFECT') DEFAULT NULL,
  `recruited_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_candidate_slot` (`refresh_id`,`slot_no`),
  CONSTRAINT `fk_candidate_refresh` FOREIGN KEY (`refresh_id`) REFERENCES `tavern_refreshes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_candidate_hero` FOREIGN KEY (`hero_definition_id`) REFERENCES `hero_definitions` (`id`),
  CONSTRAINT `fk_candidate_skill` FOREIGN KEY (`skill_definition_id`) REFERENCES `skill_definitions` (`id`),
  CONSTRAINT `fk_candidate_item` FOREIGN KEY (`item_definition_id`) REFERENCES `item_definitions` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `owned_heroes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `player_id` bigint unsigned NOT NULL,
  `hero_definition_id` bigint unsigned NOT NULL,
  `custom_name` varchar(64) DEFAULT NULL,
  `retired_at` datetime(3) DEFAULT NULL COMMENT '流放或斩首后隐藏，保留历史行军引用',
  `retired_reason` varchar(16) DEFAULT NULL COMMENT 'EXILE流放或EXECUTE斩首',
  `level` smallint unsigned NOT NULL DEFAULT 1,
  `experience` bigint unsigned NOT NULL DEFAULT 0,
  `talent_grade` enum('MEDIOCRE','COMMON','GOOD','EXCELLENT','PERFECT') NOT NULL DEFAULT 'COMMON',
  `stamina` int unsigned NOT NULL DEFAULT 100,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_owned_hero_player` (`player_id`),
  CONSTRAINT `fk_owned_hero_player` FOREIGN KEY (`player_id`) REFERENCES `player_profile` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_owned_hero_definition` FOREIGN KEY (`hero_definition_id`) REFERENCES `hero_definitions` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `owned_hero_skills` (
  `owned_hero_id` bigint unsigned NOT NULL,
  `slot_no` tinyint unsigned NOT NULL,
  `skill_definition_id` bigint unsigned NOT NULL,
  `skill_level` tinyint unsigned NOT NULL DEFAULT 0 COMMENT '技能初学为0级，最高10级',
  PRIMARY KEY (`owned_hero_id`,`slot_no`),
  CONSTRAINT `fk_owned_skill_hero` FOREIGN KEY (`owned_hero_id`) REFERENCES `owned_heroes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_owned_skill_definition` FOREIGN KEY (`skill_definition_id`) REFERENCES `skill_definitions` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `player_skill_books` (
  `player_id` bigint unsigned NOT NULL,
  `skill_definition_id` bigint unsigned NOT NULL,
  `quantity` int unsigned NOT NULL DEFAULT 0,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`player_id`,`skill_definition_id`),
  CONSTRAINT `fk_skill_book_player` FOREIGN KEY (`player_id`) REFERENCES `player_profile` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_skill_book_definition` FOREIGN KEY (`skill_definition_id`) REFERENCES `skill_definitions` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `player_inventory` (
  `player_id` bigint unsigned NOT NULL,
  `item_definition_id` bigint unsigned NOT NULL,
  `quantity` int unsigned NOT NULL DEFAULT 0,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`player_id`,`item_definition_id`),
  CONSTRAINT `fk_inventory_player` FOREIGN KEY (`player_id`) REFERENCES `player_profile` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_inventory_item` FOREIGN KEY (`item_definition_id`) REFERENCES `item_definitions` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `map_nodes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `node_type` enum('OUTPOST','WILD','DUNGEON','SYSTEM_CITY','RANDOM_CITY') NOT NULL,
  `name` varchar(64) NOT NULL,
  `level` smallint unsigned NOT NULL,
  `x` int NOT NULL,
  `y` int NOT NULL,
  `defense_bias` enum('MELEE','RANGED','BALANCED') NOT NULL DEFAULT 'BALANCED',
  `garrison_config` json DEFAULT NULL,
  `reward_config` json DEFAULT NULL,
  `reward_hint` varchar(255) NOT NULL DEFAULT '',
  `status` enum('ACTIVE','DEPLETED','LOCKED') NOT NULL DEFAULT 'ACTIVE',
  `respawn_at` datetime DEFAULT NULL,
  `generation` int unsigned NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_map_coordinate` (`x`,`y`),
  KEY `idx_map_type_status` (`node_type`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `march_orders` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `player_id` bigint unsigned NOT NULL,
  `map_node_id` bigint unsigned NOT NULL,
  `owned_hero_id` bigint unsigned DEFAULT NULL,
  `order_type` enum('ATTACK','AUTO_FARM','SCOUT') NOT NULL,
  `status` enum('MARCHING','FIGHTING','RETURNING','COMPLETED','CANCELLED') NOT NULL,
  `depart_game_at` datetime(3) NOT NULL,
  `arrive_game_at` datetime(3) NOT NULL,
  `return_game_at` datetime(3) DEFAULT NULL,
  `troop_config` json DEFAULT NULL COMMENT 'units:ArmyStack[]幸存兵力快照；requested原始选兵；autoFarmCycleVersion=2表示自动任务返城时扣次数，旧行军缺省表示已在出发时扣除',
  `client_action_id` varchar(64) DEFAULT NULL,
  `auto_farm_job_id` bigint unsigned DEFAULT NULL COMMENT '所属自动编队任务，普通出征为空',
  `result_config` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_march_request` (`player_id`,`client_action_id`),
  KEY `idx_march_status_arrive` (`status`,`arrive_game_at`),
  CONSTRAINT `fk_march_player` FOREIGN KEY (`player_id`) REFERENCES `player_profile` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_march_node` FOREIGN KEY (`map_node_id`) REFERENCES `map_nodes` (`id`),
  CONSTRAINT `fk_march_hero` FOREIGN KEY (`owned_hero_id`) REFERENCES `owned_heroes` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `battle_reports` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `player_id` bigint unsigned NOT NULL,
  `direction` enum('OUTGOING','INCOMING') NOT NULL DEFAULT 'OUTGOING' COMMENT 'OUTGOING主动出征仅留50条；INCOMING被攻击永久保存',
  `march_order_id` bigint unsigned DEFAULT NULL,
  `title` varchar(128) NOT NULL,
  `result` enum('VICTORY','DEFEAT','DRAW') NOT NULL,
  `battle_config` json NOT NULL COMMENT '战斗属性、技能、伤亡、loot掉落；targetLevelBefore/After为所有目标攻击前后等级；旧据点兼容outpostLevelBefore/After',
  `reward_config` json DEFAULT NULL,
  `occurred_game_at` datetime(3) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_report_player_created` (`player_id`,`created_at`),
  KEY `idx_report_direction` (`player_id`,`direction`,`id`),
  CONSTRAINT `fk_report_player` FOREIGN KEY (`player_id`) REFERENCES `player_profile` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_report_march` FOREIGN KEY (`march_order_id`) REFERENCES `march_orders` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

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

CREATE TABLE IF NOT EXISTS `auto_farm_jobs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `player_id` bigint unsigned NOT NULL,
  `owned_hero_id` bigint unsigned DEFAULT NULL,
  `node_type` enum('OUTPOST','WILD','DUNGEON','SYSTEM_CITY','RANDOM_CITY') NOT NULL,
  `min_level` smallint unsigned NOT NULL DEFAULT 1,
  `max_level` smallint unsigned NOT NULL DEFAULT 20,
  `runs_remaining` int unsigned DEFAULT NULL COMMENT '尚未完成往返的次数（含当前在途）；NULL不限次数；旧在途行军按版本标记兼容',
  `troop_config` json DEFAULT NULL COMMENT 'units:ArmyStack[]留城编队；在途兵力由行军持有；cycleVersion=2；targetNodeId/targetName锁定目标；totalRuns计划次数；completedRuns已返城次数',
  `status` enum('ACTIVE','PAUSED','COMPLETED','FAILED') NOT NULL DEFAULT 'ACTIVE',
  `next_run_game_at` datetime(3) NOT NULL,
  `last_error` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_farm_status_next` (`status`,`next_run_game_at`),
  CONSTRAINT `fk_farm_player` FOREIGN KEY (`player_id`) REFERENCES `player_profile` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_farm_hero` FOREIGN KEY (`owned_hero_id`) REFERENCES `owned_heroes` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `city_defenses` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `player_id` bigint unsigned NOT NULL,
  `defense_type` varchar(64) NOT NULL,
  `level` smallint unsigned NOT NULL DEFAULT 1,
  `quantity` int unsigned NOT NULL DEFAULT 0,
  `damaged_quantity` int unsigned NOT NULL DEFAULT 0,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_city_defense` (`player_id`,`defense_type`,`level`),
  CONSTRAINT `fk_city_defense_player` FOREIGN KEY (`player_id`) REFERENCES `player_profile` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `admin_audit_logs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `action` varchar(64) NOT NULL,
  `entity_type` varchar(64) NOT NULL,
  `entity_id` varchar(64) DEFAULT NULL,
  `before_json` json DEFAULT NULL,
  `after_json` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_admin_audit_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS `equipment_instances` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `player_id` bigint unsigned NOT NULL,
  `item_definition_id` bigint unsigned NOT NULL,
  `refine_level` tinyint unsigned NOT NULL DEFAULT 0 COMMENT '精炼增量0至9；装备显示1至10级',
  `sockets` tinyint unsigned NOT NULL DEFAULT 0 COMMENT '0至3孔，只有装备可打孔',
  `gems_json` json NOT NULL COMMENT '已镶嵌宝石快照：itemId,name,stat,amount,bonuses?,icon?,level?',
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

CREATE TABLE IF NOT EXISTS `hero_equipment` (
  `owned_hero_id` bigint unsigned NOT NULL,
  `slot` varchar(32) NOT NULL COMMENT '十三个装备槽及两个宝物槽，枚举由服务端验证',
  `item_definition_id` bigint unsigned NOT NULL,
  `instance_id` bigint unsigned DEFAULT NULL,
  `equipped_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_equipped_instance` (`instance_id`),
  CONSTRAINT `fk_equipped_instance` FOREIGN KEY (`instance_id`) REFERENCES `equipment_instances` (`id`),
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

-- 0010 起城防数量以 player_forces 为准；旧 city_defenses 仅保留迁移归档。
CREATE TABLE IF NOT EXISTS `military_upkeep` (
 `player_id` bigint unsigned NOT NULL,
 `last_game_at` datetime(3) NOT NULL COMMENT '上次军粮结算游戏时间；迁移时锚定，不追收迁移前军粮',
 `fraction` decimal(12,9) NOT NULL DEFAULT 0 COMMENT '不足1单位粮食的小数结余；缺粮时清零，不记负债',
 PRIMARY KEY (`player_id`),
 CONSTRAINT `fk_upkeep_player` FOREIGN KEY (`player_id`) REFERENCES `player_profile` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

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

CREATE TABLE IF NOT EXISTS `military_definitions` (
 `code` varchar(64) NOT NULL,
 `name` varchar(64) NOT NULL,
 `kind` enum('TROOP','DEFENSE') NOT NULL,
 `config_json` json NOT NULL COMMENT 'MilitaryDefinition：四项攻防、速度、负重、cost五资源单价、seconds每单位游戏秒、role、description、enabled、sourceStatus、sourceNote',
 `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS `player_forces` (
 `player_id` bigint unsigned NOT NULL,
 `unit_code` varchar(64) NOT NULL,
 `quantity` int unsigned NOT NULL DEFAULT 0 COMMENT '仅本城可用数量，不含训练中和出征中',
 PRIMARY KEY (`player_id`,`unit_code`),
 CONSTRAINT `fk_force_player` FOREIGN KEY (`player_id`) REFERENCES `player_profile` (`id`),
 CONSTRAINT `fk_force_unit` FOREIGN KEY (`unit_code`) REFERENCES `military_definitions` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS `military_orders` (
 `id` bigint unsigned NOT NULL AUTO_INCREMENT,
 `player_id` bigint unsigned NOT NULL,
 `unit_code` varchar(64) NOT NULL,
 `lane` enum('TROOP','DEFENSE') NOT NULL COMMENT '军营和城防各一条串行队列，互不阻塞',
 `quantity` int unsigned NOT NULL,
 `completed` int unsigned NOT NULL DEFAULT 0,
 `seconds_per_unit` int unsigned NOT NULL,
 `start_game_at` datetime(3) NOT NULL,
 `end_game_at` datetime(3) NOT NULL,
 `snapshot_json` json NOT NULL COMMENT '提交时锁定名称、单价、耗时，后台改价不影响已有订单',
 `client_action_id` varchar(64) NOT NULL,
 `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (`id`),
 UNIQUE KEY `uk_military_request` (`player_id`,`client_action_id`),
 KEY `idx_military_queue` (`player_id`,`lane`,`end_game_at`),
 CONSTRAINT `fk_military_order_player` FOREIGN KEY (`player_id`) REFERENCES `player_profile` (`id`),
 CONSTRAINT `fk_military_order_unit` FOREIGN KEY (`unit_code`) REFERENCES `military_definitions` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- Pending incoming armies only; settled results live permanently in battle_reports (INCOMING).
CREATE TABLE IF NOT EXISTS `incoming_raids` (
 `id` bigint unsigned NOT NULL AUTO_INCREMENT,
 `player_id` bigint unsigned NOT NULL,
 `name` varchar(64) NOT NULL,
 `attack_power` bigint unsigned NOT NULL COMMENT '刷新时锁定的总攻击力，不再额外叠加敌方科技',
 `troop_count` int unsigned NOT NULL COMMENT '每100攻击折算1名来袭士兵，最少1名',
 `attack_type` enum('MELEE','RANGED','BALANCED') NOT NULL,
 `origin_x` tinyint unsigned NOT NULL,
 `origin_y` tinyint unsigned NOT NULL,
 `depart_game_at` datetime(3) NOT NULL,
 `arrive_game_at` datetime(3) NOT NULL COMMENT '出发后300游戏秒抵达',
 `loot_rules` json NOT NULL COMMENT 'IncomingRaidRules快照；后台修改不影响已出发军队',
 `created_at` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY (`id`),
 KEY `idx_raid_due` (`player_id`,`arrive_game_at`,`id`),
 CONSTRAINT `fk_raid_player` FOREIGN KEY (`player_id`) REFERENCES `player_profile` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
-- 0025_supreme_fifteen：至尊13/15件阶梯与双宝物计件，更新item_definitions.effect_config及description，无新增字段；独立维护脚本同步。
