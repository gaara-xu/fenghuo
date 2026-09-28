import type {RowDataPacket} from 'mysql2/promise'
import {getPool,inTransaction} from './db.js'
import {config} from './config.js'
import {mapItem,inventoryDelta} from './item-service.js'
export async function listGems(){const [rows]=await getPool().query<RowDataPacket[]>("SELECT * FROM item_definitions WHERE item_type='MATERIAL' AND enabled=1 AND deleted_at IS NULL AND JSON_EXTRACT(effect_config,'$.gemLevel') IS NOT NULL ORDER BY id");return rows.map(mapItem)}
export async function combineGems(itemId:number,quantity:number,clientActionId:string){
 if(!Number.isInteger(quantity)||quantity<1||quantity>9999)throw Error('合成数量需为1至9999')
 return inTransaction(async c=>{
  await c.query('SELECT id FROM player_profile WHERE id=? FOR UPDATE',[config.PLAYER_ID])
  const fingerprint=JSON.stringify({operation:'GEM_COMBINE',itemId,quantity})
  const [done]=await c.query<RowDataPacket[]>('SELECT * FROM forge_operations WHERE client_action_id=?',[clientActionId])
  if(done[0]){if(Number(done[0].player_id)!==config.PLAYER_ID||done[0].request_json!==fingerprint)throw Error('重复请求标识不匹配');return typeof done[0].result_json==='string'?JSON.parse(done[0].result_json):done[0].result_json}
  const [sources]=await c.query<RowDataPacket[]>('SELECT * FROM item_definitions WHERE id=? AND enabled=1 AND deleted_at IS NULL FOR UPDATE',[itemId])
  if(!sources.length)throw Error('宝石不存在或已下架')
  const source=mapItem(sources[0]),cfg=source.effectConfig
  if(source.itemType!=='MATERIAL'||!cfg.gemFamily||!cfg.gemLevel||!cfg.gemStat||!cfg.gemAmount)throw Error('此物品不可合成宝石')
  if(cfg.gemLevel>=8)throw Error('宝石已达八级')
  const [targets]=await c.query<RowDataPacket[]>("SELECT * FROM item_definitions WHERE item_type='MATERIAL' AND enabled=1 AND deleted_at IS NULL AND JSON_UNQUOTE(JSON_EXTRACT(effect_config,'$.gemFamily'))=? AND JSON_EXTRACT(effect_config,'$.gemLevel')=? ORDER BY id FOR UPDATE",[cfg.gemFamily,cfg.gemLevel+1])
  if(targets.length!==1)throw Error(targets.length?'高一级宝石配置重复，请在后台检查':'高一级宝石尚未上架')
  const target=mapItem(targets[0]);if(!target.effectConfig.gemStat||!target.effectConfig.gemAmount)throw Error('高一级宝石属性未配置')
  await inventoryDelta(c,itemId,-quantity*4);await inventoryDelta(c,target.id,quantity)
  const result={success:true,message:'合成成功：'+target.name+' × '+quantity,itemId:target.id,quantity,consumed:quantity*4}
  await c.execute('INSERT INTO forge_operations (client_action_id,player_id,request_json,result_json) VALUES (?,?,?,?)',[clientActionId,config.PLAYER_ID,fingerprint,JSON.stringify(result)])
  await c.execute('DELETE FROM forge_operations WHERE player_id=? AND created_at<UTC_TIMESTAMP()-INTERVAL 7 DAY',[config.PLAYER_ID])
  return result
 })
}
