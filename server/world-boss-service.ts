import type {Pool,PoolConnection,RowDataPacket} from 'mysql2/promise'
import {z} from 'zod'
import {getPool,inTransaction} from './db.js'
import {config} from './config.js'
import {gameNow,type ClockRow} from './domain/clock.js'
import {defaultWorldBossRules,worldBossExpiresAt,worldBossGarrison,type WorldBossRules} from '../shared/world-boss.js'
const range=z.object({min:z.number().int().min(1).max(100000),max:z.number().int().min(1).max(100000)}).strict().refine(r=>r.min<=r.max,'数量下限不能超过上限')
export const worldBossRulesSchema=z.object({enabled:z.boolean(),level:z.number().int().min(1).max(1000).default(defaultWorldBossRules.level),meleeDefense:z.number().int().min(1).max(1e12).default(defaultWorldBossRules.meleeDefense),rangedDefense:z.number().int().min(1).max(1e12).default(defaultWorldBossRules.rangedDefense),spawnChance:z.number().min(0).max(1),itemChance:z.number().min(0).max(1),quantities:z.object({EQUIPMENT:range,TREASURE:range,SKILL_BOOK:range,CONSUMABLE:range,GEM:range,MATERIAL:range}).strict()}).strict()
export async function getWorldBossRules(c:Pool|PoolConnection=getPool()):Promise<WorldBossRules>{
  const [r]=await c.query<RowDataPacket[]>("SELECT setting_value FROM game_settings WHERE setting_key='world_boss_rules'")
  if(!r.length)return {...structuredClone(defaultWorldBossRules),enabled:false}
  return worldBossRulesSchema.parse(typeof r[0].setting_value==='string'?JSON.parse(r[0].setting_value):r[0].setting_value)
}
export async function saveWorldBossRules(input:unknown){
  const rules=worldBossRulesSchema.parse(input)
  return inTransaction(async c=>{
    await c.query('SELECT id FROM player_profile WHERE id=? FOR UPDATE',[config.PLAYER_ID])
    const before=await getWorldBossRules(c)
    await c.execute("INSERT INTO game_settings (setting_key,setting_value,value_type) VALUES ('world_boss_rules',?,'JSON') ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)",[JSON.stringify(rules)])
    await c.execute("INSERT INTO admin_audit_logs (action,entity_type,entity_id,before_json,after_json) VALUES ('SAVE','WORLD_BOSS','rules',?,?)",[JSON.stringify(before),JSON.stringify(rules)])
    return rules
  })
}

// Caller holds the player lock. Preserve coordinates until all referencing armies return.
// Older saves get one persisted deadline; subsequent refreshes/restarts never extend it.
export async function maintainWorldBosses(c:PoolConnection,now?:Date):Promise<Date>{
  if(!now){const [clocks]=await c.query<RowDataPacket[]>('SELECT * FROM game_clock WHERE id=1');if(!clocks[0])throw Error('游戏时钟未初始化');now=gameNow(clocks[0] as ClockRow)}
  const [rows]=await c.query<RowDataPacket[]>("SELECT * FROM map_nodes WHERE JSON_EXTRACT(garrison_config,'$.worldBoss')=true FOR UPDATE")
  for(const row of rows){
    if(row.status!=='ACTIVE'||Number(row.level)<=0)continue
    let expiry=worldBossExpiresAt(row.garrison_config)
    if(!expiry){
      const raw=typeof row.garrison_config==='string'?JSON.parse(row.garrison_config):row.garrison_config
      const defaults=worldBossGarrison(defaultWorldBossRules,now),snap={...defaults,...raw,expiresGameAt:defaults.expiresGameAt}
      await c.execute('UPDATE map_nodes SET garrison_config=? WHERE id=?',[JSON.stringify(snap),row.id]);expiry=snap.expiresGameAt
    }
    if(Date.parse(expiry!)>now.getTime())continue
    // An offline battle that arrived before the deadline must still settle normally.
    const [pending]=await c.query<RowDataPacket[]>("SELECT id FROM march_orders WHERE map_node_id=? AND status='MARCHING' AND arrive_game_at<? LIMIT 1",[row.id,new Date(expiry!)])
    if(!pending.length)await c.execute("UPDATE map_nodes SET level=0,status='DEPLETED' WHERE id=?",[row.id])
  }
  await c.execute("DELETE n FROM map_nodes n LEFT JOIN march_orders m ON m.map_node_id=n.id WHERE JSON_EXTRACT(n.garrison_config,'$.worldBoss')=true AND n.status='DEPLETED' AND n.level=0 AND m.id IS NULL")
  return now
}
