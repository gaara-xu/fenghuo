import type {RowDataPacket} from 'mysql2/promise'
import {randomUUID} from 'node:crypto'
import {getPool,inTransaction} from './db.js'
import {config} from './config.js'
import {refreshMapInTransaction} from './game-service.js'
import {lockReportWriter,pruneReports,pruneFinishedMarches} from './report-service.js'
import {scheduledTasks,taskPath,type TaskCatalog,type ScheduledTaskId,type TaskRunResult} from '../shared/scheduled-tasks.js'
import {spawnIncomingRaid} from './incoming-raid-service.js'
export const TASK_HISTORY_LIMIT=50
const parse=(raw:any):TaskRunResult=>typeof raw==='string'?JSON.parse(raw):raw
export async function listScheduledTasks():Promise<TaskCatalog>{
  const [rows]=await getPool().query<RowDataPacket[]>('SELECT r.task_code,r.result_json FROM scheduled_task_runs r JOIN (SELECT task_code,MAX(id) id FROM scheduled_task_runs WHERE player_id=? GROUP BY task_code) last_run ON last_run.id=r.id',[config.PLAYER_ID])
  return {authRequired:Boolean(config.SCHEDULER_TOKEN),retainedRunsPerTask:TASK_HISTORY_LIMIT,tasks:scheduledTasks.map(t=>({...t,path:taskPath(t.id),method:'GET',lastSuccess:rows.find(r=>r.task_code===t.id)?parse(rows.find(r=>r.task_code===t.id)!.result_json):null}))}
}
export async function runScheduledTask(taskId:ScheduledTaskId,requestId:string=randomUUID()):Promise<TaskRunResult>{
  const task=scheduledTasks.find(t=>t.id===taskId);if(!task)throw Error('任务不存在')
  return inTransaction(async c=>{
    await lockReportWriter(c)
    const [done]=await c.query<RowDataPacket[]>('SELECT result_json FROM scheduled_task_runs WHERE player_id=? AND task_code=? AND request_key=? FOR UPDATE',[config.PLAYER_ID,taskId,requestId])
    if(done[0])return {...parse(done[0].result_json),replayed:true}
    let generation:number|undefined,incomingArmy:TaskRunResult['incomingArmy']
    if(taskId==='spawn-incoming-army')incomingArmy=await spawnIncomingRaid(c,requestId)
    else if(task.nodeTypes.length)generation=await refreshMapInTransaction(c,task.nodeTypes,false)
    else{await pruneReports(c);await pruneFinishedMarches(c)}
    const completedAt=new Date().toISOString(),result:TaskRunResult={ok:true,taskId,requestId,replayed:false,completedAt,summary:taskId==='spawn-incoming-army'?(incomingArmy?`${incomingArmy.name}已出发，5分钟游戏时间后抵达`:'来袭军队已关闭，本次未生成'):task.nodeTypes.length?task.name+'完成，已保留在途目标':'已清理过期记录，被攻击战报与自动出征记录保留',...(generation===undefined?{}:{generation}),...(incomingArmy===undefined?{}:{incomingArmy})}
    await c.execute('INSERT INTO scheduled_task_runs (player_id,task_code,request_key,result_json,completed_at) VALUES (?,?,?,?,?)',[config.PLAYER_ID,taskId,requestId,JSON.stringify(result),new Date(completedAt)])
    const [cutoff]=await c.query<RowDataPacket[]>('SELECT id FROM scheduled_task_runs WHERE player_id=? AND task_code=? ORDER BY id DESC LIMIT 1 OFFSET 49',[config.PLAYER_ID,taskId])
    if(cutoff[0])await c.execute('DELETE FROM scheduled_task_runs WHERE player_id=? AND task_code=? AND id<?',[config.PLAYER_ID,taskId,cutoff[0].id])
    return result
  })
}
