import type {Pool,PoolConnection,RowDataPacket} from 'mysql2/promise'
import {getPool} from './db.js'
import {config} from './config.js'
import {foodRates,foodCharge,productionSoldierHours,type UpkeepState} from '../shared/upkeep.js'
import {INCOMING_RAID_VERSION} from '../shared/incoming-raids.js'
const parse=(v:any)=>typeof v==='string'?JSON.parse(v):v
async function ready(c:Pool|PoolConnection){const [r]=await c.query<RowDataPacket[]>("SELECT version FROM schema_migrations WHERE version='0013_military_upkeep'");return Boolean(r.length)}
export async function nextMilitaryEvent(c:Pool|PoolConnection,now:Date):Promise<{kind:'MARCH'|'FARM'|'INCOMING';id:number;at:Date}|null>{
 const [ready]=await c.query<RowDataPacket[]>('SELECT version FROM schema_migrations WHERE version=?',[INCOMING_RAID_VERSION])
 const raidSql=ready.length?" UNION ALL SELECT 'INCOMING' kind,id,arrive_game_at at_time FROM incoming_raids WHERE player_id=?":''
 const [r]=await c.query<RowDataPacket[]>(`SELECT * FROM (
 SELECT 'MARCH' kind,id,IF(status='RETURNING',return_game_at,arrive_game_at) at_time FROM march_orders WHERE player_id=? AND status IN ('MARCHING','RETURNING')
 UNION ALL SELECT 'FARM' kind,j.id,j.next_run_game_at at_time FROM auto_farm_jobs j WHERE j.player_id=? AND j.status='ACTIVE' AND NOT EXISTS (SELECT 1 FROM march_orders m WHERE m.auto_farm_job_id=j.id AND m.status IN ('MARCHING','RETURNING'))
 ${raidSql}) events WHERE at_time<=? ORDER BY at_time,CASE kind WHEN 'MARCH' THEN 0 WHEN 'INCOMING' THEN 1 ELSE 2 END,id LIMIT 1`,[config.PLAYER_ID,config.PLAYER_ID,...(ready.length?[config.PLAYER_ID]:[]),now])
 return r[0]?{kind:r[0].kind,id:Number(r[0].id),at:new Date(r[0].at_time)}:null
}
async function population(c:Pool|PoolConnection){
 const [[defs],[stock],[marches],[jobs]]=await Promise.all([c.query<RowDataPacket[]>('SELECT code,kind,config_json FROM military_definitions'),c.query<RowDataPacket[]>('SELECT unit_code,quantity FROM player_forces WHERE player_id=?',[config.PLAYER_ID]),c.query<RowDataPacket[]>("SELECT troop_config FROM march_orders WHERE player_id=? AND status IN ('MARCHING','RETURNING')",[config.PLAYER_ID]),c.query<RowDataPacket[]>("SELECT troop_config FROM auto_farm_jobs WHERE player_id=? AND status='ACTIVE'",[config.PLAYER_ID])])
 const rates=Object.fromEntries(defs.map(d=>[d.code,d.kind==='TROOP'?Number(parse(d.config_json).foodPerHour??foodRates[d.code]??0):0]))
 let hourly=stock.reduce((n,s)=>n+Number(s.quantity)*(rates[s.unit_code]??0),0)
 for(const row of [...marches,...jobs])for(const s of parse(row.troop_config)?.units??[])if(s.kind==='TROOP')hourly+=s.quantity*(rates[s.code]??s.foodPerHour??0)
 return {hourly,rates}
}
export async function settleUpkeep(c:PoolConnection,now:Date){
 if(!await ready(c))return
 const [rows]=await c.query<RowDataPacket[]>('SELECT * FROM military_upkeep WHERE player_id=? FOR UPDATE',[config.PLAYER_ID]);const row=rows[0];if(!row)return
 const from=new Date(row.last_game_at).getTime(),to=now.getTime();if(to<=from)return
 const {hourly,rates}=await population(c)
 let required=hourly*(to-from)/3600000
 const [orders]=await c.query<RowDataPacket[]>("SELECT * FROM military_orders WHERE player_id=? AND lane='TROOP' AND completed<quantity AND start_game_at<?",[config.PLAYER_ID,now])
 for(const o of orders)required+=productionSoldierHours(new Date(o.start_game_at).getTime(),Number(o.seconds_per_unit),Number(o.completed),Number(o.quantity),from,to)*(rates[o.unit_code]??0)
 const [wallet]=await c.query<RowDataPacket[]>('SELECT food FROM resource_wallet WHERE player_id=? FOR UPDATE',[config.PLAYER_ID]);if(!wallet[0])throw Error('资源仓库不存在')
 const charge=foodCharge(Number(wallet[0].food),Number(row.fraction),required)
 if(charge.paid>0)await c.execute('UPDATE resource_wallet SET food=food-? WHERE player_id=?',[charge.paid,config.PLAYER_ID])
 await c.execute('UPDATE military_upkeep SET last_game_at=?,fraction=? WHERE player_id=?',[now,charge.fraction,config.PLAYER_ID])
}
export async function getUpkeep():Promise<UpkeepState|undefined>{
 const c=getPool();if(!await ready(c))return undefined
 const [{hourly},[r]]=await Promise.all([population(c),c.query<RowDataPacket[]>('SELECT u.last_game_at,w.food FROM military_upkeep u JOIN resource_wallet w ON w.player_id=u.player_id WHERE u.player_id=?',[config.PLAYER_ID])]);if(!r[0])return undefined
 return {hourly,food:Number(r[0].food),shortage:hourly>0&&Number(r[0].food)===0,lastGameAt:new Date(r[0].last_game_at).toISOString()}
}
