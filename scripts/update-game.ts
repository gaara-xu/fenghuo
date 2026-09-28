import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import mysql,{type RowDataPacket} from 'mysql2/promise'
import { parseConfig } from '../server/config.js'

const cfg=parseConfig(),version='0002_skill_learning'
const c=await mysql.createConnection({host:cfg.DB_HOST,port:cfg.DB_PORT,user:cfg.DB_USER,password:cfg.DB_PASSWORD,database:'fenghuo',multipleStatements:true,charset:'utf8mb4',connectTimeout:10000})
try{
  const [scope]=await c.query<RowDataPacket[]>('SELECT DATABASE() currentDatabase')
  if(scope[0]?.currentDatabase!=='fenghuo')throw new Error('拒绝访问非烽火数据库')
  const [lock]=await c.query<RowDataPacket[]>("SELECT GET_LOCK('fenghuo_update',10) acquired")
  if(Number(lock[0].acquired)!==1)throw new Error('另一个更新正在进行')
  const [done]=await c.query<RowDataPacket[]>('SELECT version FROM schema_migrations WHERE version=?',[version])
  if(done.length)console.log('本次更新已经应用，不重复改动现有配置。')
  else{
    // DDL 会隐式提交；该 ALTER 可重复执行。内容更新和版本记录在同一事务。
    await c.query(await readFile('database/migrations/0002_skill_learning.sql','utf8'))
    await c.beginTransaction()
    await c.query(await readFile('database/seeds/0002_skills_and_heroes.sql','utf8'))
    await c.execute('INSERT INTO schema_migrations (version,description) VALUES (?,?)',[version,'技能学习与战斗、四名新英雄、全英雄与技能图像'])
    await c.commit()
    console.log('已更新 fenghuo：英雄、技能与卡池。未重置玩家存档。')
  }
}catch(error){await c.rollback();throw error}
finally{await c.query("SELECT RELEASE_LOCK('fenghuo_update')");await c.end()}
