import type {PoolConnection,RowDataPacket} from 'mysql2/promise'
import type {BattleReport,IncomingReportPage} from '../shared/contracts.js'
import {getPool,inTransaction} from './db.js'
import {config} from './config.js'
export const REPORT_LIMIT=50
function parse(v:any){return typeof v==='string'?JSON.parse(v):v??{}}
export function mapReport(r:RowDataPacket):BattleReport {
  const b=parse(r.battle_config)
  return {id:Number(r.id),direction:r.direction,title:r.title,result:r.result,reward:parse(r.reward_config),occurredGameAt:new Date(r.occurred_game_at).toISOString(),skillEvents:b.skillEvents??[],basePower:b.basePower,finalPower:b.heroPower,enemyPower:b.enemyRoll,loot:b.loot??[],targetLevelBefore:b.targetLevelBefore??b.outpostLevelBefore,targetLevelAfter:b.targetLevelAfter??b.outpostLevelAfter,outpostLevelBefore:b.outpostLevelBefore,outpostLevelAfter:b.outpostLevelAfter,meleeAttack:b.meleeAttack,rangedAttack:b.rangedAttack,meleeDefense:b.meleeDefense,rangedDefense:b.rangedDefense,troopLosses:b.troopLosses,incomingRaidId:b.incomingRaidId,attackPower:b.attackPower,defensePower:b.defensePower,attackerLosses:b.attackerLosses,baseAttackPower:b.baseAttackPower,defendingHeroes:b.defendingHeroes,defenderLossReduction:b.defenderLossReduction}
}
export async function incomingReports(beforeId?:number):Promise<IncomingReportPage>{
  const c=getPool(),[rows]=await c.query<RowDataPacket[]>("SELECT * FROM battle_reports WHERE player_id=? AND direction='INCOMING'"+(beforeId?' AND id<?':'')+' ORDER BY id DESC LIMIT 21',beforeId?[config.PLAYER_ID,beforeId]:[config.PLAYER_ID])
  const [counts]=await c.query<RowDataPacket[]>("SELECT COUNT(*) total FROM battle_reports WHERE player_id=? AND direction='INCOMING'",[config.PLAYER_ID])
  const reports=rows.slice(0,20).map(mapReport)
  return {reports,total:Number(counts[0].total),nextCursor:rows.length>20?reports.at(-1)!.id:null}
}
export async function pruneReports(c:PoolConnection){
  const [cutoff]=await c.query<RowDataPacket[]>("SELECT id FROM battle_reports WHERE player_id=? AND direction='OUTGOING' ORDER BY id DESC LIMIT 1 OFFSET 49",[config.PLAYER_ID])
  if(cutoff[0])await c.execute("DELETE FROM battle_reports WHERE player_id=? AND direction='OUTGOING' AND id<?",[config.PLAYER_ID,cutoff[0].id])
}
export async function lockReportWriter(c:PoolConnection){await c.query('SELECT id FROM player_profile WHERE id=? FOR UPDATE',[config.PLAYER_ID])}
export async function clearReports(){await inTransaction(async c=>{await lockReportWriter(c);await c.execute("DELETE FROM battle_reports WHERE player_id=? AND direction='OUTGOING'",[config.PLAYER_ID])})}
export async function pruneFinishedMarches(c:PoolConnection){
  // In-flight orders are authoritative offline settlement state, not disposable history.
  await c.execute("DELETE FROM march_orders WHERE player_id=? AND order_type IN ('ATTACK','SCOUT','AUTO_FARM') AND status IN ('COMPLETED','CANCELLED')",[config.PLAYER_ID])
  // Preserve target coordinates until every referencing march has returned.
  await c.execute("DELETE n FROM map_nodes n LEFT JOIN march_orders m ON m.map_node_id=n.id WHERE n.status='DEPLETED' AND n.level=0 AND m.id IS NULL")
}
export async function maintainReports(){await inTransaction(async c=>{await lockReportWriter(c);await pruneReports(c);await pruneFinishedMarches(c)})}
