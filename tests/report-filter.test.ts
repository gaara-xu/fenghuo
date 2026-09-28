import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest'
import {nextTick} from 'vue'
import {clientComponent} from './vue-client'
import {content,renderClient} from './ui-renderer'
import type {BattleReport} from '../shared/contracts'
import * as labels from '../shared/labels'
import {useTimedNotice} from '../web/timed-notice'
const api=vi.fn(),confirm=vi.fn()
const Reports=clientComponent('web/QuietReports.vue',{'../shared/labels':labels,'./api':{api},'./game-dialog':{gameConfirm:confirm},'./timed-notice':{useTimedNotice}})
const report=(id:number,patch:Partial<BattleReport>={}):BattleReport=>({id,direction:'OUTGOING',title:'战报'+id,result:'VICTORY',reward:{gold:100,food:800},occurredGameAt:'2026-09-19T00:00:00Z',skillEvents:[],...patch})
const drop={itemId:10,name:'天赋水',quantity:1}
const initial=[report(4,{loot:[drop]}),report(3,{loot:[]}),report(2),report(1,{loot:[{...drop,quantity:0}]})]
const flush=async()=>{await nextTick();await Promise.resolve();await nextTick()}
type View=ReturnType<typeof renderClient>
const rows=(v:View)=>v.all().filter(n=>n.type==='details').map(n=>n.props['data-report-id'])
const button=(v:View,prefix:string)=>v.all().find(n=>n.type==='button'&&content(n).startsWith(prefix))!
beforeEach(()=>{api.mockReset();confirm.mockReset().mockResolvedValue(false)})
afterEach(()=>{vi.unstubAllGlobals()})
describe('战报掉落筛选',()=>{
 it('标题胜利后直接显示物品和数量，展开详情仍保留完整掉落与伤亡',()=>{
  const v=renderClient(Reports,{reports:[report(1,{loot:[{...drop,quantity:1200},{itemId:20,name:'精炼石',quantity:8},{itemId:30,name:'无效掉落',quantity:0}],troopLosses:[{code:'guard',name:'枪盾兵',sent:100,lost:10,remaining:90}]})],busy:false})
  try{expect(content(v.find('summary')!)).toContain('胜利 · 天赋水 ×1,200、精炼石 ×8');expect(content(v.find('summary')!)).not.toContain('无效掉落');expect(content(v.find('details')!)).toContain('获得 天赋水 ×1200');expect(v.byClass('casualty-table')).toBeDefined()}finally{v.app.unmount()}
 })
 it('默认仅显示实际获得物品的记录，资源收益与零数量不算物品掉落',()=>{
  const v=renderClient(Reports,{reports:structuredClone(initial),busy:false})
  try{expect(rows(v)).toEqual([4]);expect(button(v,'有物品掉落').props['aria-pressed']).toBe(true);expect(content(v.root)).toContain('显示 1 / 4 条');expect(v.props.reports).toHaveLength(4);expect(api).not.toHaveBeenCalled();expect(v.all().some(n=>n.type==='select')).toBe(false)}finally{v.app.unmount()}
 })
 it('切换全部再筛选不删除记录；切换回顶部，轮询不重置选择或已有战报节点',async()=>{
  const clear=vi.fn(),v=renderClient(Reports,{reports:structuredClone(initial),busy:false,onClear:clear})
  try{
   v.byClass('reports-list')!.scrollTop=100;button(v,'全部战报').props.onClick();await flush();expect(rows(v)).toEqual([4,3,2,1]);expect(v.byClass('reports-list')!.scrollTop).toBe(0)
   const retained=v.all().find(n=>n.props['data-report-id']===4);v.props.reports=[report(5),...structuredClone(initial)];await flush();expect(rows(v)).toEqual([5,4,3,2,1]);expect(v.all().find(n=>n.props['data-report-id']===4)).toBe(retained)
   button(v,'有物品掉落').props.onClick();await flush();v.props.reports=[report(6,{loot:[drop]}),report(5),...structuredClone(initial)];await flush();expect(rows(v)).toEqual([6,4]);expect(v.props.reports).toHaveLength(6);expect(clear).not.toHaveBeenCalled();expect(api).not.toHaveBeenCalled()
  }finally{v.app.unmount()}
 })
 it('无掉落提示切换全部；空战报显示空态且不能清空',async()=>{
  const v=renderClient(Reports,{reports:[report(1)],busy:false})
  try{expect(rows(v)).toEqual([]);expect(content(v.root)).toContain('暂无物品掉落战报');expect(button(v,'清空出征').props.disabled).toBeFalsy();button(v,'全部战报').props.onClick();await flush();expect(rows(v)).toEqual([1]);v.props.reports=[];await flush();expect(content(v.root)).toContain('暂无出征战报');expect(button(v,'清空出征').props.disabled).toBe(true);button(v,'清空出征').props.onClick();expect(confirm).not.toHaveBeenCalled()}finally{v.app.unmount()}
 })
 it('被攻击战报不受掉落筛选影响，分页继续可用，返回主动页仍按原筛选',async()=>{
  const v=renderClient(Reports,{reports:structuredClone(initial),incoming:{reports:[report(10,{direction:'INCOMING'})],total:2,nextCursor:10},busy:false})
  try{
   button(v,'被攻击').props.onClick();await flush();expect(rows(v)).toEqual([10]);expect(v.byClass('report-filters')).toBeUndefined()
   api.mockResolvedValueOnce({reports:[report(9,{direction:'INCOMING'})],total:2,nextCursor:null});button(v,'更早的被攻击记录').props.onClick();await flush();expect(api).toHaveBeenCalledExactlyOnceWith('/api/world/reports/incoming?beforeId=10');expect(rows(v)).toEqual([10,9])
   button(v,'主动出征').props.onClick();await flush();expect(rows(v)).toEqual([4]);expect(button(v,'有物品掉落').props['aria-pressed']).toBe(true)
  }finally{v.app.unmount()}
 })
 it('清空立即执行并包括隐藏记录，连点与忙碌期间不重复触发',async()=>{
  const clear=vi.fn(),v=renderClient(Reports,{reports:structuredClone(initial),busy:false,onClear:clear})
  try{expect(button(v,'清空出征').props['data-game-hint']).toContain('包括隐藏记录');button(v,'清空出征').props.onClick();button(v,'清空出征').props.onClick();await flush();expect(clear).toHaveBeenCalledOnce();expect(confirm).not.toHaveBeenCalled();v.props.busy=true;await flush();button(v,'清空出征').props.onClick();expect(clear).toHaveBeenCalledOnce();v.props.busy=false;await flush();button(v,'清空出征').props.onClick();expect(clear).toHaveBeenCalledTimes(2)}finally{v.app.unmount()}
 })
})
