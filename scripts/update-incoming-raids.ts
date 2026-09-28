import 'dotenv/config'
import mysql,{type RowDataPacket} from 'mysql2/promise'
import {readFile} from 'node:fs/promises'
import {parseConfig} from '../server/config.js'
import {defaultIncomingRaidRules,INCOMING_RAID_VERSION} from '../shared/incoming-raids.js'
const cfg=parseConfig(),c=await mysql.createConnection({host:cfg.DB_HOST,port:cfg.DB_PORT,user:cfg.DB_USER,password:cfg.DB_PASSWORD,database:'fenghuo',charset:'utf8mb4',connectTimeout:10000})
let locked=false
try{
  const [scope]=await c.query<RowDataPacket[]>('SELECT DATABASE() db');if(scope[0]?.db!=='fenghuo')throw Error('数据库越界')
  const [lock]=await c.query<RowDataPacket[]>("SELECT GET_LOCK('fenghuo_update',10) acquired");locked=Number(lock[0].acquired)===1;if(!locked)throw Error('另一个更新正在进行')
  const [done]=await c.query<RowDataPacket[]>('SELECT version FROM schema_migrations WHERE version=?',[INCOMING_RAID_VERSION])
  if(!done.length){
    // Idempotent DDL first: MySQL commits DDL implicitly; version and defaults commit together afterwards.
    await c.query(await readFile(new URL('../database/migrations/0022_incoming_raids.sql',import.meta.url),'utf8'))
    await c.beginTransaction();await c.query('SELECT id FROM player_profile WHERE id=? FOR UPDATE',[cfg.PLAYER_ID])
    await c.execute("INSERT IGNORE INTO game_settings (setting_key,setting_value,value_type,description) VALUES ('incoming_raid_rules',?,'JSON','随机来袭攻击范围、胜利掉率与分类数量；5分钟后进攻主城')",[JSON.stringify(defaultIncomingRaidRules)])
    await c.execute('INSERT INTO schema_migrations (version,description) VALUES (?,?)',[INCOMING_RAID_VERSION,'随机军队来袭队列、比例伤亡与防守战利品；未生成军队，未扣除兵力或发放物品'])
    await c.commit();console.log('来袭军队结构与默认规则已就绪；未生成军队，未修改兵力、物品或战报。')
  }else console.log('来袭军队结构已更新，保留现有设置。')
}catch(e){await c.rollback();throw e}finally{if(locked)await c.query("SELECT RELEASE_LOCK('fenghuo_update')");await c.end()}
