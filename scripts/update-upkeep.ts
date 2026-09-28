import 'dotenv/config'
import mysql,{type RowDataPacket} from 'mysql2/promise'
import {readFile} from 'node:fs/promises'
import {parseConfig} from '../server/config.js'
import {gameNow,type ClockRow} from '../server/domain/clock.js'
import {foodRates} from '../shared/upkeep.js'
const cfg=parseConfig(),version='0013_military_upkeep'
const c=await mysql.createConnection({host:cfg.DB_HOST,port:cfg.DB_PORT,user:cfg.DB_USER,password:cfg.DB_PASSWORD,database:'fenghuo',charset:'utf8mb4',timezone:'Z',connectTimeout:10000})
try{
 const [scope]=await c.query<RowDataPacket[]>('SELECT DATABASE() db');if(scope[0].db!=='fenghuo')throw Error('数据库越界')
 const [lock]=await c.query<RowDataPacket[]>("SELECT GET_LOCK('fenghuo_update',10) acquired");if(Number(lock[0].acquired)!==1)throw Error('另一个更新正在进行')
 const [done]=await c.query<RowDataPacket[]>('SELECT version FROM schema_migrations WHERE version=?',[version])
 if(done.length)console.log('军粮结算已更新，不重复修改。')
 else{
  await c.query(await readFile(new URL('../database/migrations/0013_military_upkeep.sql',import.meta.url),'utf8'))
  await c.beginTransaction();await c.query('SELECT id FROM player_profile WHERE id=? FOR UPDATE',[cfg.PLAYER_ID])
  const [defs]=await c.query<RowDataPacket[]>('SELECT * FROM military_definitions'),[clocks]=await c.query<RowDataPacket[]>('SELECT * FROM game_clock WHERE id=1')
  for(const row of defs){const d=typeof row.config_json==='string'?JSON.parse(row.config_json):row.config_json;if(d.foodPerHour==null)await c.execute('UPDATE military_definitions SET config_json=? WHERE code=?',[JSON.stringify({...d,foodPerHour:row.kind==='TROOP'?foodRates[row.code]??0:0}),row.code])}
  const now=gameNow(clocks[0] as ClockRow)
  await c.execute('INSERT IGNORE INTO military_upkeep (player_id,last_game_at) VALUES (?,?)',[cfg.PLAYER_ID,now])
  // Pre-existing batches get a food-accounting boundary at migration, not at their historical start.
  await c.execute('INSERT INTO schema_migrations (version,description) VALUES (?,?)',[version,'军粮按游戏时钟结算；缺粮只提醒，不损兵，不追欠账'])
  await c.commit();console.log('军粮结构与耗粮表已更新；从当前游戏时间计费，缺粮不会损兵。')
 }
}catch(e){await c.rollback();throw e}finally{await c.query("SELECT RELEASE_LOCK('fenghuo_update')");await c.end()}
