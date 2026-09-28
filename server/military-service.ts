import type {Pool,PoolConnection,RowDataPacket,ResultSetHeader} from 'mysql2/promise'
import {getPool,inTransaction} from './db.js'
import {config} from './config.js'
import {gameNow,type ClockRow} from './domain/clock.js'
import {lockReportWriter} from './report-service.js'
import {getUpkeep,nextMilitaryEvent,settleUpkeep} from './upkeep-service.js'
import {armyStats,completedUnits,stackFromDefinition,type ArmyStack,type MilitaryDefinition,type MilitaryState,type TroopSelection} from '../shared/military.js'
const player=config.PLAYER_ID
const parse=(v:any)=>typeof v==='string'?JSON.parse(v):v
export async function militaryTime(c:PoolConnection){const [rows]=await c.query<RowDataPacket[]>('SELECT * FROM game_clock WHERE id=1');if(!rows[0])throw Error('游戏时钟未初始化');return gameNow(rows[0] as ClockRow)}
export async function listMilitary(c:Pool|PoolConnection=getPool()):Promise<MilitaryDefinition[]>{const [rows]=await c.query<RowDataPacket[]>('SELECT * FROM military_definitions ORDER BY kind,code');return rows.map(r=>({...parse(r.config_json),code:r.code,name:r.name,kind:r.kind}))}
export async function forceDelta(c:PoolConnection,code:string,quantity:number){
 if(!Number.isSafeInteger(quantity))throw Error('兵力数量无效')
 if(!quantity)return
 if(quantity<0){const [r]=await c.execute<ResultSetHeader>('UPDATE player_forces SET quantity=quantity+? WHERE player_id=? AND unit_code=? AND quantity>=?',[quantity,player,code,-quantity]);if(!r.affectedRows)throw Error('可用兵力不足，请等待训练或返城')}
 else await c.execute('INSERT INTO player_forces (player_id,unit_code,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)',[player,code,quantity])
}
export async function settleMilitary(c:PoolConnection,now:Date){
 await settleUpkeep(c,now)
 const [rows]=await c.query<RowDataPacket[]>('SELECT * FROM military_orders WHERE player_id=? AND completed<quantity AND start_game_at<=? ORDER BY id FOR UPDATE',[player,now])
 for(const row of rows){const completed=completedUnits(new Date(row.start_game_at).getTime(),Number(row.seconds_per_unit),Number(row.quantity),now.getTime()),delta=completed-Number(row.completed);if(delta>0){await forceDelta(c,row.unit_code,delta);await c.execute('UPDATE military_orders SET completed=? WHERE id=?',[completed,row.id])}}
 // Keep tiny receipts for request retries for seven real days, never display finished queue history.
 await c.execute('DELETE FROM military_orders WHERE player_id=? AND completed=quantity AND created_at<UTC_TIMESTAMP()-INTERVAL 7 DAY',[player])
}
export async function processMilitaryWork(now:Date){
 const [version]=await getPool().query<RowDataPacket[]>("SELECT version FROM schema_migrations WHERE version IN ('0010_military','0012_admin_resources')");if(!version.some(v=>v.version==='0010_military'))return
 await inTransaction(async c=>{await lockReportWriter(c);const event=await nextMilitaryEvent(c,now);await settleMilitary(c,event?.at??now);if(version.some(v=>v.version==='0012_admin_resources'))await c.execute('DELETE FROM admin_resource_grants WHERE player_id=? AND created_at<UTC_TIMESTAMP()-INTERVAL 7 DAY',[player])})
}
export async function getMilitaryState():Promise<MilitaryState>{
 const [version]=await getPool().query<RowDataPacket[]>('SELECT version FROM schema_migrations WHERE version=?',['0010_military'])
 if(!version.length)return {definitions:[],stock:{},orders:[],defense:{melee:0,ranged:0},ready:false}
 const definitions=await listMilitary(),[[stockRows],[orders]]=await Promise.all([getPool().query<RowDataPacket[]>('SELECT unit_code,quantity FROM player_forces WHERE player_id=?',[player]),getPool().query<RowDataPacket[]>('SELECT * FROM military_orders WHERE player_id=? AND completed<quantity ORDER BY start_game_at,id',[player])])
 const stock=Object.fromEntries(stockRows.map(r=>[r.unit_code,Number(r.quantity)])),home=armyStats(definitions.map(d=>stackFromDefinition(d,stock[d.code]??0)))
 return {ready:true,definitions,stock,upkeep:await getUpkeep(),defense:{melee:home.meleeDefense*2,ranged:home.rangedDefense*2},orders:orders.map(r=>({id:Number(r.id),code:r.unit_code,name:parse(r.snapshot_json).name,kind:r.lane,quantity:Number(r.quantity),completed:Number(r.completed),seconds:Number(r.seconds_per_unit),startGameAt:new Date(r.start_game_at).toISOString(),endGameAt:new Date(r.end_game_at).toISOString()}))}
}
export async function enqueueMilitary(code:string,quantity:number,clientActionId:string){
 if(!Number.isSafeInteger(quantity)||quantity<1||quantity>100000)throw Error('数量须为1至100000的整数')
 return inTransaction(async c=>{
  await lockReportWriter(c)
  const [done]=await c.query<RowDataPacket[]>('SELECT * FROM military_orders WHERE player_id=? AND client_action_id=?',[player,clientActionId])
  if(done[0]){if(done[0].unit_code!==code||Number(done[0].quantity)!==quantity)throw Error('重复请求标识不匹配');return {id:Number(done[0].id),endGameAt:new Date(done[0].end_game_at).toISOString()}}
  const d=(await listMilitary(c)).find(d=>d.code===code);if(!d?.enabled)throw Error('兵种或城防不存在或未启用')
  const now=await militaryTime(c);await settleMilitaryBeforeAction(c,now)
  const [pending]=await c.query<RowDataPacket[]>('SELECT MAX(end_game_at) ending,COUNT(*) count FROM military_orders WHERE player_id=? AND lane=? AND completed<quantity',[player,d.kind]);if(Number(pending[0].count)>=50)throw Error('当前队列已满，请等待完成')
  const start=new Date(Math.max(now.getTime(),pending[0].ending?new Date(pending[0].ending).getTime():0)),end=new Date(start.getTime()+d.seconds*quantity*1000)
  if(end.getTime()-now.getTime()>365*86400_000)throw Error('队列总时长不能超过一年，请减少数量')
  const costs=['food','wood','stone','iron','gold'] as const,total=costs.map(k=>(d.cost[k]??0)*quantity)
  if(!total.every(Number.isSafeInteger))throw Error('资源总价超出范围')
  const [wallet]=await c.execute<ResultSetHeader>('UPDATE resource_wallet SET food=food-?,wood=wood-?,stone=stone-?,iron=iron-?,gold=gold-? WHERE player_id=? AND food>=? AND wood>=? AND stone>=? AND iron>=? AND gold>=?',[...total,player,...total])
  if(!wallet.affectedRows)throw Error('招募／建造所需资源或金币不足')
  const [r]=await c.execute<ResultSetHeader>('INSERT INTO military_orders (player_id,unit_code,lane,quantity,seconds_per_unit,start_game_at,end_game_at,snapshot_json,client_action_id) VALUES (?,?,?,?,?,?,?,?,?)',[player,code,d.kind,quantity,d.seconds,start,end,JSON.stringify(d),clientActionId])
  return {id:r.insertId,endGameAt:end.toISOString()}
 })
}
export async function reserveTroops(c:PoolConnection,selection:TroopSelection[]):Promise<ArmyStack[]>{
 if(!selection.length)return []
 if(selection.length>30||new Set(selection.map(s=>s.code)).size!==selection.length)throw Error('兵种重复或编队过大')
 const definitions=await listMilitary(c),result:ArmyStack[]=[]
 for(const s of [...selection].sort((a,b)=>a.code.localeCompare(b.code))){
  if(!Number.isSafeInteger(s.quantity)||s.quantity<1||s.quantity>1000000)throw Error('出征数量须为1至1000000的整数')
  const d=definitions.find(d=>d.code===s.code);if(!d?.enabled||d.kind!=='TROOP')throw Error('只能派遣已启用的兵种，城防不可出征')
  await forceDelta(c,s.code,-s.quantity);result.push(stackFromDefinition(d,s.quantity))
 }
 return result
}
export async function returnTroops(c:PoolConnection,army:ArmyStack[]){for(const s of army)if(s.kind==='TROOP'&&s.quantity>0)await forceDelta(c,s.code,s.quantity)}
export function readArmy(raw:unknown):ArmyStack[]{const parsed=parse(raw);return parsed?.units??[]}
export async function saveMilitary(d:MilitaryDefinition){return inTransaction(async c=>{
 await lockReportWriter(c)
 await settleMilitaryBeforeAction(c,await militaryTime(c))
 const [rows]=await c.query<RowDataPacket[]>('SELECT * FROM military_definitions WHERE code=? FOR UPDATE',[d.code]);if(!rows[0])throw Error('兵种或城防不存在')
 if(rows[0].kind!==d.kind)throw Error('不能改变已有定义类别')
 await c.execute('UPDATE military_definitions SET name=?,config_json=? WHERE code=?',[d.name,JSON.stringify({...d,sourceStatus:'DIY'}),d.code])
 await c.execute("INSERT INTO admin_audit_logs (action,entity_type,entity_id,before_json,after_json) VALUES ('SAVE','MILITARY',?,?,?)",[d.code,JSON.stringify(rows[0]),JSON.stringify(d)])
 return {ok:true}
})}
export async function settleMilitaryBeforeAction(c:PoolConnection,now:Date){
 // Load the world coordinator lazily; its event handlers use the military
 // primitives above. Keep settlement and the requested action in one transaction.
 const {settleDueWorldEvents}=await import('./world-service.js')
 await settleDueWorldEvents(c,now)
 await settleMilitary(c,now)
}
