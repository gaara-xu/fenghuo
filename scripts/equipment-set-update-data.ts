import type {Connection,RowDataPacket} from 'mysql2/promise'
import {itemSetBonuses,type ItemDefinition} from '../shared/items.js'

export const equipmentSetUpdateVersion='0021_equipment_ten_piece_sets'
export async function applyEquipmentSetUpdate(c:Connection){
  const [scope]=await c.query<RowDataPacket[]>('SELECT DATABASE() db');if(scope[0]?.db!=='fenghuo')throw Error('数据库越界')
  const [done]=await c.query<RowDataPacket[]>('SELECT version FROM schema_migrations WHERE version=?',[equipmentSetUpdateVersion]);if(done.length)return false
  const [rows]=await c.query<RowDataPacket[]>("SELECT id,effect_config,description FROM item_definitions WHERE item_type='EQUIPMENT' FOR UPDATE")
  for(const row of rows){
    const before:ItemDefinition['effectConfig']=typeof row.effect_config==='string'?JSON.parse(row.effect_config):row.effect_config
    if(!before.setCode)continue
    const tiers=itemSetBonuses({effectConfig:before}),eight=tiers.find(t=>t.count===8)
    const ten=tiers.some(t=>t.count===10)?[]:eight?[{count:10,bonuses:Object.fromEntries(Object.keys(eight.bonuses).map(key=>[key,25]))}]:[]
    const after={...before,setBonuses:[...tiers,...ten]}
    const description=row.description.replace('集齐同套装的不同部位可获得额外属性。','穿戴同套装可获得额外属性，左右手镯与戒指各计一件。').replace('两件/五件/八件额外双防+4%/7%/10%（取最高档）；单件数值为估算。','穿戴两件/五件/八件/十件额外双防+4%/7%/10%/25%（取最高档）。')
    if(JSON.stringify(before)===JSON.stringify(after)&&description===row.description)continue
    await c.execute('UPDATE item_definitions SET effect_config=?,description=? WHERE id=?',[JSON.stringify(after),description,row.id])
    await c.execute("INSERT INTO admin_audit_logs (action,entity_type,entity_id,before_json,after_json) VALUES ('SET_TIERS','ITEM',?,?,?)",[String(row.id),JSON.stringify({effectConfig:before,description:row.description}),JSON.stringify({effectConfig:after,description})])
  }
  await c.execute('INSERT INTO schema_migrations (version,description) VALUES (?,?)',[equipmentSetUpdateVersion,'套装按穿戴槽位计数；补十件套主题属性25%，保留原有档位及后台已配十件档；不修改库存或实例'])
  return true
}
