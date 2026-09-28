import type {Pool,PoolConnection,RowDataPacket,ResultSetHeader} from 'mysql2/promise'
import type {DropPool,EquippedItem,EquipmentSlot,InventoryEntry,ItemDefinition,Loot} from '../shared/items.js'
import {getPool,inTransaction} from './db.js'
import {config} from './config.js'
import {lockAvailableHero} from './hero-service.js'
import {SeededRandom,pickTalent} from './domain/random.js'
import {rollWorldBossLoot} from '../shared/world-boss.js'
import {getWorldBossRules} from './world-boss-service.js'
import {outpostDropFactor} from '../shared/world-rules.js'
import {slotMatches,type GearState} from '../shared/items.js'
const player=config.PLAYER_ID
function parse(raw:any){return typeof raw==='string'?JSON.parse(raw):raw??{}}
export function mapItem(r:RowDataPacket):ItemDefinition{return {id:Number(r.id),code:r.code,name:r.skill_name??r.name,itemType:r.item_type,rarity:Number(r.rarity),qualityTier:Number(r.quality_tier??r.rarity),description:r.skill_description??r.description,enabled:Boolean(r.enabled)&&!r.deleted_at&&(r.item_type!=='SKILL_BOOK'||r.skill_enabled===undefined||Boolean(r.skill_enabled)),deletedAt:r.deleted_at instanceof Date?r.deleted_at.toISOString():r.deleted_at??null,effectConfig:parse(r.effect_config)}}
export async function listItems():Promise<ItemDefinition[]>{const [rows]=await getPool().query<RowDataPacket[]>(`SELECT i.*,s.name skill_name,s.description skill_description,s.enabled skill_enabled FROM item_definitions i LEFT JOIN skill_definitions s ON i.item_type='SKILL_BOOK' AND s.id=JSON_EXTRACT(i.effect_config,'$.skillId') ORDER BY i.item_type,i.rarity DESC,i.id`);return rows.map(mapItem)}
export function mapGear(r:RowDataPacket):GearState|undefined{return r.instance_id?{instanceId:Number(r.instance_id),refineLevel:Number(r.refine_level),sockets:Number(r.sockets),gems:parse(r.gems_json),extraBonuses:parse(r.extra_bonuses)}:undefined}
export async function getEquipment(c:Pool|PoolConnection=getPool()):Promise<EquippedItem[]>{const [rows]=await c.query<RowDataPacket[]>('SELECT i.*,e.owned_hero_id,e.slot,g.id instance_id,g.refine_level,g.sockets,g.gems_json,g.extra_bonuses FROM hero_equipment e JOIN owned_heroes o ON o.id=e.owned_hero_id JOIN item_definitions i ON i.id=e.item_definition_id LEFT JOIN equipment_instances g ON g.id=e.instance_id WHERE o.player_id=? AND o.retired_at IS NULL',[player]);return rows.map(r=>({heroId:Number(r.owned_hero_id),slot:r.slot,item:mapItem(r),gear:mapGear(r)}))}
export async function getInventory():Promise<InventoryEntry[]>{
  const items=await listItems(),[rows]=await getPool().query<RowDataPacket[]>('SELECT item_definition_id,quantity FROM player_inventory WHERE player_id=?',[player]),[books]=await getPool().query<RowDataPacket[]>('SELECT skill_definition_id,quantity FROM player_skill_books WHERE player_id=?',[player])
  const stacked:InventoryEntry[]=items.map(item=>({item,quantity:Number(item.itemType==='SKILL_BOOK'?books.find(b=>Number(b.skill_definition_id)===item.effectConfig.skillId)?.quantity??0:rows.find(r=>Number(r.item_definition_id)===item.id)?.quantity??0)})).filter(x=>x.quantity>0&&(x.item.itemType!=='SKILL_BOOK'||x.item.enabled))
  const [instances]=await getPool().query<RowDataPacket[]>('SELECT i.*,g.id instance_id,g.refine_level,g.sockets,g.gems_json,g.extra_bonuses FROM equipment_instances g JOIN item_definitions i ON i.id=g.item_definition_id WHERE g.player_id=? AND NOT EXISTS (SELECT 1 FROM hero_equipment e WHERE e.instance_id=g.id) ORDER BY g.id',[player])
  return [...stacked,...instances.map(r=>({item:mapItem(r),quantity:1,gear:mapGear(r)}))]
}
export async function inventoryDelta(c:PoolConnection,itemId:number,delta:number){
  if(delta<0){const [r]=await c.execute<ResultSetHeader>('UPDATE player_inventory SET quantity=quantity+? WHERE player_id=? AND item_definition_id=? AND quantity>=?',[delta,player,itemId,-delta]);if(!r.affectedRows)throw Error('物品数量不足')}
  else await c.execute('INSERT INTO player_inventory (player_id,item_definition_id,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)',[player,itemId,delta])
}
export async function equipItem(heroId:number,slot:EquipmentSlot,itemId:number|null,instanceId?:number){await inTransaction(async c=>{
  const hero=await lockAvailableHero(c,heroId)
  const [old]=await c.query<RowDataPacket[]>('SELECT item_definition_id,instance_id FROM hero_equipment WHERE owned_hero_id=? AND slot=? FOR UPDATE',[heroId,slot])
  if(old[0]&&Number(old[0].item_definition_id)===itemId&&(!instanceId||Number(old[0].instance_id)===instanceId))return
  let nextInstance:number|null=null
  if(itemId!==null){
    const [rows]=await c.query<RowDataPacket[]>('SELECT * FROM item_definitions WHERE id=? AND enabled=1 FOR UPDATE',[itemId]);if(!rows[0])throw Error('物品不存在或未启用');const item=mapItem(rows[0]);if(!item.enabled)throw Error('物品已移入回收站，不能新穿戴')
    if(!slotMatches(item,slot))throw Error('此物品不适用于该位置')
    if(Number(hero.star)*5+Number(hero.level)<(item.effectConfig.requiredStrength??0))throw Error('英雄实力不足，需要 '+item.effectConfig.requiredStrength+' 点实力（星级×5＋等级）')
    if(instanceId){const [g]=await c.query<RowDataPacket[]>('SELECT id FROM equipment_instances WHERE id=? AND player_id=? AND item_definition_id=? FOR UPDATE',[instanceId,player,itemId]);if(!g.length)throw Error('装备实例不存在');const [used]=await c.query<RowDataPacket[]>('SELECT owned_hero_id FROM hero_equipment WHERE instance_id=?',[instanceId]);if(used.length)throw Error('这件装备已经被穿戴');nextInstance=instanceId}
    else{await inventoryDelta(c,itemId,-1);const [g]=await c.execute<ResultSetHeader>('INSERT INTO equipment_instances (player_id,item_definition_id,sockets,gems_json,extra_bonuses) VALUES (?,?,?,\'[]\',\'{}\')',[player,itemId,item.itemType==='EQUIPMENT'?item.effectConfig.initialSockets??0:0]);nextInstance=g.insertId}
  }
  if(old[0]&&!old[0].instance_id)await inventoryDelta(c,Number(old[0].item_definition_id),1)
  if(itemId===null)await c.execute('DELETE FROM hero_equipment WHERE owned_hero_id=? AND slot=?',[heroId,slot])
  else await c.execute('INSERT INTO hero_equipment (owned_hero_id,slot,item_definition_id,instance_id) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE item_definition_id=VALUES(item_definition_id),instance_id=VALUES(instance_id),equipped_at=CURRENT_TIMESTAMP',[heroId,slot,itemId,nextInstance])
})}
export async function useItem(heroId:number,itemId:number,clientActionId:string){return inTransaction(async c=>{
  // Lock hero before checking idempotency: simultaneous retries cannot consume twice.
  const hero=await lockAvailableHero(c,heroId)
  const [done]=await c.query<RowDataPacket[]>('SELECT * FROM item_use_logs WHERE client_action_id=?',[clientActionId]);if(done[0]){if(Number(done[0].player_id)!==player||Number(done[0].owned_hero_id)!==heroId||Number(done[0].item_definition_id)!==itemId)throw Error('重复请求标识不匹配');return parse(done[0].result_json)}
  const [rows]=await c.query<RowDataPacket[]>('SELECT * FROM item_definitions WHERE id=? AND enabled=1',[itemId]);if(!rows[0])throw Error('物品不存在或未启用');const item=mapItem(rows[0]),cfg=item.effectConfig
  if(item.itemType!=='CONSUMABLE')throw Error('此物品不可直接使用')
  const result:any={itemName:item.name}
  if(cfg.kind==='TALENT'){
    const talent=pickTalent(new SeededRandom(clientActionId),cfg.talentWeights);result.before=hero.talent_grade;result.after=talent
    await c.execute('UPDATE owned_heroes SET talent_grade=? WHERE id=?',[talent,heroId])
  }else if(cfg.kind==='EXPERIENCE')await c.execute('UPDATE owned_heroes SET experience=experience+? WHERE id=?',[cfg.amount??0,heroId])
  else if(cfg.kind==='STAMINA'){
    const [defs]=await c.query<RowDataPacket[]>('SELECT stamina_max FROM hero_definitions WHERE id=?',[hero.hero_definition_id]);if(Number(hero.stamina)>=Number(defs[0].stamina_max))throw Error('体力已满，无需消耗道具')
    await c.execute('UPDATE owned_heroes SET stamina=LEAST(stamina+?,?) WHERE id=?',[cfg.amount??0,defs[0].stamina_max,heroId])
  }else throw Error('此道具效果尚未配置')
  await inventoryDelta(c,itemId,-1)
  await c.execute('INSERT INTO item_use_logs (client_action_id,player_id,owned_hero_id,item_definition_id,result_json) VALUES (?,?,?,?,?)',[clientActionId,player,heroId,itemId,JSON.stringify(result)])
  return result
})}
export async function retireHero(heroId:number,reason:'EXILE'|'EXECUTE',confirmName:string){await inTransaction(async c=>{
  await lockAvailableHero(c,heroId)
  const [heroes]=await c.query<RowDataPacket[]>('SELECT COALESCE(o.custom_name,h.name) name FROM owned_heroes o JOIN hero_definitions h ON h.id=o.hero_definition_id WHERE o.id=?',[heroId]);if(heroes[0].name!==confirmName.trim())throw Error('确认名字不一致，请重新确认')
  const [equipment]=await c.query<RowDataPacket[]>('SELECT item_definition_id,instance_id FROM hero_equipment WHERE owned_hero_id=?',[heroId]);for(const e of equipment)if(!e.instance_id)await inventoryDelta(c,Number(e.item_definition_id),1)
  await c.execute('DELETE FROM hero_equipment WHERE owned_hero_id=?',[heroId])
  await c.execute('DELETE FROM owned_hero_skills WHERE owned_hero_id=?',[heroId])
  await c.execute("UPDATE auto_farm_jobs SET status='COMPLETED' WHERE owned_hero_id=? AND status='PAUSED'",[heroId])
  await c.execute('UPDATE owned_heroes SET retired_at=UTC_TIMESTAMP(3),retired_reason=? WHERE id=?',[reason,heroId])
  await c.execute('INSERT INTO admin_audit_logs (action,entity_type,entity_id,after_json) VALUES (?,?,?,?)',[reason,'OWNED_HERO',String(heroId),JSON.stringify({name:heroes[0].name,equipmentReturned:equipment.length})])
})}
export async function listDropPools(c:Pool|PoolConnection=getPool()):Promise<DropPool[]>{
  const [pools]=await c.query<RowDataPacket[]>('SELECT * FROM drop_pools ORDER BY id'),[entries]=await c.query<RowDataPacket[]>('SELECT * FROM drop_pool_entries ORDER BY item_definition_id')
  return pools.map(p=>({id:Number(p.id),name:p.name,nodeType:p.node_type,minLevel:Number(p.min_level),maxLevel:Number(p.max_level),chance:Number(p.chance),rolls:Number(p.rolls),enabled:Boolean(p.enabled),entries:entries.filter(e=>Number(e.pool_id)===Number(p.id)).map(e=>({itemId:Number(e.item_definition_id),weight:Number(e.weight),minQuantity:Number(e.min_quantity),maxQuantity:Number(e.max_quantity),enabled:Boolean(e.enabled)}))}))
}
export function rollLoot(pools:DropPool[],items:ItemDefinition[],type:string,level:number,seed:string):Loot[]{
  const random=new SeededRandom(seed),result:Loot[]=[]
  for(const p of pools.filter(p=>p.enabled&&p.nodeType===type&&level>=p.minLevel&&level<=p.maxLevel)){
    if(random.next()>=p.chance*(type==='OUTPOST'?outpostDropFactor(level):1))continue
    const entries=p.entries.filter(e=>e.enabled&&e.weight>0&&items.some(i=>i.id===e.itemId&&i.enabled));if(!entries.length)continue
    for(let n=0;n<p.rolls;n++){const entry=random.pickWeighted(entries),item=items.find(i=>i.id===entry.itemId)!,quantity=entry.minQuantity+Math.floor(random.next()*(entry.maxQuantity-entry.minQuantity+1)),prior=result.find(i=>i.itemId===item.id);if(prior)prior.quantity+=quantity;else result.push({itemId:item.id,name:item.name,quantity})}
  }
  return result
}
export async function awardDrops(c:PoolConnection,nodeType:string,level:number,seed:string,worldBoss=false):Promise<Loot[]>{
  const [rows]=await c.query<RowDataPacket[]>("SELECT i.* FROM item_definitions i LEFT JOIN skill_definitions s ON s.id=JSON_EXTRACT(i.effect_config,'$.skillId') WHERE i.enabled=1 AND i.deleted_at IS NULL AND (i.item_type<>'SKILL_BOOK' OR s.enabled=1) ORDER BY i.id"),items=rows.map(mapItem),random=new SeededRandom(seed),loot=worldBoss?rollWorldBossLoot(items,await getWorldBossRules(c),()=>random.next()):rollLoot(await listDropPools(c),items,nodeType,level,seed)
  for(const l of loot){const item=items.find(i=>i.id===l.itemId)!;if(item.itemType==='SKILL_BOOK')await c.execute('INSERT INTO player_skill_books (player_id,skill_definition_id,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)',[player,item.effectConfig.skillId!,l.quantity]);else await inventoryDelta(c,l.itemId,l.quantity)}
  return loot
}
export async function saveItem(item:Omit<ItemDefinition,'id'>,id?:number){return inTransaction(async c=>{
  const [before]=id!==undefined?await c.query<RowDataPacket[]>('SELECT * FROM item_definitions WHERE id=? FOR UPDATE',[id]):[[]]
  if(id&&!before[0])throw Error('物品不存在')
  if(before[0]?.deleted_at)throw Error('请先从回收站恢复物品，再修改资料')
  if(before[0]&&(before[0].item_type!==item.itemType||parse(before[0].effect_config).slot!==item.effectConfig.slot))throw Error('已有物品不可改类别或装备位置，请新建物品以保护库存')
  if(item.itemType==='SKILL_BOOK')throw Error('技能书资料请在技能管理修改，物品管理自动同步名称与说明')
  const values=[item.code,item.name,item.itemType,item.rarity,JSON.stringify(item.effectConfig),item.description,item.enabled]
  const [r]=await c.execute<ResultSetHeader>(id?'UPDATE item_definitions SET code=?,name=?,item_type=?,rarity=?,effect_config=?,description=?,enabled=? WHERE id=?':'INSERT INTO item_definitions (code,name,item_type,rarity,effect_config,description,enabled) VALUES (?,?,?,?,?,?,?)',id?[...values,id]:values)
  const itemId=id??r.insertId;await c.execute('UPDATE item_definitions SET quality_tier=? WHERE id=?',[item.qualityTier??item.rarity,itemId]);await c.execute("INSERT INTO admin_audit_logs (action,entity_type,entity_id,before_json,after_json) VALUES ('SAVE','ITEM',?,?,?)",[String(itemId),JSON.stringify(before[0]??null),JSON.stringify(item)]);return itemId
})}
export async function setItemArchived(id:number,archived:boolean){return inTransaction(async c=>{
  const [rows]=await c.query<RowDataPacket[]>('SELECT * FROM item_definitions WHERE id=? FOR UPDATE',[id])
  const before=rows[0];if(!before)throw Error('物品不存在')
  if(!['EQUIPMENT','TREASURE'].includes(before.item_type))throw Error('回收站仅用于装备与宝物，其他物品请停用')
  if(!Object.hasOwn(before,'deleted_at'))throw Error('藏宝阁回收站尚未启用，请先执行数据库更新：npm run db:update:treasury')
  if(Boolean(before.deleted_at)===archived)return {ok:true}
  await c.execute(archived?'UPDATE item_definitions SET deleted_at=UTC_TIMESTAMP(3) WHERE id=?':'UPDATE item_definitions SET deleted_at=NULL WHERE id=?',[id])
  await c.execute('INSERT INTO admin_audit_logs (action,entity_type,entity_id,before_json,after_json) VALUES (?,?,?,?,?)',[archived?'ARCHIVE':'RESTORE','ITEM',String(id),JSON.stringify(before),JSON.stringify({archived})])
  // Definition, player inventory, worn gear, sockets and refinement are all retained.
  return {ok:true}
})}
export async function saveDropPool(p:DropPool){return inTransaction(async c=>{
  const [before]=await c.query<RowDataPacket[]>('SELECT * FROM drop_pools WHERE id=? FOR UPDATE',[p.id]);if(!before[0])throw Error('掉落池不存在')
  const ids=new Set(p.entries.map(e=>e.itemId));if(ids.size!==p.entries.length)throw Error('掉落池中物品不可重复')
  await c.execute('UPDATE drop_pools SET name=?,node_type=?,min_level=?,max_level=?,chance=?,rolls=?,enabled=? WHERE id=?',[p.name,p.nodeType,p.minLevel,p.maxLevel,p.chance,p.rolls,p.enabled,p.id])
  // 所有既有配置行保留；未选项只是停用，便于恢复。
  await c.execute('UPDATE drop_pool_entries SET enabled=0 WHERE pool_id=?',[p.id])
  for(const e of p.entries)await c.execute('INSERT INTO drop_pool_entries (pool_id,item_definition_id,weight,min_quantity,max_quantity,enabled) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE weight=VALUES(weight),min_quantity=VALUES(min_quantity),max_quantity=VALUES(max_quantity),enabled=VALUES(enabled)',[p.id,e.itemId,e.weight,e.minQuantity,e.maxQuantity,e.enabled])
  await c.execute("INSERT INTO admin_audit_logs (action,entity_type,entity_id,after_json) VALUES ('SAVE','DROP_POOL',?,?)",[String(p.id),JSON.stringify(p)])
})}
