import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import {nextTick} from 'vue'
import {clientComponent} from './vue-client'
import {renderClient,content} from './ui-renderer'
import * as raids from '../shared/incoming-raids'
import * as boss from '../shared/world-boss'
import * as labels from '../shared/labels'
import {useTimedNotice} from '../web/timed-notice'
const api=vi.fn(),Settings=clientComponent('web/IncomingArmySettings.vue',{'./api':{api},'./timed-notice':{useTimedNotice},'../shared/world-boss':boss})
const Incoming=clientComponent('web/IncomingArmies.vue',{'../shared/incoming-raids':raids,'../shared/labels':labels})
const flush=async()=>{await Promise.resolve();await nextTick();await Promise.resolve();await nextTick()}
beforeEach(()=>api.mockReset().mockResolvedValue(structuredClone(raids.defaultIncomingRaidRules)))
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals()})
describe('来袭军队界面',()=>{
 it('后台只编辑规则，不触发生成；无下拉框，保存防重并一秒清除提示',async()=>{
  vi.useFakeTimers();const v=renderClient(Settings,{})
  try{await flush();expect(api).toHaveBeenCalledExactlyOnceWith('/api/admin/incoming-army');expect(content(v.root)).toContain('不内置定时调度');expect(v.all().some(n=>n.type==='select')).toBe(false)
   const set=(label:string,value:number)=>v.all().find(n=>n.props['aria-label']===label)!.props['onUpdate:modelValue'](value)
   set('来袭攻击下限',2000);set('来袭攻击上限',4000);set('防守物品掉率',80);set('防守宝石数量上限',500);v.all().find(n=>n.props.role==='switch')!.props.onClick();await flush()
   const submit=v.find('form')!.props.onSubmit;submit({preventDefault:vi.fn()});submit({preventDefault:vi.fn()});await flush()
   expect(api).toHaveBeenCalledTimes(2);expect(JSON.parse(api.mock.calls[1][1].body)).toMatchObject({enabled:false,attackMin:2000,attackMax:4000,itemChance:.8,quantities:{GEM:{max:500}}})
   expect(api.mock.calls.some(c=>String(c[0]).endsWith('/run'))).toBe(false);expect(content(v.root)).toContain('来袭军队规则已保存');await vi.advanceTimersByTimeAsync(1000);expect(content(v.root)).not.toContain('来袭军队规则已保存')
  }finally{v.app.unmount()}
 })
 it('读取失败可重试，不能提交未知默认值',async()=>{
  api.mockRejectedValueOnce(Error('连接失败'));const v=renderClient(Settings,{})
  try{await flush();expect(v.find('form')).toBeUndefined();v.find('button','重新读取')!.props.onClick();await flush();expect(v.find('form')).toBeDefined()}finally{v.app.unmount()}
 })
 it('全局军情倒计时随游戏时钟推进，到达显示交战而不是自动生成新军队',async()=>{
  const v=renderClient(Incoming,{gameTime:0,armies:[{id:1,name:'流寇',attackPower:1000,troopCount:10,attackType:'MELEE',arriveGameAt:new Date(300000).toISOString()}]})
  try{expect(content(v.root)).toContain('5分00秒');v.props.gameTime=300000;await flush();expect(content(v.root)).toContain('正在交战');expect(api).not.toHaveBeenCalled();v.props.armies=[];await flush();expect(v.byClass('incoming-armies')).toBeUndefined()}finally{v.app.unmount()}
 })
})
