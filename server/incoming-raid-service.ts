import type {Pool,PoolConnection,RowDataPacket,ResultSetHeader} from 'mysql2/promise'
import {z} from 'zod'
import {config} from './config.js'
import {getPool,inTransaction} from './db.js'
import {lockReportWriter} from './report-service.js'
import {militaryTime,settleMilitary,forceDelta,listMilitary} from './military-service.js'
import {stackFromDefinition} from '../shared/military.js'
import {INCOMING_RAID_VERSION,defaultIncomingRaidRules,RAID_TRAVEL_SECONDS,RAID_UNIT_POWER,type IncomingRaidRules,type IncomingRaid} from '../shared/incoming-raids.js'
import {SeededRandom} from './domain/random.js'
import {incomingRaidOutcome} from './domain/raid-battle.js'
import {awardCatalogDrops} from './item-service.js'
import {homeHeroArmy} from './home-defense-service.js'

const player=config.PLAYER_ID,parse=(v:any)=>typeof v==='string'?JSON.parse(v):v
const quantity=z.object({min:z.number().int().min(1).max(10000),max:z.number().int().min(1).max(10000)}).strict().refine(q=>q.min<=q.max,'数量下限不能大于上限')
export const incomingRaidRulesSchema=z.object({enabled:z.boolean(),attackMin:z.number().int().min(1).max(1e10),attackMax:z.number().int().min(1).max(1e10),itemChance:z.number().min(0).max(1),quantities:z.object({EQUIPMENT:quantity,TREASURE:quantity,SKILL_BOOK:quantity,CONSUMABLE:quantity,GEM:quantity,MATERIAL:quantity}).strict()}).strict().refine(r=>r.attackMin<=r.attackMax,'攻击下限不能大于上限')
export async function incomingRaidsReady(c:Pool|PoolConnection=getPool()){const [r]=await c.query<RowDataPacket[]>('SELECT version FROM schema_migrations WHERE version=?',[INCOMING_RAID_VERSION]);return r.length>0}
export async function getIncomingRaidRules(c:Pool|PoolConnection=getPool()):Promise<IncomingRaidRules>{
  const [r]=await c.query<RowDataPacket[]>("SELECT setting_value FROM game_settings WHERE setting_key='incoming_raid_rules'")
  return incomingRaidRulesSchema.parse(r[0]?parse(r[0].setting_value):{...structuredClone(defaultIncomingRaidRules),enabled:false})
}
export async function saveIncomingRaidRules(input:unknown){const rules=incomingRaidRulesSchema.parse(input);return inTransaction(async c=>{
  await lockReportWriter(c);if(!await incomingRaidsReady(c))throw Error('请先更新来袭军队数据库结构')
  const before=await getIncomingRaidRules(c)
  await c.execute("INSERT INTO game_settings (setting_key,setting_value,value_type) VALUES ('incoming_raid_rules',?,'JSON') ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)",[JSON.stringify(rules)])
  await c.execute("INSERT INTO admin_audit_logs (action,entity_type,entity_id,before_json,after_json) VALUES ('SAVE','INCOMING_RAID','rules',?,?)",[JSON.stringify(before),JSON.stringify(rules)])
  return rules
})}
function mapRaid(r:RowDataPacket):IncomingRaid{return {id:Number(r.id),name:r.name,attackPower:Number(r.attack_power),troopCount:Number(r.troop_count),attackType:r.attack_type,originX:Number(r.origin_x),originY:Number(r.origin_y),departGameAt:new Date(r.depart_game_at).toISOString(),arriveGameAt:new Date(r.arrive_game_at).toISOString()}}
export async function listIncomingRaids(c:Pool|PoolConnection=getPool()):Promise<IncomingRaid[]>{
  if(!await incomingRaidsReady(c))return []
  const [rows]=await c.query<RowDataPacket[]>('SELECT * FROM incoming_raids WHERE player_id=? ORDER BY arrive_game_at,id',[player]);return rows.map(mapRaid)
}
// Scheduler already holds the player lock and handles request-key deduplication.
export async function spawnIncomingRaid(c:PoolConnection,seed:string):Promise<IncomingRaid|null>{
  if(!await incomingRaidsReady(c))throw Error('请先更新来袭军队数据库结构')
  const rules=await getIncomingRaidRules(c);if(!rules.enabled)return null
  const [count]=await c.query<RowDataPacket[]>('SELECT COUNT(*) total FROM incoming_raids WHERE player_id=?',[player]);if(Number(count[0].total)>=100)throw Error('已有100支来袭军队，请等待战斗结算')
  const random=new SeededRandom(seed),power=rules.attackMin+Math.floor(random.next()*(rules.attackMax-rules.attackMin+1)),type=(['MELEE','RANGED','BALANCED'] as const)[Math.floor(random.next()*3)]
  const name={MELEE:'流寇突击军',RANGED:'山贼弓弩军',BALANCED:'叛军混编军'}[type],angle=random.next()*Math.PI*2,x=Math.round(50+48*Math.cos(angle)),y=Math.round(50+48*Math.sin(angle)),now=await militaryTime(c),arrive=new Date(now.getTime()+RAID_TRAVEL_SECONDS*1000),troops=Math.max(1,Math.ceil(power/RAID_UNIT_POWER))
  const [r]=await c.execute<ResultSetHeader>('INSERT INTO incoming_raids (player_id,name,attack_power,troop_count,attack_type,origin_x,origin_y,depart_game_at,arrive_game_at,loot_rules) VALUES (?,?,?,?,?,?,?,?,?,?)',[player,name,power,troops,type,x,y,now,arrive,JSON.stringify(rules)])
  return {id:r.insertId,name,attackPower:power,troopCount:troops,attackType:type,originX:x,originY:y,departGameAt:now.toISOString(),arriveGameAt:arrive.toISOString()}
}
export async function settleIncomingRaid(c:PoolConnection,id:number,now:Date){
  const [rows]=await c.query<RowDataPacket[]>('SELECT * FROM incoming_raids WHERE player_id=? AND id=? AND arrive_game_at<=? FOR UPDATE',[player,id,now]),row=rows[0];if(!row)return
  const raid=mapRaid(row),at=new Date(raid.arriveGameAt)
  await settleMilitary(c,at)
  const definitions=await listMilitary(c),[stock]=await c.query<RowDataPacket[]>('SELECT unit_code,quantity FROM player_forces WHERE player_id=? AND quantity>0 FOR UPDATE',[player])
  const defenders=stock.flatMap(s=>{const d=definitions.find(d=>d.code===s.unit_code);return d?[stackFromDefinition(d,Number(s.quantity))]:[]})
  const home=await homeHeroArmy(c,true),outcome=incomingRaidOutcome(raid,[...defenders,...home.army],home.skills,`raid:${id}:combat`)
  for(const loss of outcome.troopLosses)await forceDelta(c,loss.code,-loss.lost)
  const loot=outcome.result==='VICTORY'?await awardCatalogDrops(c,incomingRaidRulesSchema.parse(parse(row.loot_rules)),`raid:${id}:loot`):[]
  const title=`${outcome.result==='VICTORY'?'击退':outcome.result==='DRAW'?'同归于尽：':'未能抵御'} ${raid.name}`
  await c.execute("INSERT INTO battle_reports (player_id,direction,title,result,battle_config,reward_config,occurred_game_at) VALUES (?,'INCOMING',?,?,?,'{}',?)",[player,title,outcome.result,JSON.stringify({...outcome,incomingRaidId:id,loot}),at])
  // Report, loot, losses and deletion are atomic; retries cannot fight/award twice.
  await c.execute('DELETE FROM incoming_raids WHERE player_id=? AND id=?',[player,id])
}
