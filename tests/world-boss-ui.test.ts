import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest'
import {h,nextTick} from 'vue'
import {readFileSync} from 'node:fs'
import {clientComponent} from './vue-client'
import * as bossRules from '../shared/world-boss'
import {content,nodes,renderClient} from './ui-renderer'
import * as rules from '../shared/world-boss'
import * as labels from '../shared/labels'
import * as positioning from '../web/tooltip-position'
import {useTimedNotice} from '../web/timed-notice'
const api=vi.fn()
const Settings=clientComponent('web/WorldBossSettings.vue',{'./api':{api},'./timed-notice':{useTimedNotice},'../shared/world-boss':rules})
const Map=clientComponent('web/WorldMap.vue',{'../shared/world-boss':bossRules,'../shared/labels':labels,'./AssetIcon.vue':{setup:()=>()=>h('span')},'./MapSprite.vue':{setup:()=>()=>h('canvas')},'./tooltip-position':positioning})
const flush=async()=>{await Promise.resolve();await nextTick();await Promise.resolve();await nextTick()}
beforeEach(()=>api.mockReset().mockResolvedValue(structuredClone(rules.defaultWorldBossRules)))
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals()})
describe('世界首领界面',()=>{
 it('地图红色标记和独立筛选；悬停说明离开即关，点击与右键均可调兵',async()=>{
  const boss={id:1,name:'世界首领·乱世魔将',level:200,nodeType:'WILD',worldBoss:true,x:20,y:30,rewardHint:'豪华掉落'},wild={...boss,id:2,name:'野地',level:3,worldBoss:false},select=vi.fn(),v=renderClient(Map,{nodes:[boss,wild],world:null,gameTime:0,onSelect:select})
  try{
   expect(v.byClass('world-boss')).toBeDefined();v.find('button','世界首领')!.props.onClick();await flush();expect(v.all().filter(n=>String(n.props.class).includes('original-node'))).toHaveLength(1)
   const button=v.byClass('world-boss')!;button.props.onMouseenter({currentTarget:{getBoundingClientRect:()=>({left:20,right:80,top:40})}});await flush();expect(content(nodes(v.body).find(n=>n.props.role==='tooltip')!)).toContain('战败不降级')
   button.props.onMouseleave();await flush();expect(nodes(v.body).some(n=>n.props.role==='tooltip')).toBe(false)
   button.props.onClick({detail:1});button.props.onContextmenu({preventDefault:vi.fn()});expect(select).toHaveBeenCalledTimes(2);expect(select).toHaveBeenLastCalledWith(boss)
   v.find('button','野地')!.props.onClick();await flush();expect(v.byClass('world-boss')).toBeUndefined();expect(v.byClass('original-node')).toBeDefined()
  }finally{v.app.unmount()}
  const app=readFileSync('web/App.vue','utf8');expect(app).toContain('v-if="!selectedNode.worldBoss"');expect(app).toContain('if(!selectedNode.value||selectedNode.value.worldBoss)return')
 })
 it('后台游戏按钮切换、概率与数量保存，连点只提交一次；提示一秒后清除',async()=>{
  vi.useFakeTimers();const v=renderClient(Settings,{})
  try{
   await flush();expect(v.all().some(n=>n.type==='select')).toBe(false);expect(content(v.root)).toContain('刷新据点、野地或全部目标时额外抽取');expect(content(v.root)).toContain('宝石仅含各类一级宝石')
   const toggle=v.all().find(n=>n.props.role==='switch')!;toggle.props.onClick();await flush();expect(toggle.props['aria-checked']).toBe(false)
   v.all().find(n=>n.props['aria-label']==='世界首领出现概率')!.props['onUpdate:modelValue'](50)
   v.all().find(n=>n.props['aria-label']==='世界首领等级')!.props['onUpdate:modelValue'](80)
   v.all().find(n=>n.props['aria-label']==='世界首领近防')!.props['onUpdate:modelValue'](123456)
   v.all().find(n=>n.props['aria-label']==='世界首领远防')!.props['onUpdate:modelValue'](987654)
   v.all().find(n=>n.props['aria-label']==='宝石数量上限')!.props['onUpdate:modelValue'](5000);await flush()
   const submit=v.find('form')!.props.onSubmit,event={preventDefault:vi.fn()};submit(event);submit(event);await flush()
   expect(api).toHaveBeenCalledTimes(2);const payload=JSON.parse(api.mock.calls[1][1].body);expect(payload.enabled).toBe(false);expect(payload.spawnChance).toBe(.5);expect(payload.quantities.GEM.max).toBe(5000)
   expect(payload).toMatchObject({level:80,meleeDefense:123456,rangedDefense:987654})
   expect(content(v.root)).toContain('规则已保存');await vi.advanceTimersByTimeAsync(1000);expect(content(v.root)).not.toContain('规则已保存')
  }finally{v.app.unmount()}
 })
 it('后台读取失败不显示可提交表单，支持重新读取',async()=>{
  api.mockRejectedValueOnce(Error('连接失败'));const v=renderClient(Settings,{})
  try{await flush();expect(v.find('form')).toBeUndefined();v.find('button','重新读取')!.props.onClick();await flush();expect(v.find('form')).toBeDefined()}finally{v.app.unmount()}
 })
 it('地图显示首领倒计时，到点立即移除目标及悬停框，旧点击不再派遣',async()=>{
  const boss={id:1,name:'限时首领',level:80,nodeType:'WILD',worldBoss:true,x:20,y:30,rewardHint:'豪华掉落',expiresGameAt:new Date(300000).toISOString()},select=vi.fn(),v=renderClient(Map,{nodes:[boss],world:null,gameTime:0,onSelect:select})
  try{
   expect(content(v.root)).toContain('消失 5:00');v.props.gameTime=299000;await flush();expect(content(v.root)).toContain('消失 0:01')
   const button=v.byClass('world-boss')!;button.props.onMouseenter({currentTarget:{getBoundingClientRect:()=>({left:20,right:80,top:40})}});await flush();expect(content(v.body)).toContain('剩余 0:01')
   v.props.gameTime=300000;await flush();expect(v.byClass('world-boss')).toBeUndefined();expect(nodes(v.body).some(n=>n.props.role==='tooltip')).toBe(false)
   button.props.onClick({detail:1});expect(select).not.toHaveBeenCalled()
  }finally{v.app.unmount()}
 })
})
