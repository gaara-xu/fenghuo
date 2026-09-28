import 'dotenv/config'
import mysql,{type RowDataPacket} from 'mysql2/promise'
import {readFile} from 'node:fs/promises'
import {parseConfig} from '../server/config.js'
import {militaryDefaults} from '../shared/military.js'
const cfg=parseConfig(),version='0010_military'
const c=await mysql.createConnection({host:cfg.DB_HOST,port:cfg.DB_PORT,user:cfg.DB_USER,password:cfg.DB_PASSWORD,database:'fenghuo',charset:'utf8mb4',connectTimeout:10000})
try{
 const [scope]=await c.query<RowDataPacket[]>('SELECT DATABASE() db');if(scope[0].db!=='fenghuo')throw Error('数据库越界')
 const [lock]=await c.query<RowDataPacket[]>("SELECT GET_LOCK('fenghuo_update',10) acquired");if(Number(lock[0].acquired)!==1)throw Error('另一个更新正在进行')
 const [done]=await c.query<RowDataPacket[]>('SELECT version FROM schema_migrations WHERE version=?',[version])
 if(done.length)console.log('兵种与城防队列已更新，不重复写入。')
 else{
  const ddl=await readFile(new URL('../database/migrations/0010_military.sql',import.meta.url),'utf8')
  for(const statement of ddl.split(';').map(s=>s.trim()).filter(Boolean))await c.query(statement)
  for(const [table,field,definition] of [['march_orders','client_action_id','varchar(64) DEFAULT NULL'],['march_orders','auto_farm_job_id','bigint unsigned DEFAULT NULL'],['auto_farm_jobs','troop_config',"json DEFAULT NULL COMMENT '自动编队持有的兵种快照；在途时由对应行军持有'"]] as const){const [cols]=await c.query<RowDataPacket[]>('SHOW COLUMNS FROM `'+table+'` LIKE ?',[field]);if(!cols.length)await c.query('ALTER TABLE `'+table+'` ADD COLUMN `'+field+'` '+definition)}
  const [keys]=await c.query<RowDataPacket[]>("SHOW INDEX FROM march_orders WHERE Key_name='uk_march_request'");if(!keys.length)await c.query('ALTER TABLE march_orders ADD UNIQUE KEY uk_march_request (player_id,client_action_id)')
  await c.beginTransaction()
  for(const d of militaryDefaults)await c.execute('INSERT IGNORE INTO military_definitions (code,name,kind,config_json) VALUES (?,?,?,?)',[d.code,d.name,d.kind,JSON.stringify(d)])
  // Legacy defenses are retained as an archive; gameplay uses player_forces after this migration.
  for(const d of militaryDefaults.filter(d=>d.kind==='DEFENSE'))await c.execute('INSERT INTO player_forces (player_id,unit_code,quantity) SELECT player_id,?,SUM(GREATEST(0,CAST(quantity AS SIGNED)-CAST(damaged_quantity AS SIGNED))) FROM city_defenses WHERE defense_type=? GROUP BY player_id ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)',[d.code,d.name])
  await c.execute('INSERT INTO schema_migrations (version,description) VALUES (?,?)',[version,'兵种、城防、离线逐个完成队列、编队与自动出征'])
  await c.commit();console.log('兵种系统更新成功；已保留原城防数量，没有改动英雄、装备和钱包。')
 }
 // User clarified the remembered premium cavalry was uncertain: use researched units only.
 const correction='0011_military_catalog', [corrected]=await c.query<RowDataPacket[]>('SELECT version FROM schema_migrations WHERE version=?',[correction])
 if(!corrected.length){
  await c.beginTransaction()
  const [retired]=await c.query<RowDataPacket[]>("SELECT config_json FROM military_definitions WHERE code='elite_cavalry' FOR UPDATE")
  if(retired[0]){const d=typeof retired[0].config_json==='string'?JSON.parse(retired[0].config_json):retired[0].config_json;await c.execute('UPDATE military_definitions SET config_json=? WHERE code=?',[JSON.stringify({...d,enabled:false,sourceNote:'用户确认按考证资料实现；未查到该兵种，已停用。不删除曾有的库存、订单或出征快照。'}),'elite_cavalry'])}
  for(const code of ['lance_cavalry','mounted_archer','heavy_general']){const [rows]=await c.query<RowDataPacket[]>('SELECT config_json FROM military_definitions WHERE code=? FOR UPDATE',[code]);if(!rows[0])continue;const d=typeof rows[0].config_json==='string'?JSON.parse(rows[0].config_json):rows[0].config_json;if(d.sourceStatus==='ESTIMATED'){await c.execute('UPDATE military_definitions SET config_json=? WHERE code=?',[JSON.stringify({...d,cost:{...d.cost,gold:0}}),code])}}
  await c.execute('INSERT INTO schema_migrations (version,description) VALUES (?,?)',[correction,'按用户最终确认停用未考证快骑，取消未经证实的骑兵与重甲招募金币附加费'])
  await c.commit();console.log('兵种目录校正完成：启用9种旧资料兵种；未考证快骑停用，已有资产保留。')
 }
}catch(e){await c.rollback();throw e}finally{await c.query("SELECT RELEASE_LOCK('fenghuo_update')");await c.end()}
