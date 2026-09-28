import type {Connection,RowDataPacket} from 'mysql2/promise'
import {originalGems,renameCard} from '../shared/gems.js'
export const heroUpdateVersion='0015_hero_gems'
export const unavailableSkillCodes=['xueyuan','tengjia','tiebi','huojianshu','zhongcheng','weifeng','fanjian','liuyan']
// Caller owns transaction and migration lock; safe to test with an outer rollback.
export async function applyHeroUpdate(c:Connection){
 const [scope]=await c.query<RowDataPacket[]>('SELECT DATABASE() db');if(scope[0].db!=='fenghuo')throw Error('数据库越界')
 const [done]=await c.query<RowDataPacket[]>('SELECT version FROM schema_migrations WHERE version=?',[heroUpdateVersion]);if(done.length)return false
 for(const i of [...originalGems,renameCard])await c.execute('INSERT IGNORE INTO item_definitions (code,name,item_type,rarity,quality_tier,effect_config,description,enabled) VALUES (?,?,?,?,?,?,?,?)',[i.code,i.name,i.itemType,i.rarity,i.qualityTier??i.rarity,JSON.stringify(i.effectConfig),i.description,i.enabled])
 for(const code of unavailableSkillCodes){await c.execute('UPDATE skill_definitions SET enabled=0 WHERE code=?',[code]);await c.execute('UPDATE item_definitions SET enabled=0 WHERE code=?',['skill_book_'+code])}
 // Retain every legacy gem, worn snapshot and player quantity. Only stop new legacy drops/rolls.
 for(const code of ['gem_meleeattack','gem_rangedattack','gem_meleedefense','gem_rangeddefense','gem_speed','gem_loadcapacity']){
  await c.execute('UPDATE drop_pool_entries e JOIN item_definitions i ON i.id=e.item_definition_id SET e.enabled=0 WHERE i.code=?',[code])
  await c.execute('UPDATE tavern_pool_entries e JOIN item_definitions i ON i.id=e.item_definition_id SET e.enabled=0 WHERE i.code=?',[code])
 }
 await c.execute("UPDATE item_definitions SET effect_config=JSON_SET(effect_config,'$.icon','/art/official/item88.gif') WHERE code='drill_stone' AND JSON_EXTRACT(effect_config,'$.icon') IS NULL")
 const pools=[{code:'gem_outpost_low',name:'初阶据点宝石',type:'OUTPOST',min:1,max:8,chance:.12,levels:1},{code:'gem_outpost_mid',name:'中阶据点宝石',type:'OUTPOST',min:9,max:15,chance:.16,levels:2},{code:'gem_outpost_high',name:'高阶据点宝石',type:'OUTPOST',min:16,max:20,chance:.2,levels:3},{code:'gem_dungeon',name:'副本宝石',type:'DUNGEON',min:1,max:100,chance:.25,levels:3},{code:'hero_rename_card',name:'据点改名卡',type:'OUTPOST',min:1,max:20,chance:.03,levels:0}]
 for(const p of pools){
  await c.execute('INSERT IGNORE INTO drop_pools (code,name,node_type,min_level,max_level,chance,rolls) VALUES (?,?,?,?,?,?,1)',[p.code,p.name,p.type,p.min,p.max,p.chance])
  for(const i of p.levels?originalGems.filter(i=>i.effectConfig.gemLevel!<=p.levels):[renameCard])await c.execute('INSERT IGNORE INTO drop_pool_entries (pool_id,item_definition_id,weight,min_quantity,max_quantity,enabled) SELECT p.id,i.id,?,1,1,1 FROM drop_pools p JOIN item_definitions i ON i.code=? WHERE p.code=?',[[100,18,2][(i.effectConfig.gemLevel??1)-1],i.code,p.code])
 }
 for(const i of [...originalGems.filter(i=>i.effectConfig.gemLevel!<=3),renameCard])await c.execute("INSERT IGNORE INTO tavern_pool_entries (pool_id,reward_type,item_definition_id,weight) SELECT p.id,'ITEM',i.id,? FROM tavern_pools p JOIN item_definitions i ON i.code=? WHERE p.code='treasure_standard'",[i.code==='rename_card'?80:[100,18,2][i.effectConfig.gemLevel!-1],i.code])
 await c.execute('INSERT INTO schema_migrations (version,description) VALUES (?,?)',[heroUpdateVersion,'五系八级原版宝石、改名卡；家族及科技技能下架（后台可重新启用）'])
 return true
}
