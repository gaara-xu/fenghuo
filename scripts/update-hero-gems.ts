import 'dotenv/config'
import {readFile} from 'node:fs/promises'
import mysql,{type RowDataPacket} from 'mysql2/promise'
import {parseConfig} from '../server/config.js'
import {applyHeroUpdate,heroUpdateVersion} from './hero-update-data.js'
const cfg=parseConfig(),c=await mysql.createConnection({host:cfg.DB_HOST,port:cfg.DB_PORT,user:cfg.DB_USER,password:cfg.DB_PASSWORD,database:'fenghuo',charset:'utf8mb4',connectTimeout:10000})
try{
 const [scope]=await c.query<RowDataPacket[]>('SELECT DATABASE() db');if(scope[0].db!=='fenghuo')throw Error('数据库越界')
 const [lock]=await c.query<RowDataPacket[]>("SELECT GET_LOCK('fenghuo_update',10) acquired");if(Number(lock[0].acquired)!==1)throw Error('另一个更新正在进行')
 const [done]=await c.query<RowDataPacket[]>('SELECT version FROM schema_migrations WHERE version=?',[heroUpdateVersion])
 if(done.length)console.log('英雄宝石更新已应用，不覆盖后台自定义配置。')
 else{
  await c.query(await readFile(new URL('../database/migrations/0015_hero_gems.sql',import.meta.url),'utf8'))
  await c.beginTransaction();await applyHeroUpdate(c);await c.commit();console.log('已加入原版五系八级宝石与改名卡，家族科技技能已下架；原有存档全部保留。')
 }
}catch(e){await c.rollback();throw e}finally{await c.query("SELECT RELEASE_LOCK('fenghuo_update')");await c.end()}
