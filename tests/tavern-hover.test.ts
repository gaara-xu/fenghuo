import {afterEach,describe,it,expect,vi} from 'vitest'
import {createRenderer,h,nextTick,ref,markRaw,toRaw} from 'vue'
import {clientComponent} from './vue-client'
import * as worldRules from '../shared/world-rules'
import * as labels from '../shared/labels'
import * as quality from '../shared/quality'
import * as items from '../shared/items'
import * as choices from '../web/item-choices'
import * as art from '../web/art'
import * as positioning from '../web/tooltip-position'
import {tooltipPosition} from '../web/tooltip-position'
import type {TavernRefreshResult} from '../shared/contracts'
const TavernCandidates=clientComponent('web/TavernCandidates.vue',{'../shared/world-rules':worldRules,'../shared/labels':labels,'../shared/quality':quality,'../shared/items':items,'./item-choices':choices,'./art':art,'./tooltip-position':positioning,'./AssetIcon.vue':{setup:()=>()=>h('span')},'./ItemGlyph.vue':{setup:()=>()=>h('svg')}})

// Exercise compiled Vue event handlers and Teleport without launching a browser or spending game resources.
type Element={type:string;text:string;props:Record<string,any>;children:Element[];parent:Element|null}
const element=(type:string,text=''):Element=>markRaw({type,text,props:{},children:[],parent:null})
function find(root:Element,predicate:(e:Element)=>boolean):Element|undefined{
  if(predicate(root))return root
  for(const child of root.children){const found=find(child,predicate);if(found)return found}
}
function text(root:Element):string{return root.text+root.children.map(text).join('')}
const initial:TavernRefreshResult={refreshId:1,pool:{id:3,code:'treasure_standard',name:'藏宝阁',poolType:'ITEM',currencyCode:'gold',refreshCost:8000,candidateCount:3,selectLimit:1,enabled:true},remainingCurrency:0,createdAt:'2026-09-17',candidates:[{id:1,slotNo:1,rewardType:'ITEM',name:'虎符',rarity:6,recruited:false,item:{id:10,code:'test',name:'虎符',itemType:'TREASURE',rarity:6,qualityTier:7,enabled:true,description:'号令千军。',effectConfig:{requiredStrength:30,bonuses:{meleeAttack:20},setBonuses:[{count:2,bonuses:{speed:5}}]}}}]}
function mount(){
  const root=element('root'),body=element('body'),listeners=new Map<string,Set<(e:any)=>void>>()
  vi.stubGlobal('window',{innerWidth:1000,innerHeight:700,addEventListener:(event:string,fn:any)=>{if(!listeners.has(event))listeners.set(event,new Set());listeners.get(event)!.add(fn)},removeEventListener:(event:string,fn:any)=>listeners.get(event)?.delete(fn)})
  const renderer=createRenderer<Element,Element>({
    createElement:type=>element(type),createText:t=>element('#text',t),createComment:t=>element('#comment',t),
    setText:(node,t)=>{node.text=t},setElementText:(node,t)=>{node.text=t;node.children=[]},
    parentNode:node=>node.parent,nextSibling:node=>node.parent?.children[node.parent.children.indexOf(node)+1]??null,
    insert:(node,parent,anchor)=>{if(node.parent)node.parent.children.splice(node.parent.children.indexOf(node),1);node.parent=parent;const index=anchor?parent.children.indexOf(anchor):-1;parent.children.splice(index<0?parent.children.length:index,0,node)},
    remove:node=>{if(node.parent)node.parent.children.splice(node.parent.children.indexOf(node),1);node.parent=null},
    patchProp:(node,key,_old,value)=>{node.props[key]=value},querySelector:selector=>selector==='body'?body:null,
  })
  const result=ref(structuredClone(initial)),claim=vi.fn(),app=renderer.createApp({setup:()=>()=>h(TavernCandidates,{result:result.value,heroes:[],skills:[],busy:false,heroCount:6,onClaim:claim})})
  app.mount(root)
  const card=()=>find(root,n=>n.props.class==='tavern-art-target')!,tip=()=>find(body,n=>n.props.role==='tooltip')
  const event={currentTarget:{getBoundingClientRect:()=>({left:400,right:650,top:80})}}
  const dispatch=(name:string,event:any)=>listeners.get(name)?.forEach(fn=>fn(event))
  return {root,body,result,claim,app,card,tip,event,dispatch,listeners}
}
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals()})
describe('酒馆物品悬停详情',()=>{
  it('悬停保留品质颜色、说明、属性和套装，去掉品质文案，不触发领取',async()=>{
    const view=mount()
    try{
      expect(view.tip()).toBeUndefined();view.card().props.onMouseenter(view.event);await nextTick()
      const tip=view.tip()!;expect(tip).toBeDefined();expect(tip.props.class).toContain('quality-7')
      for(const line of ['虎符','宝物','号令千军。','实力要求：30','近攻 +20%','套装 2 件：速度 +5%'])expect(text(tip)).toContain(line)
      expect(text(tip)).not.toContain('品质');expect(text(view.root)).not.toContain('品质')
      expect(view.card().props['aria-describedby']).toBe(tip.props.id);expect(view.claim).not.toHaveBeenCalled()
      view.result.value=structuredClone(toRaw(view.result.value));await nextTick();expect(view.tip()).toBeDefined()
    }finally{view.app.unmount()}
  })
  it('只在图标上滚动详情，离开立即收起；页面滚动和切换轮次清除浮层',async()=>{
    vi.useFakeTimers();const view=mount()
    try{
      view.card().props.onMouseenter(view.event);await nextTick()
      const panel=view.tip()! as any;panel.scrollTop=0;expect(panel.props.onMouseenter).toBeUndefined();expect(panel.props.tabindex).toBeUndefined()
      const preventDefault=vi.fn();view.card().props.onWheel({deltaY:120,preventDefault});expect(panel.scrollTop).toBe(120);expect(preventDefault).toHaveBeenCalledOnce()
      view.dispatch('scroll',{target:view.tip()});await nextTick();expect(view.tip()).toBeDefined()
      view.card().props.onMouseleave();await nextTick();expect(view.tip()).toBeUndefined();expect(vi.getTimerCount()).toBe(0)
      view.card().props.onMouseenter(view.event);await nextTick();view.dispatch('scroll',{target:{}});await nextTick();expect(view.tip()).toBeUndefined()
      view.card().props.onMouseenter(view.event);await nextTick();view.result.value={...view.result.value,refreshId:2};await nextTick();expect(view.tip()).toBeUndefined()
    }finally{view.app.unmount()}
  })
  it('键盘聚焦也能查看，Esc关闭，卸载清理计时器与全局监听',async()=>{
    vi.useFakeTimers();const view=mount()
    try{
      expect(view.card().props.tabindex).toBe(0);view.card().props.onFocusin(view.event);await nextTick();expect(view.tip()).toBeDefined()
      view.dispatch('keydown',{key:'Escape'});await nextTick();expect(view.tip()).toBeUndefined()
      view.card().props.onMouseleave()
    }finally{view.app.unmount()}
    expect([...view.listeners.values()].every(set=>set.size===0)).toBe(true);expect(vi.getTimerCount()).toBe(0)
  })
  it('窄窗口、屏幕右侧及底部浮层不越界',()=>{
    expect(tooltipPosition({left:400,right:650,top:80},{width:1000,height:700})).toEqual({left:'662px',top:'80px'})
    expect(tooltipPosition({left:700,right:950,top:600},{width:1000,height:700})).toEqual({left:'368px',top:'342px'})
    expect(tooltipPosition({left:0,right:280,top:600},{width:300,height:250})).toEqual({left:'8px',top:'8px'})
  })
})
