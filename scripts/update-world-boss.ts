import 'dotenv/config'
import mysql,{type RowDataPacket} from 'mysql2/promise'
import {parseConfig} from '../server/config.js'
import {applyWorldBossUpdate} from './world-boss-update-data.js'
const cfg=parseConfig(),c=await mysql.createConnection({host:cfg.DB_HOST,port:cfg.DB_PORT,user:cfg.DB_USER,password:cfg.DB_PASSWORD,database:'fenghuo',charset:'utf8mb4',connectTimeout:10000})
let locked=false
try{
  const [lock]=await c.query<RowDataPacket[]>("SELECT GET_LOCK('fenghuo_update',10) acquired");locked=Number(lock[0].acquired)===1;if(!locked)throw Error('另一个更新正在进行')
  await c.beginTransaction();await c.query('SELECT id FROM player_profile WHERE id=? FOR UPDATE',[cfg.PLAYER_ID])
  const changed=await applyWorldBossUpdate(c);await c.commit()
  console.log(changed?'世界首领规则已启用，下次野地刷新参与抽取；未刷新现有地图，未修改库存。':'世界首领规则已存在，保留后台配置。')
}catch(e){await c.rollback();throw e}finally{if(locked)await c.query("SELECT RELEASE_LOCK('fenghuo_update')");await c.end()}
