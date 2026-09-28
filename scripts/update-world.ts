import 'dotenv/config'
import {readFile} from 'node:fs/promises'
import mysql,{type RowDataPacket} from 'mysql2/promise'
import {parseConfig} from '../server/config.js'
import {cleanSkillDescription} from '../shared/skill-copy.js'
import {outpostLevel,outpostDefense} from '../shared/world-rules.js'
const cfg=parseConfig(),version='0006_world_retention'
const c=await mysql.createConnection({host:cfg.DB_HOST,port:cfg.DB_PORT,user:cfg.DB_USER,password:cfg.DB_PASSWORD,database:'fenghuo',charset:'utf8mb4',connectTimeout:10000})
try{
  const [scope]=await c.query<RowDataPacket[]>('SELECT DATABASE() db');if(scope[0].db!=='fenghuo')throw Error('数据库越界')
  const [lock]=await c.query<RowDataPacket[]>("SELECT GET_LOCK('fenghuo_update',10) acquired");if(Number(lock[0].acquired)!==1)throw Error('另一个更新正在进行')
  const [done]=await c.query<RowDataPacket[]>('SELECT version FROM schema_migrations WHERE version=?',[version])
  if(done.length)console.log('世界规则与技能说明已更新，无需重复执行。')
  else{
    const ddl=(await readFile('database/migrations/0006_world_retention.sql','utf8')).trim().split('\n')
    const [cols]=await c.query<RowDataPacket[]>("SHOW COLUMNS FROM battle_reports LIKE 'direction'")
    if(!cols.length)await c.query(ddl[0])
    const [indexes]=await c.query<RowDataPacket[]>("SHOW INDEX FROM battle_reports WHERE Key_name='idx_report_direction'")
    if(!indexes.length)await c.query(ddl[1])
    await c.beginTransaction()
    const [skills]=await c.query<RowDataPacket[]>('SELECT id,description FROM skill_definitions FOR UPDATE')
    for(const s of skills){const description=cleanSkillDescription(s.description);if(description!==s.description)await c.execute('UPDATE skill_definitions SET description=? WHERE id=?',[description,s.id])}
    await c.execute("UPDATE item_definitions i JOIN skill_definitions s ON i.item_type='SKILL_BOOK' AND s.id=JSON_EXTRACT(i.effect_config,'$.skillId') SET i.description=s.description")
    const [nodes]=await c.query<RowDataPacket[]>("SELECT id,level,status,garrison_config FROM map_nodes WHERE node_type='OUTPOST' FOR UPDATE")
    for(const n of nodes){const level=outpostLevel(Number(n.level)),g=typeof n.garrison_config==='string'?JSON.parse(n.garrison_config):n.garrison_config??{};await c.execute('UPDATE map_nodes SET level=?,garrison_config=?,status=? WHERE id=?',[level,JSON.stringify({...g,power:outpostDefense(level)}),level===0?'DEPLETED':n.status,n.id])}
    await c.execute('INSERT INTO schema_migrations (version,description) VALUES (?,?)',[version,'主动战报50条、被攻击永久保留；据点最高20级；清理技能说明旁白'])
    await c.commit();console.log('已更新世界规则与技能说明，保留已有英雄、物品、技能等级及被攻击记录。')
  }
}catch(e){await c.rollback();throw e}finally{await c.query("SELECT RELEASE_LOCK('fenghuo_update')");await c.end()}
