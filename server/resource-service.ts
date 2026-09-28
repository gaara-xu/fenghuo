import type {RowDataPacket} from 'mysql2/promise'
import {getPool,inTransaction} from './db.js'
import {config} from './config.js'
import {lockReportWriter} from './report-service.js'
import {resourceKeys,MAX_RESOURCE_GRANT,MAX_RESOURCE_BALANCE,type ResourceGrantResult,type ResourceAdminState} from '../shared/resources.js'
import type {Wallet} from '../shared/contracts.js'
import {militaryTime,settleMilitaryBeforeAction} from './military-service.js'
const parse=(v:any)=>typeof v==='string'?JSON.parse(v):v
const fingerprint=(amounts:Wallet)=>JSON.stringify(resourceKeys.map(k=>amounts[k]))
const mapWallet=(r:RowDataPacket)=>Object.fromEntries(resourceKeys.map(k=>[k,Number(r[k])])) as unknown as Wallet
export async function grantResources(amounts:Wallet,clientActionId:string):Promise<ResourceGrantResult>{
 if(resourceKeys.some(k=>!Number.isSafeInteger(amounts[k])||amounts[k]<0||amounts[k]>MAX_RESOURCE_GRANT)||!resourceKeys.some(k=>amounts[k]>0))throw Error('请填写非负整数，每项最多十亿，至少添加一项资源')
 return inTransaction(async c=>{
  await lockReportWriter(c)
  const [existing]=await c.query<RowDataPacket[]>('SELECT * FROM admin_resource_grants WHERE player_id=? AND client_action_id=?',[config.PLAYER_ID,clientActionId])
  if(existing[0]){if(fingerprint(parse(existing[0].amounts_json))!==fingerprint(amounts))throw Error('重复请求标识与资源数量不匹配');return parse(existing[0].result_json)}
  await settleMilitaryBeforeAction(c,await militaryTime(c))
  const [rows]=await c.query<RowDataPacket[]>('SELECT food,wood,stone,iron,gold,coupon FROM resource_wallet WHERE player_id=? FOR UPDATE',[config.PLAYER_ID]);if(!rows[0])throw Error('资源仓库不存在')
  const wallet=mapWallet(rows[0]);for(const k of resourceKeys){wallet[k]+=amounts[k];if(!Number.isSafeInteger(wallet[k])||wallet[k]>MAX_RESOURCE_BALANCE)throw Error('资源余额超出安全上限')}
  await c.execute('UPDATE resource_wallet SET food=?,wood=?,stone=?,iron=?,gold=?,coupon=? WHERE player_id=?',[...resourceKeys.map(k=>wallet[k]),config.PLAYER_ID])
  const result:ResourceGrantResult={clientActionId,amounts,wallet,appliedAt:new Date().toISOString()}
  await c.execute('INSERT INTO admin_resource_grants (player_id,client_action_id,amounts_json,result_json) VALUES (?,?,?,?)',[config.PLAYER_ID,clientActionId,JSON.stringify(amounts),JSON.stringify(result)])
  await c.execute('DELETE FROM admin_resource_grants WHERE player_id=? AND created_at<UTC_TIMESTAMP()-INTERVAL 7 DAY',[config.PLAYER_ID])
  return result
 })
}
export async function resourceAdminState():Promise<ResourceAdminState>{
 const [[wallet],[recent]]=await Promise.all([getPool().query<RowDataPacket[]>('SELECT food,wood,stone,iron,gold,coupon FROM resource_wallet WHERE player_id=?',[config.PLAYER_ID]),getPool().query<RowDataPacket[]>('SELECT result_json FROM admin_resource_grants WHERE player_id=? ORDER BY created_at DESC LIMIT 20',[config.PLAYER_ID])])
 if(!wallet[0])throw Error('资源仓库不存在')
 return {wallet:mapWallet(wallet[0]),recent:recent.map(r=>parse(r.result_json))}
}
