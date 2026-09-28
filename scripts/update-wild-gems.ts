import 'dotenv/config'
import mysql,{type RowDataPacket} from 'mysql2/promise'
import {parseConfig} from '../server/config.js'
import {applyWildGemUpdate} from './wild-gem-update-data.js'
const cfg=parseConfig(),c=await mysql.createConnection({host:cfg.DB_HOST,port:cfg.DB_PORT,user:cfg.DB_USER,password:cfg.DB_PASSWORD,database:'fenghuo',charset:'utf8mb4',connectTimeout:10000})
let locked=false
try{
  const [scope]=await c.query<RowDataPacket[]>('SELECT DATABASE() db');if(scope[0]?.db!=='fenghuo')throw Error('数据库越界')
  const [lock]=await c.query<RowDataPacket[]>("SELECT GET_LOCK('fenghuo_update',10) acquired");locked=Number(lock[0].acquired)===1
  if(!locked)throw Error('另一个更新正在进行')
  await c.beginTransaction()
  await c.query('SELECT id FROM player_profile WHERE id=? FOR UPDATE',[cfg.PLAYER_ID])
  const changed=await applyWildGemUpdate(c)
  await c.commit()
  console.log(changed?'已启用野地一级宝石掉落：每次胜利随机一种、1至1000颗；其他池与库存不变。':'野地宝石更新已应用，不覆盖后台后续调整。')
}catch(e){await c.rollback();throw e}finally{if(locked)await c.query("SELECT RELEASE_LOCK('fenghuo_update')");await c.end()}
