import 'dotenv/config'
import {readFile} from 'node:fs/promises'
import mysql,{type RowDataPacket} from 'mysql2/promise'
import {parseConfig} from '../server/config.js'
import {officialSkills} from '../shared/skill-catalog.js'
import {effectLabels,targetLabels,modeLabels} from '../shared/labels.js'
const cfg=parseConfig(),version='0005_official_skills'
const c=await mysql.createConnection({host:cfg.DB_HOST,port:cfg.DB_PORT,user:cfg.DB_USER,password:cfg.DB_PASSWORD,database:'fenghuo',charset:'utf8mb4',connectTimeout:10000})
try{
  const [scope]=await c.query<RowDataPacket[]>('SELECT DATABASE() db');if(scope[0].db!=='fenghuo')throw Error('数据库越界')
  const [lock]=await c.query<RowDataPacket[]>("SELECT GET_LOCK('fenghuo_update',10) acquired");if(Number(lock[0].acquired)!==1)throw Error('另一个更新正在进行')
  const [done]=await c.query<RowDataPacket[]>('SELECT version FROM schema_migrations WHERE version=?',[version])
  if(done.length)console.log('官方技能目录已经更新，不重复覆盖。')
  else{
    const ddl=await readFile('database/migrations/0005_quality.sql','utf8')
    for(const table of ['hero_definitions','skill_definitions','item_definitions']){
      const [columns]=await c.query<RowDataPacket[]>('SHOW COLUMNS FROM '+table+" LIKE 'quality_tier'")
      if(!columns.length){await c.query(ddl.split('\n').find(line=>line.startsWith('ALTER TABLE '+table))!);await c.query('UPDATE '+table+' SET quality_tier='+(table==='hero_definitions'?'star':'rarity'))}
    }
    await c.beginTransaction()
    await c.query('UPDATE hero_definitions SET quality_tier=star WHERE quality_tier=1 AND star>1')
    await c.query('UPDATE item_definitions SET quality_tier=rarity WHERE quality_tier=1 AND rarity>1')
    await c.query("UPDATE hero_definitions SET quality_tier=7 WHERE code='shen_shanshan'")
    for(const [code,name,effect,target,mode,rate,value,quality] of officialSkills){
      const enabled=code!=='lingwu',base=value===70?20:value===60?10:value===100?20:value===35?10:10,perLevel=(value-base)/10,triggerBase=rate===100?0.5:0.2
      const effectConfig={base,perLevel,ratePerLevel:(rate/100-triggerBase)/10,mode}
      const description=modeLabels[mode]+' · '+targetLabels[target]+'；满级触发 '+rate+'%，'+effectLabels[effect]+' '+value+'%。'
      const [before]=await c.query<RowDataPacket[]>('SELECT * FROM skill_definitions WHERE code=? FOR UPDATE',[code])
      await c.execute('INSERT INTO skill_definitions (code,name,rarity,quality_tier,effect_type,target_scope,trigger_rate,max_level,effect_config,source_status,description,icon_key,enabled) VALUES (?,?,?,?,?,?,?,10,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),rarity=VALUES(rarity),quality_tier=VALUES(quality_tier),effect_type=VALUES(effect_type),target_scope=VALUES(target_scope),trigger_rate=VALUES(trigger_rate),max_level=10,effect_config=VALUES(effect_config),description=VALUES(description),source_status=VALUES(source_status),icon_key=VALUES(icon_key),enabled=VALUES(enabled)',[code,name,Math.min(6,quality),quality,effect,target,triggerBase,JSON.stringify(effectConfig),'ESTIMATED',description,code,enabled])
      const [rows]=await c.query<RowDataPacket[]>('SELECT id FROM skill_definitions WHERE code=?',[code]);const id=Number(rows[0].id)
      for(let level=0;level<=10;level++)await c.execute('INSERT INTO skill_levels (skill_definition_id,level,effect_value,upgrade_exp,same_book_cost) VALUES (?,?,?,?,1) ON DUPLICATE KEY UPDATE effect_value=VALUES(effect_value)',[id,level,base+perLevel*level,level*100*Math.max(1,quality-2)])
      await c.execute("INSERT INTO item_definitions (code,name,item_type,rarity,quality_tier,effect_config,description,enabled) VALUES (?,?,'SKILL_BOOK',?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),rarity=VALUES(rarity),quality_tier=VALUES(quality_tier),description=VALUES(description),enabled=VALUES(enabled)",['skill_book_'+code,name,Math.min(6,quality),quality,JSON.stringify({skillId:id}),description,enabled])
      // 保留原卡池权重；只为新技能补条目。
      await c.execute("INSERT INTO tavern_pool_entries (pool_id,reward_type,skill_definition_id,weight,enabled) SELECT p.id,'SKILL_BOOK',?, ?,? FROM tavern_pools p WHERE p.pool_type IN ('SKILL','MIXED') AND NOT EXISTS (SELECT 1 FROM tavern_pool_entries e WHERE e.pool_id=p.id AND e.skill_definition_id=?)",[id,quality===7?5:quality===6?12:quality===5?30:80,enabled,id])
      await c.execute("INSERT INTO admin_audit_logs (action,entity_type,entity_id,before_json,after_json) VALUES ('OFFICIAL_CORRECTION','SKILL',?,?,?)",[String(id),JSON.stringify(before[0]??null),JSON.stringify({code,rate,value,target,mode})])
    }
    await c.execute('INSERT INTO schema_migrations (version,description) VALUES (?,?)',[version,'腾讯官方44技能的满级数值；七档独立品质，低级曲线估算'])
    await c.commit();console.log('已录入44个官方技能条目，其中领悟默认停用；未重置已有技能等级与技能书。')
  }
}catch(e){await c.rollback();throw e}finally{await c.query("SELECT RELEASE_LOCK('fenghuo_update')");await c.end()}
