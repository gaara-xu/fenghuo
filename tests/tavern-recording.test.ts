import {afterEach,describe,expect,it,vi} from 'vitest'
import {nextTick} from 'vue'
import {TavernMemory} from '../server/tavern-memory'
import type {TavernRefreshResult} from '../shared/contracts'
import {clientComponent} from './vue-client'
import {renderClient} from './ui-renderer'
import {validationMessage} from '../web/game-validation'
import {useTimedNotice} from '../web/timed-notice'
const api=vi.fn(),confirm=vi.fn()
const Control=clientComponent('web/TavernRecording.vue',{'./api':{api},'./game-dialog':{gameConfirm:confirm},'./timed-notice':{useTimedNotice}})
const flush=async()=>{await Promise.resolve();await nextTick();await Promise.resolve();await nextTick()}
afterEach(()=>{vi.unstubAllGlobals();api.mockReset();confirm.mockReset()})
describe('刷新记录内存模式',()=>{
 const round=(poolId=1,refreshId=10):TavernRefreshResult=>({refreshId,pool:{id:poolId,code:'hero',name:'酒馆',poolType:'HERO',currencyCode:'gold',refreshCost:1,candidateCount:1,selectLimit:1,enabled:true},candidates:[{id:11,slotNo:1,rewardType:'HERO',heroDefinitionId:1,name:'英雄',rarity:3,recruited:false}],remainingCurrency:99,createdAt:'2026-01-01T00:00:00.000Z'})
 it('只保留各池当前轮，隔离副本，过期请求拒绝，重启无恢复',()=>{
  const m=new TavernMemory();m.remember(round(),'a');const copy=m.retry(1,'a')!;copy.candidates[0].recruited=true
  expect(m.candidate(11)?.candidate.recruited).toBe(false);expect(()=>m.retry(2,'a')).toThrow('原卡池不一致')
  m.remember(round(1,20),'b');expect(()=>m.retry(1,'a')).toThrow('过期');expect(m.all()).toHaveLength(1)
  m.remember(round(2,30),'c');expect(m.all()).toHaveLength(2)
  m.remove(1);expect(()=>m.retry(1,'b')).toThrow('过期');m.clear();expect(m.all()).toEqual([])
  expect(new TavernMemory().all()).toEqual([]);expect(Number.isSafeInteger(m.nextId())).toBe(true)
 })
 it('并发操作串行，前一操作失败不会阻塞队列',async()=>{
  const m=new TavernMemory(),events:string[]=[]
  const a=m.serial(async()=>{events.push('a');await Promise.resolve();events.push('b');throw Error('failed')})
  const b=m.serial(async()=>{events.push('c');return 2})
  await expect(a).rejects.toThrow('failed');expect(await b).toBe(2);expect(events).toEqual(['a','b','c'])
 })
 it('按钮直接切换，双击不重复提交，开关使用布尔值',async()=>{
  api.mockResolvedValueOnce({enabled:true});const v=renderClient(Control,{})
  try{
   await flush();expect(v.find('button','关闭记录')?.props.disabled).toBe(false)
   let finish!:(v:{enabled:boolean})=>void;api.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}))
   const button=v.find('button','关闭记录')!;button.props.onClick();button.props.onClick();await flush();expect(api).toHaveBeenCalledTimes(2);expect(confirm).not.toHaveBeenCalled()
   finish({enabled:false});await flush()
   expect(api).toHaveBeenLastCalledWith('/api/admin/tavern-recording',{method:'PUT',body:'{"enabled":false}'})
   expect(v.find('button','开启记录')?.props['aria-checked']).toBe(false)
  }finally{v.app.unmount()}
 })
 it('读取失败不允许误操作，重试能恢复；提交失败保留原状态',async()=>{
  api.mockRejectedValueOnce(Error('断开'));const v=renderClient(Control,{})
  try{
   await flush();expect(v.find('button','开启记录')?.props.disabled).toBe(true)
   api.mockResolvedValueOnce({enabled:false});v.find('button','重新读取')!.props.onClick();await flush()
   confirm.mockResolvedValueOnce(true);api.mockRejectedValueOnce(Error('保存失败'));v.find('button','开启记录')!.props.onClick();await flush()
   expect(v.find('button','开启记录')?.props['aria-checked']).toBe(false);expect(v.find('button','开启记录')?.props.disabled).toBe(false)
  }finally{v.app.unmount()}
 })
})
describe('自制输入校验提示',()=>{
 it('必填、数值边界、长度均提供中文错误',()=>{
  const input=(validity:any)=>({validity,min:'1',max:'8',minLength:2,maxLength:32}) as any
  expect(validationMessage(input({valueMissing:true}))).toBe('此项不能为空。')
  expect(validationMessage(input({rangeOverflow:true}))).toContain('8')
  expect(validationMessage(input({rangeUnderflow:true}))).toContain('1')
  expect(validationMessage(input({tooLong:true}))).toContain('32')
  expect(validationMessage(input({badInput:true}))).toBe('请输入有效的内容。')
 })
})
