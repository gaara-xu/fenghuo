import 'dotenv/config'
import {readFile} from 'node:fs/promises'
import mysql,{type RowDataPacket} from 'mysql2/promise'
import {parseConfig} from '../server/config.js'
import {defaultGrowth} from '../shared/hero-growth.js'
const cfg=parseConfig(),version='0003_cultivation_items'
const c=await mysql.createConnection({host:cfg.DB_HOST,port:cfg.DB_PORT,user:cfg.DB_USER,password:cfg.DB_PASSWORD,database:'fenghuo',multipleStatements:true,charset:'utf8mb4',connectTimeout:10000})
try{
  const [scope]=await c.query<RowDataPacket[]>('SELECT DATABASE() db');if(scope[0].db!=='fenghuo')throw Error('数据库越界')
  const [lock]=await c.query<RowDataPacket[]>("SELECT GET_LOCK('fenghuo_update',10) acquired");if(Number(lock[0].acquired)!==1)throw Error('另一个更新正在进行')
  const [done]=await c.query<RowDataPacket[]>('SELECT version FROM schema_migrations WHERE version=?',[version])
  if(done.length)console.log('培养与物品更新已应用，不重置现有配置。')
  else{
    await c.query(await readFile('database/migrations/0003_items.sql','utf8'))
    const [columns]=await c.query<RowDataPacket[]>("SHOW COLUMNS FROM owned_heroes LIKE 'retired_at'")
    if(!columns.length)await c.query(await readFile('database/migrations/0004_hero_retirement.sql','utf8'))
    await c.beginTransaction()
    await c.query(await readFile('database/seeds/0003_items.sql','utf8'))
    await c.execute("INSERT IGNORE INTO game_settings (setting_key,setting_value,value_type,description) VALUES ('hero_growth_rules',?,'JSON','星级天赋成长曲线，默认数值为估算')",[JSON.stringify(defaultGrowth)])
    await c.execute('INSERT INTO schema_migrations (version,description) VALUES (?,?)',[version,'武将成长、物品仓库、装备宝物、天赋水及掉落池；流放斩首历史留档'])
    await c.commit();console.log('fenghuo 培养与物品更新成功，玩家等级、经验、技能与库存均保留。')
  }
}catch(e){await c.rollback();throw e}finally{await c.query("SELECT RELEASE_LOCK('fenghuo_update')");await c.end()}
