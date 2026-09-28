import {randomInt} from 'node:crypto'
import type {Pool,PoolConnection,RowDataPacket,ResultSetHeader} from 'mysql2/promise'
import {getPool,inTransaction} from './db.js'
import {config} from './config.js'
import {lockAvailableHero} from './hero-service.js'
import {getEquipment,inventoryDelta,mapItem,mapGear} from './item-service.js'
import {defaultForgeRules,refineOutcome,type ForgeRules,type ForgeTarget,type ForgeCommand} from '../shared/forge.js'
import {gemFitsEquipment,gemBonuses} from '../shared/gems.js'
import type {EquipmentSlot,EquippedItem} from '../shared/items.js'
const parse=(v:any)=>typeof v==='string'?JSON.parse(v):v
export async function getForgeRules(c:Pool|PoolConnection=getPool()):Promise<ForgeRules>{const [r]=await c.query<RowDataPacket[]>("SELECT setting_value FROM game_settings WHERE setting_key='forge_rules'");return r.length?parse(r[0].setting_value):structuredClone(defaultForgeRules)}
export async function saveForgeRules(rules:ForgeRules){await inTransaction(async c=>{await c.execute("INSERT INTO game_settings (setting_key,setting_value,value_type,description) VALUES ('forge_rules',?,'JSON','精炼、打孔的单机概率配置；未取得官方概率表') ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)",[JSON.stringify(rules)]);await c.execute("INSERT INTO admin_audit_logs (action,entity_type,after_json) VALUES ('UPDATE','FORGE_RULES',?)",[JSON.stringify(rules)])})}
export type ForgeAction=ForgeCommand&{slot:EquipmentSlot}
export async function forgeItem(heroId:number,q:ForgeAction){
  // Preserve existing hero-workbench retry fingerprints across this update.
  const fields=q.operation==='UNSOCKET'?{gemIndex:q.gemIndex,gemItemId:q.gemItemId}:{materialId:q.materialId}
  return runForge({kind:'EQUIPPED',heroId,slot:q.slot},q,JSON.stringify({heroId,slot:q.slot,operation:q.operation,...fields}))
}
export async function forgeEquipment(target:ForgeTarget,q:ForgeCommand){
  const fields=q.operation==='UNSOCKET'?{gemIndex:q.gemIndex,gemItemId:q.gemItemId}:{materialId:q.materialId}
  return runForge(target,q,JSON.stringify({target,operation:q.operation,...fields}))
}
async function resolveEquipment(c:PoolConnection,target:ForgeTarget):Promise<EquippedItem>{
  if(target.kind==='EQUIPPED'){
    await lockAvailableHero(c,target.heroId)
    const [locked]=await c.query<RowDataPacket[]>('SELECT g.id FROM equipment_instances g JOIN hero_equipment e ON e.instance_id=g.id WHERE e.owned_hero_id=? AND e.slot=? AND g.player_id=? FOR UPDATE',[target.heroId,target.slot,config.PLAYER_ID])
    if(!locked.length)throw Error('请先装备一件物品')
    if(target.instanceId&&Number(locked[0].id)!==target.instanceId)throw Error('该部位装备已变化，请重新选择')
    return (await getEquipment(c)).find(e=>e.heroId===target.heroId&&e.slot===target.slot)!
  }
  if(target.kind==='INSTANCE'){
    const [rows]=await c.query<RowDataPacket[]>('SELECT i.*,g.id instance_id,g.refine_level,g.sockets,g.gems_json,g.extra_bonuses FROM equipment_instances g JOIN item_definitions i ON i.id=g.item_definition_id WHERE g.id=? AND g.player_id=? FOR UPDATE',[target.instanceId,config.PLAYER_ID])
    if(!rows.length)throw Error('包裹中没有这件装备')
    const [worn]=await c.query<RowDataPacket[]>('SELECT owned_hero_id FROM hero_equipment WHERE instance_id=? FOR UPDATE',[target.instanceId])
    if(worn.length)throw Error('装备已被穿戴，请重新选择英雄身上的装备')
    const item=mapItem(rows[0]);return {heroId:0,slot:item.effectConfig.slot??'HELMET',item,gear:mapGear(rows[0])!}
  }
  const [rows]=await c.query<RowDataPacket[]>('SELECT * FROM item_definitions WHERE id=? FOR UPDATE',[target.itemId])
  if(!rows.length)throw Error('物品不存在')
  const item=mapItem(rows[0]);if(item.itemType!=='EQUIPMENT'||!item.effectConfig.slot||item.deletedAt)throw Error('请选择包裹中的装备')
  await inventoryDelta(c,item.id,-1)
  const sockets=item.effectConfig.initialSockets??0
  const [created]=await c.execute<ResultSetHeader>("INSERT INTO equipment_instances (player_id,item_definition_id,sockets,gems_json,extra_bonuses) VALUES (?,?,?,'[]','{}')",[config.PLAYER_ID,item.id,sockets])
  return {heroId:0,slot:item.effectConfig.slot,item,gear:{instanceId:created.insertId,refineLevel:0,sockets,gems:[],extraBonuses:{}}}
}
async function runForge(target:ForgeTarget,q:ForgeCommand,fingerprint:string){return inTransaction(async c=>{
  await c.query('SELECT id FROM player_profile WHERE id=? FOR UPDATE',[config.PLAYER_ID])
  const [done]=await c.query<RowDataPacket[]>('SELECT * FROM forge_operations WHERE client_action_id=?',[q.clientActionId])
  if(done[0]){if(Number(done[0].player_id)!==config.PLAYER_ID||done[0].request_json!==fingerprint)throw Error('重复请求标识不匹配');return parse(done[0].result_json)}
  const e=await resolveEquipment(c,target),g=e.gear!
  if(e.item.deletedAt&&q.operation!=='UNSOCKET')throw Error('物品已移入回收站，请恢复后再培养；已有属性与精炼进度不变')
  let cost=0,message='',success=true
  const roll=()=>randomInt(0,1_000_000)/1_000_000
  if(q.operation==='UNSOCKET'){
    if(e.item.itemType!=='EQUIPMENT')throw Error('宝物不能取出宝石')
    if(!Number.isInteger(q.gemIndex)||q.gemIndex<0||q.gemIndex>2)throw Error('宝石孔位无效')
    const gem=g.gems[q.gemIndex]
    if(!gem||gem.itemId!==q.gemItemId)throw Error('该孔位宝石已变化，请重新选择')
    const [items]=await c.query<RowDataPacket[]>('SELECT id FROM item_definitions WHERE id=?',[gem.itemId])
    if(!items.length)throw Error('宝石定义不存在，请先在后台恢复')
    g.gems.splice(q.gemIndex,1)
    await inventoryDelta(c,gem.itemId,1)
    message='已免费取出「'+gem.name+'」，宝石已退回包裹'
  }else{
   const [m]=await c.query<RowDataPacket[]>('SELECT * FROM item_definitions WHERE id=? AND enabled=1',[q.materialId]);if(!m.length)throw Error('材料不存在或已停用')
   const material=mapItem(m[0]),rules=await getForgeRules(c);cost=1
   if(q.operation==='REFINE'){
    if(!['refine_common','refine_advanced','refine_stone'].includes(material.code))throw Error('需要精炼石、高级精炼石或精炼神石')
    const r=refineOutcome(g.refineLevel,material.code==='refine_stone',rules,roll(),roll(),material.code==='refine_advanced')
    success=r.success;message=success?`精炼成功：+${g.refineLevel} → +${r.level}`:r.level<g.refineLevel?`精炼失败：降为 +${r.level}`:`精炼失败：仍为 +${g.refineLevel}`;g.refineLevel=r.level
  }else if(q.operation==='DRILL'){
    if(e.item.itemType!=='EQUIPMENT')throw Error('宝物不能打孔')
    if(material.code!=='drill_stone')throw Error('需要天工神石')
    if(g.sockets>=3)throw Error('已达到三孔上限')
    cost=rules.drillCost;success=roll()<rules.drillRates[g.sockets];if(success)g.sockets++
    message=success?`打孔成功：已有 ${g.sockets} 孔`:'打孔失败：原有孔位及宝石不变'
   }else{
    if(e.item.itemType!=='EQUIPMENT')throw Error('宝物不能镶嵌')
    if(!material.effectConfig.gemStat||!material.effectConfig.gemAmount||material.itemType!=='MATERIAL')throw Error('请选择宝石')
    if(g.gems.length>=g.sockets)throw Error('没有空余孔位，请先打孔')
    const stat=material.effectConfig.gemStat
    if(!gemFitsEquipment(material,e.item))throw Error('宝石与装备属性不相容')
    g.gems.push({itemId:material.id,name:material.name,stat,amount:material.effectConfig.gemAmount,bonuses:gemBonuses(material),icon:material.effectConfig.icon,level:material.effectConfig.gemLevel});message='镶嵌成功：'+material.name
   }
   await inventoryDelta(c,material.id,-cost)
  }
  await c.execute('UPDATE equipment_instances SET refine_level=?,sockets=?,gems_json=? WHERE id=?',[g.refineLevel,g.sockets,JSON.stringify(g.gems),g.instanceId])
  const result={success,message,gear:g,consumed:cost}
  await c.execute('INSERT INTO forge_operations (client_action_id,player_id,request_json,result_json) VALUES (?,?,?,?)',[q.clientActionId,config.PLAYER_ID,fingerprint,JSON.stringify(result)])
  // Retries are deduplicated for seven days; historical forge text need not grow forever.
  await c.execute('DELETE FROM forge_operations WHERE player_id=? AND created_at<UTC_TIMESTAMP()-INTERVAL 7 DAY',[config.PLAYER_ID])
  return result
})}
