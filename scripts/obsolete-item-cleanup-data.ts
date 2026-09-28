import type {Connection,RowDataPacket,ResultSetHeader} from 'mysql2/promise'
import {isObsoleteItem,obsoleteItemCodes} from '../shared/obsolete-items.js'
const parse=(raw:any)=>typeof raw==='string'?JSON.parse(raw):raw

// Caller owns the transaction. Every removed quantity and changed source is recoverable from audit data.
export async function cleanupObsoleteItems(c:Connection,playerId:number){
  const [scope]=await c.query<RowDataPacket[]>('SELECT DATABASE() db');if(scope[0]?.db!=='fenghuo')throw Error('数据库越界')
  const [players]=await c.query<RowDataPacket[]>('SELECT id FROM player_profile WHERE id=? FOR UPDATE',[playerId]);if(!players.length)throw Error('玩家不存在')
  const [rows]=await c.query<RowDataPacket[]>(`SELECT * FROM item_definitions WHERE code IN (${obsoleteItemCodes.map(()=>'?').join(',')}) FOR UPDATE`,obsoleteItemCodes)
  const targets=rows.filter(r=>isObsoleteItem({code:r.code,itemType:r.item_type,effectConfig:parse(r.effect_config)})),ids=new Set(targets.map(r=>Number(r.id)))
  const [instances]=await c.query<RowDataPacket[]>('SELECT id,gems_json FROM equipment_instances WHERE player_id=? FOR UPDATE',[playerId])
  if(instances.some(g=>parse(g.gems_json).some((gem:{itemId:number})=>ids.has(Number(gem.itemId)))))throw Error('待清理宝石仍有镶嵌，请先取出；未改动任何道具')
  const result:Array<{id:number;code:string;name:string;removedQuantity:number;auditId:number}>=[]
  for(const item of targets){
    const [inventory]=await c.query<RowDataPacket[]>('SELECT * FROM player_inventory WHERE player_id=? AND item_definition_id=? FOR UPDATE',[playerId,item.id])
    const [drops]=await c.query<RowDataPacket[]>('SELECT * FROM drop_pool_entries WHERE item_definition_id=? FOR UPDATE',[item.id])
    const [tavern]=await c.query<RowDataPacket[]>('SELECT * FROM tavern_pool_entries WHERE item_definition_id=? FOR UPDATE',[item.id])
    if(!item.enabled&&!inventory.length&&!drops.some(e=>e.enabled)&&!tavern.some(e=>e.enabled))continue
    const removedQuantity=Number(inventory[0]?.quantity??0)
    await c.execute('UPDATE item_definitions SET enabled=0 WHERE id=?',[item.id])
    await c.execute('UPDATE drop_pool_entries SET enabled=0 WHERE item_definition_id=?',[item.id])
    await c.execute('UPDATE tavern_pool_entries SET enabled=0 WHERE item_definition_id=?',[item.id])
    await c.execute('DELETE FROM player_inventory WHERE player_id=? AND item_definition_id=?',[playerId,item.id])
    const [audit]=await c.execute<ResultSetHeader>("INSERT INTO admin_audit_logs (action,entity_type,entity_id,before_json,after_json) VALUES ('CLEAN_OBSOLETE_ITEMS','ITEM',?,?,?)",[String(item.id),JSON.stringify({playerId,definition:item,inventory,dropEntries:drops,tavernEntries:tavern}),JSON.stringify({playerId,enabled:false,removedQuantity,reason:item.code==='synthesis_stone'?'宝物合成功能未实现':'被五系八级宝石替代的旧无等级宝石'})])
    result.push({id:Number(item.id),code:item.code,name:item.name,removedQuantity,auditId:audit.insertId})
  }
  return result
}
