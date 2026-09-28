import {randomInt} from 'node:crypto'
import type {TavernRefreshResult} from '../shared/contracts.js'

// Single-process, single-player runtime state. Never serialize this store to disk or logs.
// IDs occupy a high safe-integer range and use a fresh random base on each service start.
export class TavernMemory {
 private sequence=randomInt(2**46,2**47)*32
 private current=new Map<number,TavernRefreshResult>()
 private actions=new Map<string,{poolId:number;refreshId:number}>()
 private tail:Promise<unknown>=Promise.resolve()
 nextId(){return ++this.sequence}
 serial<T>(work:()=>Promise<T>):Promise<T>{const result=this.tail.then(work);this.tail=result.catch(()=>{});return result}
 all(){return [...this.current.values()].map(r=>structuredClone(r))}
 retry(poolId:number,actionId:string){
  const action=this.actions.get(actionId);if(!action)return null
  if(action.poolId!==poolId)throw Error('重复请求与原卡池不一致')
  const current=this.current.get(poolId)
  if(current?.refreshId!==action.refreshId)throw Error('该刷新已过期，请使用当前候选')
  return structuredClone(current)
 }
 remember(result:TavernRefreshResult,actionId?:string){
  this.current.set(result.pool.id,structuredClone(result))
  if(actionId){this.actions.set(actionId,{poolId:result.pool.id,refreshId:result.refreshId});while(this.actions.size>512)this.actions.delete(this.actions.keys().next().value!)}
 }
 remove(poolId:number){this.current.delete(poolId)}
 candidate(id:number){for(const round of this.current.values()){const candidate=round.candidates.find(c=>c.id===id);if(candidate)return {round,candidate}}return null}
 clear(){this.current.clear();this.actions.clear()}
}
export const tavernMemory=new TavernMemory()
