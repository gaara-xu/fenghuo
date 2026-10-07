import 'dotenv/config'
import mysql,{type RowDataPacket} from 'mysql2/promise'
import {parseConfig} from '../server/config.js'
import {zhengtuEquipment,zhengtuGrantQuantity} from '../shared/zhengtu-equipment.js'
import {itemSchema} from '../server/routes/item-schema.js'
const cfg=parseConfig(),version='0023_zhengtu_equipment_preview'
for(const item of zhengtuEquipment)itemSchema.parse(item)
const c=await mysql.createConnection({host:cfg.DB_HOST,port:cfg.DB_PORT,user:cfg.DB_USER,password:cfg.DB_PASSWORD,database:'fenghuo',charset:'utf8mb4',connectTimeout:10000})
let locked=false
try{
  const [scope]=await c.query<RowDataPacket[]>('SELECT DATABASE() db');if(scope[0]?.db!=='fenghuo')throw Error('数据库越界')
  const [lock]=await c.query<RowDataPacket[]>("SELECT GET_LOCK('fenghuo_update',10) acquired");locked=Number(lock[0].acquired)===1;if(!locked)throw Error('另一个更新正在进行')
  await c.beginTransaction()
  const [player]=await c.query<RowDataPacket[]>('SELECT id FROM player_profile WHERE id=? FOR UPDATE',[cfg.PLAYER_ID]);if(!player.length)throw Error('玩家不存在')
  const [done]=await c.query<RowDataPacket[]>('SELECT version FROM schema_migrations WHERE version=?',[version])
  if(done.length){await c.rollback();console.log('征途首版套装已经发放，不重复赠送、不覆盖后台修改。')}
  else{
    const granted=[]
    for(const item of zhengtuEquipment){
      await c.execute('INSERT IGNORE INTO item_definitions (code,name,item_type,rarity,quality_tier,effect_config,description,enabled) VALUES (?,?,?,?,?,?,?,?)',[item.code,item.name,item.itemType,item.rarity,item.qualityTier??item.rarity,JSON.stringify(item.effectConfig),item.description,true])
      const [rows]=await c.query<RowDataPacket[]>('SELECT id FROM item_definitions WHERE code=?',[item.code]),id=Number(rows[0].id),quantity=zhengtuGrantQuantity(item)
      await c.execute('INSERT INTO player_inventory (player_id,item_definition_id,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)',[cfg.PLAYER_ID,id,quantity])
      granted.push({id,code:item.code,name:item.name,quantity})
    }
    await c.execute("INSERT INTO admin_audit_logs (action,entity_type,entity_id,after_json) VALUES ('GRANT','EQUIPMENT_SET',?,?)",[String(cfg.PLAYER_ID),JSON.stringify({version,granted})])
    await c.execute('INSERT INTO schema_migrations (version,description) VALUES (?,?)',[version,'征途首版三套装备27定义、33件赠送；原图、独立品质和11件套装，无DDL'])
    await c.commit();console.log('已加入绿色完美、紫色卓越、红色至尊三套，各11件，共33件到包裹。')
  }
}catch(e){await c.rollback();throw e}finally{if(locked)await c.query("SELECT RELEASE_LOCK('fenghuo_update')");await c.end()}
