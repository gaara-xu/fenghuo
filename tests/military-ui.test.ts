import {afterEach,describe,expect,it,vi} from 'vitest'
import {h,nextTick} from 'vue'
import {clientComponent} from './vue-client'
import {content,renderClient} from './ui-renderer'
import * as military from '../shared/military'
import * as labels from '../shared/labels'
const Panel=clientComponent('web/MilitaryPanel.vue',{'../shared/military':military,'../shared/labels':labels,'./UnitBadge.vue':{render:()=>h('i')}})
const now=Date.parse('2026-09-29T00:00:00Z')
const order=(id:number,start=now,seconds=30,quantity=20):military.MilitaryOrder=>({id,code:'wall',name:'城墙',kind:'DEFENSE',quantity,completed:0,seconds,startGameAt:new Date(start).toISOString(),endGameAt:new Date(start+quantity*seconds*1000).toISOString()})
function mount(orders:military.MilitaryOrder[],gold=50){
 const speedup=vi.fn(),state:military.MilitaryState={ready:true,definitions:[],stock:{},orders,defense:{melee:1200,ranged:1600,heroes:[{heroId:1,name:'章邯',meleeDefense:800,rangedDefense:1000},{heroId:2,name:'神珊珊',meleeDefense:400,rangedDefense:600}]}}
 return {...renderClient(Panel,{state,kind:'DEFENSE',gameTime:now,wallet:{gold,food:0,wood:0,stone:0,iron:0,coupon:0},busy:false,onSpeedup:speedup}),speedup}
}
const buttons=(v:ReturnType<typeof mount>)=>v.all().filter(n=>n.type==='button'&&String(n.props.class).includes('speedup-button'))
afterEach(()=>vi.unstubAllGlobals())
describe('金币加速与驻城界面',()=>{
 it.each(['TROOP','DEFENSE'] as const)('%s单批最多1000，快捷选择受资源限制，超量不可提交',async kind=>{
  const onOrder=vi.fn(),d=military.militaryDefaults.find(d=>d.kind===kind)!,v=mount([])
  try{
   v.props.kind=kind;v.props.state.definitions=[d];v.props.wallet={gold:1e9,food:1e9,wood:1e9,stone:1e9,iron:1e9,coupon:0};v.props.onOrder=onOrder;await nextTick()
   const input=()=>v.all().find(n=>n.type==='input')!,submit=()=>v.all().find(n=>n.type==='button'&&String(n.props.class).includes('primary'))!
   expect(input().props.max).toBe(1000);v.find('button','最多1000')!.props.onClick();await nextTick();expect(input().props.value).toBe(1000)
   submit().props.onClick();expect(onOrder).toHaveBeenCalledWith(d.code,1000);onOrder.mockClear()
   input().props.onInput({target:{value:'1001'}});await nextTick();expect(submit().props.disabled).toBe(true);submit().props.onClick();expect(onOrder).not.toHaveBeenCalled()
   v.props.wallet.wood=(d.cost.wood??0)*7;await nextTick();v.find('button','最多1000')!.props.onClick();await nextTick();expect(input().props.value).toBe(7)
  }finally{v.app.unmount()}
 })
 it('点击直接按本单报价加速，不收等待时间，无系统选择框',()=>{
  const v=mount([order(1),order(2,now+86400000,30,5)])
  try{const [a,b]=buttons(v);expect(content(a)).toContain('2 金币');expect(content(b)).toContain('1 金币');b.props.onClick();expect(v.speedup).toHaveBeenCalledExactlyOnceWith(2,1);expect(v.all().some(n=>n.type==='select'||n.type==='dialog')).toBe(false)}finally{v.app.unmount()}
 })
 it('余额不足、请求忙碌、自然到期均禁止提交',async()=>{
  const v=mount([order(1)],1)
  try{
   const button=()=>buttons(v)[0];expect(button().props.disabled).toBe(true);button().props.onClick();expect(v.speedup).not.toHaveBeenCalled()
   v.props.wallet.gold=10;v.props.busy=true;await nextTick();expect(button().props.disabled).toBe(true);button().props.onClick();expect(v.speedup).not.toHaveBeenCalled()
   v.props.busy=false;await nextTick();expect(button().props.disabled).toBe(false)
   v.props.gameTime=now+600000;await nextTick();expect(content(button())).toContain('完成结算中');expect(button().props.disabled).toBe(true);button().props.onClick();expect(v.speedup).not.toHaveBeenCalled()
  }finally{v.app.unmount()}
 })
 it('展示全部留城武将及合计双防，不把概率技能预加到面板',()=>{
  const v=mount([])
  try{expect(content(v.root)).toContain('1,200');expect(content(v.root)).toContain('1,600');expect(content(v.byClass('home-heroes')!)).toContain('章邯');expect(content(v.byClass('home-heroes')!)).toContain('神珊珊');expect(content(v.root)).toContain('技能在迎敌时按概率发动')}finally{v.app.unmount()}
 })
})
