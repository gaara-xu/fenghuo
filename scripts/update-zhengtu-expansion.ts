import 'dotenv/config'
import mysql,{type RowDataPacket} from 'mysql2/promise'
import {parseConfig} from '../server/config.js'
import {zhengtuEquipment,zhengtuExtras} from '../shared/zhengtu-equipment.js'
import {itemSchema} from '../server/routes/item-schema.js'
const cfg=parseConfig(),version='0024_zhengtu_expansion'
for(const item of [...zhengtuEquipment,...zhengtuExtras])itemSchema.parse(item)
const c=await mysql.createConnection({host:cfg.DB_HOST,port:cfg.DB_PORT,user:cfg.DB_USER,password:cfg.DB_PASSWORD,database:'fenghuo',charset:'utf8mb4',connectTimeout:10000})
let locked=false
try{
 const [scope]=await c.query<RowDataPacket[]>('SELECT DATABASE() db');if(scope[0]?.db!=='fenghuo')throw Error('数据库越界')
 const [lock]=await c.query<RowDataPacket[]>("SELECT GET_LOCK('fenghuo_update',10) acquired");locked=Number(lock[0].acquired)===1;if(!locked)throw Error('另一个更新正在进行')
 await c.beginTransaction();const [player]=await c.query<RowDataPacket[]>('SELECT id FROM player_profile WHERE id=? FOR UPDATE',[cfg.PLAYER_ID]);if(!player.length)throw Error('玩家不存在')
 const [done]=await c.query<RowDataPacket[]>('SELECT version FROM schema_migrations WHERE version=?',[version])
 if(done.length){await c.rollback();console.log('配套装备已发放，不重复赠送。')}
 else{
  for(const item of zhengtuEquipment){
   const [rows]=await c.query<RowDataPacket[]>('SELECT * FROM item_definitions WHERE code=? FOR UPDATE',[item.code]);if(!rows.length)throw Error('请先导入征途首版装备')
   const before=rows[0],effect=typeof before.effect_config==='string'?JSON.parse(before.effect_config):before.effect_config,gold=item.code.startsWith('zt_tianzun_')
   const after={...effect,icon:item.effectConfig.icon,...(gold?{flatBonuses:item.effectConfig.flatBonuses,setBonuses:item.effectConfig.setBonuses}:{})}
   await c.execute('UPDATE item_definitions SET effect_config=?,rarity=?,quality_tier=?,description=? WHERE id=?',[JSON.stringify(after),gold?item.rarity:before.rarity,gold?3:before.quality_tier,gold?item.description:before.description,before.id])
   await c.execute("INSERT INTO admin_audit_logs (action,entity_type,entity_id,before_json,after_json) VALUES ('UPDATE','ITEM',?,?,?)",[String(before.id),JSON.stringify(before),JSON.stringify({effectConfig:after,qualityTier:gold?3:before.quality_tier})])
  }
  for(const item of zhengtuExtras){
   await c.execute('INSERT IGNORE INTO item_definitions (code,name,item_type,rarity,quality_tier,effect_config,description,enabled) VALUES (?,?,?,?,?,?,?,1)',[item.code,item.name,item.itemType,item.rarity,item.qualityTier??item.rarity,JSON.stringify(item.effectConfig),item.description])
   const [rows]=await c.query<RowDataPacket[]>('SELECT id FROM item_definitions WHERE code=?',[item.code])
   await c.execute('INSERT INTO player_inventory (player_id,item_definition_id,quantity) VALUES (?,?,1) ON DUPLICATE KEY UPDATE quantity=quantity+1',[cfg.PLAYER_ID,rows[0].id])
  }
  await c.execute("INSERT INTO admin_audit_logs (action,entity_type,entity_id,after_json) VALUES ('GRANT','EQUIPMENT_SET',?,?)",[String(cfg.PLAYER_ID),JSON.stringify({version,items:zhengtuExtras.map(i=>({code:i.code,quantity:1}))})])
  await c.execute('INSERT INTO schema_migrations (version,description) VALUES (?,?)',[version,'三套补肩铠、坐骑、双宝物共12件；卓越降金色及数值；统一原图包装，无DDL'])
  await c.commit();console.log('已补发12件配套装备；卓越装备已降为金色，已穿戴和库存定义同步，保留精炼镶嵌。')
 }
}catch(e){await c.rollback();throw e}finally{if(locked)await c.query("SELECT RELEASE_LOCK('fenghuo_update')");await c.end()}
