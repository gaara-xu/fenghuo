import 'dotenv/config'
import mysql,{type RowDataPacket} from 'mysql2/promise'
import {parseConfig} from '../server/config.js'
import {zhengtuEquipment,zhengtuExtras} from '../shared/zhengtu-equipment.js'
import {itemSchema} from '../server/routes/item-schema.js'
const items=[...zhengtuEquipment,...zhengtuExtras].filter(i=>i.code.startsWith('zt_yingxiong_'))
items.forEach(i=>itemSchema.parse(i))
const cfg=parseConfig(),version='0025_supreme_fifteen'
const c=await mysql.createConnection({host:cfg.DB_HOST,port:cfg.DB_PORT,user:cfg.DB_USER,password:cfg.DB_PASSWORD,database:'fenghuo',connectTimeout:10000})
let locked=false
try{
 const [scope]=await c.query<RowDataPacket[]>('SELECT DATABASE() db');if(scope[0].db!=='fenghuo')throw Error('数据库越界')
 const [lock]=await c.query<RowDataPacket[]>("SELECT GET_LOCK('fenghuo_update',10) acquired");locked=Number(lock[0].acquired)===1;if(!locked)throw Error('另一个更新正在进行')
 await c.beginTransaction()
 const [done]=await c.query<RowDataPacket[]>('SELECT version FROM schema_migrations WHERE version=?',[version])
 if(done.length){await c.rollback();console.log('至尊15件效果已同步。')}
 else{
  for(const item of items){
   const [rows]=await c.query<RowDataPacket[]>('SELECT id,effect_config,description FROM item_definitions WHERE code=? FOR UPDATE',[item.code]);if(rows.length!==1)throw Error('缺少至尊部件：'+item.code)
   const before=rows[0],effect=typeof before.effect_config==='string'?JSON.parse(before.effect_config):before.effect_config
   const after={...effect,setCode:item.effectConfig.setCode,setBonuses:item.effectConfig.setBonuses}
   await c.execute('UPDATE item_definitions SET effect_config=?,description=? WHERE id=?',[JSON.stringify(after),item.description,before.id])
   await c.execute("INSERT INTO admin_audit_logs (action,entity_type,entity_id,before_json,after_json) VALUES ('UPDATE','ITEM',?,?,?)",[String(before.id),JSON.stringify(before),JSON.stringify({effectConfig:after,description:item.description})])
  }
  await c.execute('INSERT INTO schema_migrations (version,description) VALUES (?,?)',[version,'至尊13/15件套增强，双宝物计件；保留实例与精炼镶嵌，无DDL'])
  await c.commit();console.log('已同步13个至尊定义：15件攻防+200%、速度+50%、负重+100%。')
 }
}catch(e){await c.rollback();throw e}finally{if(locked)await c.query("SELECT RELEASE_LOCK('fenghuo_update')");await c.end()}
