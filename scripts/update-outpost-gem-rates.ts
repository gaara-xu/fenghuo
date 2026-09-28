import 'dotenv/config'
import mysql,{type RowDataPacket} from 'mysql2/promise'
import {parseConfig} from '../server/config.js'
import {applyOutpostGemRateUpdate,applyOutpostGemQuantityUpdate} from './outpost-gem-rate-data.js'
const cfg=parseConfig(),c=await mysql.createConnection({host:cfg.DB_HOST,port:cfg.DB_PORT,user:cfg.DB_USER,password:cfg.DB_PASSWORD,database:'fenghuo',charset:'utf8mb4',connectTimeout:10000})
let locked=false
try{
  const [scope]=await c.query<RowDataPacket[]>('SELECT DATABASE() db');if(scope[0]?.db!=='fenghuo')throw Error('数据库越界')
  const [lock]=await c.query<RowDataPacket[]>("SELECT GET_LOCK('fenghuo_update',10) acquired");locked=Number(lock[0].acquired)===1
  if(!locked)throw Error('另一个更新正在进行')
  await c.beginTransaction()
  await c.query('SELECT id FROM player_profile WHERE id=? FOR UPDATE',[cfg.PLAYER_ID])
  const changed=await applyOutpostGemRateUpdate(c)
  const quantityChanged=await applyOutpostGemQuantityUpdate(c)
  await c.commit()
  if(changed)console.log('据点宝石基础掉率已提高至100%，实际随等级为25%至100%。')
  console.log(quantityChanged?'据点宝石单次掉落数量已改为随机1至1000颗，普通和自动出征共用；已有库存与历史战报不变。':'据点宝石数量更新已应用，不覆盖后台后续调整。')
}catch(e){await c.rollback();throw e}finally{if(locked)await c.query("SELECT RELEASE_LOCK('fenghuo_update')");await c.end()}
