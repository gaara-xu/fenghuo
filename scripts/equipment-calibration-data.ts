import type {Connection,RowDataPacket} from 'mysql2/promise'
import {equipmentCalibration,equipmentReference} from '../shared/equipment-calibration.js'
import {advancedRefineStone} from '../shared/salvage.js'
export const equipmentCalibrationVersion='0019_equipment_calibration_salvage'
export async function applyEquipmentCalibration(c:Connection){
  const [scope]=await c.query<RowDataPacket[]>('SELECT DATABASE() db');if(scope[0]?.db!=='fenghuo')throw Error('数据库越界')
  const [done]=await c.query<RowDataPacket[]>('SELECT version FROM schema_migrations WHERE version=?',[equipmentCalibrationVersion]);if(done.length)return false
  const [rows]=await c.query<RowDataPacket[]>('SELECT id,code,effect_config FROM item_definitions WHERE item_type=? FOR UPDATE',['EQUIPMENT'])
  for(const row of rows){
    const entry=equipmentCalibration.find(e=>e.code===row.code);if(!entry)continue
    const before=typeof row.effect_config==='string'?JSON.parse(row.effect_config):row.effect_config
    if(before.sourceStatus==='DIY')continue
    const after={...before,flatBonuses:entry.flatBonuses,sourceStatus:'ESTIMATED',sourceUrl:equipmentReference}
    await c.execute('UPDATE item_definitions SET effect_config=? WHERE id=?',[JSON.stringify(after),row.id])
    await c.execute("INSERT INTO admin_audit_logs (action,entity_type,entity_id,before_json,after_json) VALUES ('CALIBRATE','ITEM',?,?,?)",[String(row.id),JSON.stringify(before),JSON.stringify(after)])
  }
  const m=advancedRefineStone
  await c.execute('INSERT IGNORE INTO item_definitions (code,name,item_type,rarity,quality_tier,description,enabled,effect_config) VALUES (?,?,?,?,?,?,?,?)',[m.code,m.name,m.itemType,m.rarity,m.qualityTier??m.rarity,m.description,m.enabled,JSON.stringify(m.effectConfig)])
  await c.execute('INSERT INTO schema_migrations (version,description) VALUES (?,?)',[equipmentCalibrationVersion,'装备按部位、攻防类型校准基础值；新增高级精炼石，分解复用forge_operations；不改实例等级、孔位、宝石及库存'])
  return true
}
