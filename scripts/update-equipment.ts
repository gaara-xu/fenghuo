import 'dotenv/config'
import {readFile} from 'node:fs/promises'
import mysql,{type RowDataPacket,type ResultSetHeader} from 'mysql2/promise'
import {parseConfig} from '../server/config.js'
import {officialCatalog,officialHeroKeys,officialItems,forgeMaterials} from '../shared/official-catalog.js'
import {defaultForgeRules} from '../shared/forge.js'
const cfg=parseConfig(),version='0008_equipment_instances'
const c=await mysql.createConnection({host:cfg.DB_HOST,port:cfg.DB_PORT,user:cfg.DB_USER,password:cfg.DB_PASSWORD,database:'fenghuo',multipleStatements:true,charset:'utf8mb4',connectTimeout:10000})
try{
 const [scope]=await c.query<RowDataPacket[]>('SELECT DATABASE() db');if(scope[0].db!=='fenghuo')throw Error('数据库越界')
 const [lock]=await c.query<RowDataPacket[]>("SELECT GET_LOCK('fenghuo_update',10) acquired");if(Number(lock[0].acquired)!==1)throw Error('另一个更新正在进行')
 const [done]=await c.query<RowDataPacket[]>('SELECT version FROM schema_migrations WHERE version=?',[version])
 if(done.length)console.log('官方图鉴与装备培养已更新，不覆盖自定义配置。')
 else{
  const ddl=await readFile(new URL('../database/migrations/0008_equipment_instances.sql',import.meta.url),'utf8'),[tables,alter]=ddl.split('-- update-equipment.ts checks the column before applying this ALTER (restart safe).')
  await c.query(tables)
  const [cols]=await c.query<RowDataPacket[]>("SHOW COLUMNS FROM hero_equipment LIKE 'instance_id'");if(!cols.length)await c.query(alter)
  await c.beginTransaction()
  for(const item of [...officialItems,...forgeMaterials]){
   await c.execute('INSERT IGNORE INTO item_definitions (code,name,item_type,rarity,quality_tier,effect_config,description,enabled) VALUES (?,?,?,?,?,?,?,?)',[item.code,item.name,item.itemType,item.rarity,item.qualityTier??item.rarity,JSON.stringify(item.effectConfig),item.description,item.enabled])
  }
  await c.execute("UPDATE item_definitions SET description='精炼装备或宝物，提高本次成功率；失败仍可能降低等级。' WHERE code='refine_stone' AND description LIKE '%尚未开放%'")
  for(let i=0;i<officialCatalog.heroes.length;i++){
   const h=officialCatalog.heroes[i],key=officialHeroKeys[i]
   // Existing combat attributes and player's progression remain untouched.
   await c.execute("INSERT IGNORE INTO hero_definitions (code,name,star,quality_tier,attack_type,melee_attack,ranged_attack,melee_defense,ranged_defense,speed,load_capacity,stamina_max,portrait_key,source_status,description) VALUES (?,?,6,6,'BALANCED',126,126,112,112,95,140,120,?,'ESTIMATED',?)",[key,h.name,key,h.name+'，战国六星英雄。'])
   await c.execute('UPDATE hero_definitions SET portrait_key=?,star=6,quality_tier=GREATEST(quality_tier,6) WHERE code=?',[key,key])
   await c.execute("INSERT IGNORE INTO tavern_pool_entries (pool_id,reward_type,hero_definition_id,weight) SELECT p.id,'HERO',h.id,20 FROM tavern_pools p JOIN hero_definitions h ON h.code=? WHERE p.code='hero_standard'",[key])
  }
  const [equipped]=await c.query<RowDataPacket[]>('SELECT e.*,o.player_id FROM hero_equipment e JOIN owned_heroes o ON o.id=e.owned_hero_id WHERE e.instance_id IS NULL FOR UPDATE')
  for(const e of equipped){const [g]=await c.execute<ResultSetHeader>("INSERT INTO equipment_instances (player_id,item_definition_id,gems_json,extra_bonuses) VALUES (?,?,'[]','{}')",[e.player_id,e.item_definition_id]);await c.execute('UPDATE hero_equipment SET instance_id=? WHERE owned_hero_id=? AND slot=?',[g.insertId,e.owned_hero_id,e.slot])}
  await c.execute("INSERT IGNORE INTO game_settings (setting_key,setting_value,value_type,description) VALUES ('forge_rules',?,'JSON','装备精炼、打孔单机概率；官方机制，概率未考证')",[JSON.stringify(defaultForgeRules)])
  for(const [code,name,type,min,max,chance,star] of [['official_gear_3','三星装备据点','OUTPOST',1,9,.18,3],['official_gear_4','四星装备据点','OUTPOST',10,15,.14,4],['official_gear_5','五星装备据点','OUTPOST',16,20,.08,5],['official_dungeon_gear','副本装备','DUNGEON',1,100,.15,0],['forge_materials','精炼与打孔材料','OUTPOST',1,20,.4,-1]] as const){
   await c.execute('INSERT IGNORE INTO drop_pools (code,name,node_type,min_level,max_level,chance,rolls) VALUES (?,?,?,?,?,?,1)',[code,name,type,min,max,chance])
   const codes=star===-1?forgeMaterials.map(m=>m.code):officialItems.filter(i=>star===0||i.rarity===star).map(i=>i.code)
   for(const itemCode of codes)await c.execute('INSERT IGNORE INTO drop_pool_entries (pool_id,item_definition_id,weight,min_quantity,max_quantity,enabled) SELECT p.id,i.id,10,1,1,1 FROM drop_pools p JOIN item_definitions i ON i.code=? WHERE p.code=?',[itemCode,code])
  }
  await c.execute('INSERT INTO schema_migrations (version,description) VALUES (?,?)',[version,'26英雄原图、165装备目录；13装备位置；独立装备实例、精炼、打孔、宝石'])
  await c.commit();console.log('图鉴与装备培养更新完成，现有武将、物品数量与装备均保留。')
 }
}catch(e){await c.rollback();throw e}finally{await c.query("SELECT RELEASE_LOCK('fenghuo_update')");await c.end()}
