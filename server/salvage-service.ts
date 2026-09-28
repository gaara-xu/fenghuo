import {randomInt} from 'node:crypto'
import {z} from 'zod'
import type {RowDataPacket} from 'mysql2/promise'
import {inTransaction} from './db.js'
import {config} from './config.js'
import {inventoryDelta,mapGear,mapItem} from './item-service.js'
import {salvageBlockReason,salvageReward,salvageRules} from '../shared/salvage.js'
import type {Loot} from '../shared/items.js'
export const salvageSchema=z.object({clientActionId:z.string().uuid(),targets:z.array(z.discriminatedUnion('kind',[
  z.object({kind:z.literal('STACK'),itemId:z.number().int().positive(),quantity:z.number().int().min(1).max(salvageRules.maxPieces)}).strict(),
  z.object({kind:z.literal('INSTANCE'),instanceId:z.number().int().positive()}).strict(),
])).min(1).max(100)}).strict().superRefine((q,ctx)=>{
  const keys=q.targets.map(t=>t.kind==='STACK'?'s'+t.itemId:'i'+t.instanceId)
  if(new Set(keys).size!==keys.length)ctx.addIssue({code:'custom',message:'同一件装备不能重复选择'})
  if(q.targets.reduce((n,t)=>n+(t.kind==='STACK'?t.quantity:1),0)>salvageRules.maxPieces)ctx.addIssue({code:'custom',message:'每批最多分解1000件'})
})
export async function salvageEquipment(input:unknown){
  const q=salvageSchema.parse(input)
  return inTransaction(async c=>{
    await c.query('SELECT id FROM player_profile WHERE id=? FOR UPDATE',[config.PLAYER_ID])
    const fingerprint=JSON.stringify({operation:'SALVAGE',targets:q.targets})
    const [done]=await c.query<RowDataPacket[]>('SELECT * FROM forge_operations WHERE client_action_id=?',[q.clientActionId])
    if(done[0]){if(Number(done[0].player_id)!==config.PLAYER_ID||done[0].request_json!==fingerprint)throw Error('重复请求标识不匹配');return typeof done[0].result_json==='string'?JSON.parse(done[0].result_json):done[0].result_json}
    const [materials]=await c.query<RowDataPacket[]>("SELECT * FROM item_definitions WHERE code IN ('refine_common','refine_advanced') AND enabled=1 AND deleted_at IS NULL FOR UPDATE")
    if(materials.length!==2||materials.some(m=>m.item_type!=='MATERIAL'))throw Error('精炼材料未就绪，请先在后台启用精炼石与高级精炼石')
    let pieces=0,common=0,advanced=0
    for(const target of q.targets){
      const [rows]=target.kind==='STACK'
        ?await c.query<RowDataPacket[]>('SELECT * FROM item_definitions WHERE id=? FOR UPDATE',[target.itemId])
        :await c.query<RowDataPacket[]>('SELECT i.*,g.id instance_id,g.refine_level,g.sockets,g.gems_json,g.extra_bonuses FROM equipment_instances g JOIN item_definitions i ON i.id=g.item_definition_id WHERE g.id=? AND g.player_id=? FOR UPDATE',[target.instanceId,config.PLAYER_ID])
      if(!rows.length)throw Error('选择的装备已不在包裹中')
      const item=mapItem(rows[0]),gear=mapGear(rows[0]),quantity=target.kind==='STACK'?target.quantity:1
      const blocked=salvageBlockReason({item,gear,quantity});if(blocked)throw Error(blocked)
      if(target.kind==='INSTANCE'){
        const [worn]=await c.query<RowDataPacket[]>('SELECT owned_hero_id FROM hero_equipment WHERE instance_id=? FOR UPDATE',[target.instanceId])
        if(worn.length)throw Error('已穿戴装备不能分解，请先卸下')
        await c.execute('DELETE FROM equipment_instances WHERE id=? AND player_id=?',[target.instanceId,config.PLAYER_ID])
      }else await inventoryDelta(c,item.id,-quantity)
      const reward=salvageReward(item.rarity,gear?.refineLevel??0,quantity,()=>randomInt(0,1000000)/1000000)
      pieces+=quantity;common+=reward.common;advanced+=reward.advanced
    }
    const loot:Loot[]=[]
    for(const [code,quantity] of [['refine_common',common],['refine_advanced',advanced]] as const){
      if(!quantity)continue
      const material=materials.find(m=>m.code===code)!;await inventoryDelta(c,Number(material.id),quantity);loot.push({itemId:Number(material.id),name:material.name,quantity})
    }
    const result={success:true,pieces,loot,message:'已分解 '+pieces+' 件装备：'+loot.map(l=>l.name+' × '+l.quantity).join('，')}
    await c.execute('INSERT INTO forge_operations (client_action_id,player_id,request_json,result_json) VALUES (?,?,?,?)',[q.clientActionId,config.PLAYER_ID,fingerprint,JSON.stringify(result)])
    await c.execute('DELETE FROM forge_operations WHERE player_id=? AND created_at<UTC_TIMESTAMP()-INTERVAL 7 DAY',[config.PLAYER_ID])
    return result
  })
}
