import mysql,{type RowDataPacket} from 'mysql2/promise'
import {config} from '../server/config.js'
import {cleanupObsoleteItems} from './obsolete-item-cleanup-data.js'
const c=await mysql.createConnection({host:config.DB_HOST,port:config.DB_PORT,user:config.DB_USER,password:config.DB_PASSWORD,database:'fenghuo',charset:'utf8mb4',connectTimeout:10000})
let locked=false
try{
  const [scope]=await c.query<RowDataPacket[]>('SELECT DATABASE() db');if(scope[0]?.db!=='fenghuo')throw Error('数据库越界')
  const [lock]=await c.query<RowDataPacket[]>("SELECT GET_LOCK('fenghuo_update',10) acquired");locked=Number(lock[0].acquired)===1;if(!locked)throw Error('另一个更新正在进行')
  await c.beginTransaction();const result=await cleanupObsoleteItems(c,config.PLAYER_ID);await c.commit()
  console.log(JSON.stringify({message:result.length?'无效道具库存已清理并停用来源，清理前数据已保存到管理审计，可恢复。':'没有待清理的无效道具。',items:result},null,2))
}catch(e){await c.rollback();throw e}finally{if(locked)await c.query("SELECT RELEASE_LOCK('fenghuo_update')");await c.end()}
