import 'dotenv/config'
import {readFile} from 'node:fs/promises'
import mysql,{type RowDataPacket} from 'mysql2/promise'
import {parseConfig} from '../server/config.js'
const cfg=parseConfig(),version='0007_scheduled_tasks'
const c=await mysql.createConnection({host:cfg.DB_HOST,port:cfg.DB_PORT,user:cfg.DB_USER,password:cfg.DB_PASSWORD,database:'fenghuo',charset:'utf8mb4',connectTimeout:10000})
try{
  const [scope]=await c.query<RowDataPacket[]>('SELECT DATABASE() db');if(scope[0].db!=='fenghuo')throw Error('数据库越界')
  const [lock]=await c.query<RowDataPacket[]>("SELECT GET_LOCK('fenghuo_update',10) acquired");if(Number(lock[0].acquired)!==1)throw Error('另一个更新正在进行')
  const [done]=await c.query<RowDataPacket[]>('SELECT version FROM schema_migrations WHERE version=?',[version])
  if(done.length)console.log('定时任务接口结构已更新，无需重复执行。')
  else{
    await c.query(await readFile('database/migrations/0007_scheduled_tasks.sql','utf8'))
    await c.execute('INSERT INTO schema_migrations (version,description) VALUES (?,?)',[version,'外部调度任务执行去重与有界成功记录；不内置调度器'])
    console.log('已新增定时任务执行记录表；未执行刷新或清理任务。')
  }
}finally{await c.query("SELECT RELEASE_LOCK('fenghuo_update')");await c.end()}
