import 'dotenv/config'
import {readFile} from 'node:fs/promises'
import mysql,{type RowDataPacket} from 'mysql2/promise'
import {parseConfig} from '../server/config.js'
const cfg=parseConfig(),version='0009_treasury_catalog'
const c=await mysql.createConnection({host:cfg.DB_HOST,port:cfg.DB_PORT,user:cfg.DB_USER,password:cfg.DB_PASSWORD,database:'fenghuo',charset:'utf8mb4',connectTimeout:10000})
try{
 const [scope]=await c.query<RowDataPacket[]>('SELECT DATABASE() db');if(scope[0].db!=='fenghuo')throw Error('数据库越界')
 const [lock]=await c.query<RowDataPacket[]>("SELECT GET_LOCK('fenghuo_update',10) acquired");if(Number(lock[0].acquired)!==1)throw Error('另一个更新正在进行')
 const [done]=await c.query<RowDataPacket[]>('SELECT version FROM schema_migrations WHERE version=?',[version])
 if(done.length)console.log('藏宝阁结构已更新，不重复修改。')
 else{
  const [cols]=await c.query<RowDataPacket[]>("SHOW COLUMNS FROM item_definitions LIKE 'deleted_at'")
  if(!cols.length)await c.query(await readFile(new URL('../database/migrations/0009_treasury_catalog.sql',import.meta.url),'utf8'))
  await c.execute('INSERT INTO schema_migrations (version,description) VALUES (?,?)',[version,'装备宝物图鉴共用数据库；回收站保留已有库存与装备实例'])
  console.log('藏宝阁结构更新成功，未删除任何物品或库存。')
 }
}finally{await c.query("SELECT RELEASE_LOCK('fenghuo_update')");await c.end()}
