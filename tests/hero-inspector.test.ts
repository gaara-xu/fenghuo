import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {h,nextTick,toRaw} from 'vue'
import {readFileSync} from 'node:fs'
import {clientComponent} from './vue-client'
import {content,nodes,renderClient} from './ui-renderer'
import * as labels from '../shared/labels'
import * as growth from '../shared/hero-growth'
import * as items from '../shared/items'
import * as inventory from '../shared/inventory'
import * as quality from '../shared/quality'
import * as gems from '../shared/gems'
import * as skills from '../server/domain/skills'
import * as choices from '../web/item-choices'
import * as art from '../web/art'
import {officialItems} from '../shared/official-catalog'

const notice=vi.fn(),prompt=vi.fn(),actionId=()=> '00000000-0000-4000-8000-000000000002'
const Icon={setup:()=>()=>h('span')}
const Picker={props:['options','disabled'],emits:['update:modelValue','activate'],setup(p:any,{emit}:any){return()=>h('section',{class:'test-picker'},p.options.map((o:any)=>h('button',{disabled:p.disabled,onClick:()=>!p.disabled&&emit('update:modelValue',o.id)},o.name)))}}
const Armory={props:['slot'],setup(p:any){return()=>h('section',{'data-equipment-slot':p.slot},'装备操作')}}
const Roster=clientComponent('web/HeroRoster.vue',{'../shared/labels':labels,'../shared/hero-growth':growth,'../shared/items':items,'../server/domain/skills':skills,'./api':{actionId},'./AssetIcon.vue':Icon,'./IconInventoryPicker.vue':Picker,'./EquipmentWorkbench.vue':Armory,'./item-choices':choices,'./game-dialog':{gameNotice:notice,gamePrompt:prompt}})
const Modal={props:['title'],setup(p:any,{slots}:any){return()=>h('section',{role:'dialog'},[h('h2',p.title),slots.default?.(),slots.footer?.()])}}
const UseItem=clientComponent('web/HeroItemUse.vue',{'../shared/labels':labels,'./api':{actionId},'./GameModal.vue':Modal,'./AssetIcon.vue':Icon})
const Bag=clientComponent('web/InventoryBag.vue',{'../shared/items':items,'../shared/inventory':inventory,'../shared/quality':quality,'../shared/gems':gems,'../shared/hero-growth':growth,'./art':art})
const stats={meleeAttack:500,rangedAttack:0,meleeDefense:800,rangedDefense:750,speed:1000,loadCapacity:2000}
const hero=(id=1,talentGrade='GOOD')=>({id,name:id===1?'神珊珊':'章邯',originalName:'原始英雄名',heroDefinitionId:id,star:6,level:16,talentGrade,stamina:120,qualityTier:7,stats:{...stats},nextStats:{...stats,meleeAttack:550},upgradeExp:100,experience:1000,busy:false,equipment:[],unlockedSlots:4,skills:[{slotNo:1,skillDefinitionId:1,name:'热血',level:1,maxLevel:10,mode:'ATTACK',description:'提高近攻',triggerRate:.2,effectValue:15,nextTriggerRate:.3,nextEffectValue:20,upgradeExp:100,sameBookCost:1}]})
const water:items.InventoryEntry={item:{id:30,code:'talent_water',name:'天赋水',itemType:'CONSUMABLE',enabled:true,rarity:3,description:'重洗英雄天赋',effectConfig:{kind:'TALENT',talentWeights:{MEDIOCRE:10,COMMON:20,GOOD:30,EXCELLENT:25,PERFECT:15}}},quantity:2}
const renameCard:items.InventoryEntry={item:{...water.item,id:32,code:'rename_card',name:'改名卡',effectConfig:{kind:'RENAME'}},quantity:2}
const world=()=>({ownedHeroes:[hero(),hero(2)],inventory:structuredClone([water,renameCard]),skillBooks:[{skillDefinitionId:1,quantity:2}],marches:[],autoFarmJobs:[],reports:[],defenses:[],incoming:[]})
const flush=async()=>{await nextTick();await Promise.resolve();await nextTick()}
type View=ReturnType<typeof renderClient>
const byLabel=(v:View,label:string)=>v.all().find(n=>n.type==='button'&&n.props['aria-label']===label)!
const talent=(v:View)=>byLabel(v,'使用天赋水，当前天赋良好')
const mountRoster=()=>{const command=vi.fn(),useItem=vi.fn();return {...renderClient(Roster,{world:world(),skills:[],busy:false,onCommand:command,onUseItem:useItem}),command,useItem}}
beforeEach(()=>{vi.stubGlobal('sessionStorage',{getItem:()=>null,setItem:vi.fn()});notice.mockReset();prompt.mockReset().mockResolvedValue(null)})
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers()})

describe('英雄右侧操作面板',()=>{
 it.each([['流放','EXILE'],['斩首','EXECUTE']])('%s直接执行，不要求输入名字，连点防重',async(button,reason)=>{
  const v=mountRoster()
  try{const b=v.find('button',button)!;b.props.onClick();b.props.onClick();await flush();expect(v.command).toHaveBeenCalledExactlyOnceWith('/api/heroes/1/retire',{reason,confirmName:'神珊珊'});expect(prompt).not.toHaveBeenCalled()}finally{v.app.unmount()}
 })
 it('替换已有技能直接提交，保留书本校验与防重',async()=>{
  const v=mountRoster()
  try{
   v.props.skills=[{id:2,name:'狂热',enabled:true,description:'提高攻击',qualityTier:6}];v.props.world.skillBooks.push({skillDefinitionId:2,quantity:1})
   byLabel(v,'技能槽1').props.onClick();await flush();v.find('button','狂热')!.props.onClick();await flush()
   const b=v.find('button','替换技能')!;b.props.onClick();b.props.onClick();await flush();expect(v.command).toHaveBeenCalledExactlyOnceWith('/api/heroes/1/skills/learn',{slot:1,skillId:2});expect(prompt).not.toHaveBeenCalled()
  }finally{v.app.unmount()}
 })
 it('穿戴实例实际显示+9，套装彩色与灰色状态随换装更新，侧栏显示装备总加成',async()=>{
  const v=mountRoster()
  try{
   const pieces=officialItems.slice(0,8).map((item,n)=>({heroId:1,slot:item.effectConfig.slot!,item:{...item,id:n+101},gear:{instanceId:n+201,refineLevel:n===0?9:0,sockets:0,gems:[]}}))
   v.props.world.ownedHeroes[0].equipment=pieces.slice(0,3);await flush()
   expect(content(byLabel(v,'头盔'))).toContain('+9');expect(content(v.byClass('hero-inspector')!)).toContain('当前装备加成')
   expect(v.all().filter(n=>String(n.props.class??'').includes('set-active'))).toHaveLength(1)
   expect(v.all().filter(n=>String(n.props.class??'').includes('set-inactive'))).toHaveLength(3)
   let tiers=JSON.parse(byLabel(v,'头盔').props['data-game-set-hint']);expect(tiers.filter((t:any)=>t.active)).toHaveLength(1);expect(tiers[0].text).toContain('已生效')
   v.props.world.ownedHeroes[0].equipment=pieces;await flush();tiers=JSON.parse(byLabel(v,'头盔').props['data-game-set-hint']);expect(tiers[0].text).toContain('高档已替代');expect(tiers[2].active).toBe(true)
   v.props.world.ownedHeroes[0].equipment=[...pieces.filter(e=>e.slot!=='ARMOR'),{...pieces[7],slot:'RING_2',gear:{...pieces[7].gear,instanceId:300}}];await flush();tiers=JSON.parse(byLabel(v,'头盔').props['data-game-set-hint']);expect(tiers[2].active).toBe(true)
   v.props.world.ownedHeroes[0].equipment=[...pieces,{...pieces[6],slot:'BRACELET_2',gear:{...pieces[6].gear,instanceId:301}},{...pieces[7],slot:'RING_2',gear:{...pieces[7].gear,instanceId:302}}];await flush();tiers=JSON.parse(byLabel(v,'头盔').props['data-game-set-hint']);expect(tiers.filter((t:any)=>t.active)).toHaveLength(1);expect(tiers[3]).toMatchObject({active:true});expect(tiers[3].text).toContain('+25%');expect(tiers[2].active).toBe(false)
   v.props.world.ownedHeroes[0].equipment=pieces.slice(0,2);await flush();expect(v.all().filter(n=>String(n.props.class??'').includes('set-active'))).toHaveLength(0);expect(v.all().filter(n=>String(n.props.class??'').includes('set-inactive'))).toHaveLength(4)
  }finally{v.app.unmount()}
 })
 it('默认属性与装备，去掉改名提示和原名，装备与技能操作只在右侧切换',async()=>{
  const v=mountRoster()
  try{
   expect(content(v.byClass('hero-inspector')!)).toContain('属性与装备');expect(content(v.root)).not.toContain('点击名字更名');expect(content(v.root)).not.toContain('原始英雄名');expect(v.byClass('hero-detail-pane')).toBeUndefined()
   expect(v.all().filter(n=>n.type==='button'&&content(n)==='天赋与道具')).toHaveLength(0)
   byLabel(v,'头盔').props.onClick();await flush();expect(nodes(v.byClass('hero-inspector')!).some(n=>n.props['data-equipment-slot']==='HELMET')).toBe(true)
   v.props.world=structuredClone(toRaw(v.props.world));await flush();expect(content(v.byClass('hero-inspector')!)).toContain('装备操作')
   byLabel(v,'技能槽1').props.onClick();await flush();expect(nodes(v.byClass('hero-inspector')!).some(n=>n.props['aria-label']==='技能操作')).toBe(true)
   const upgrade=v.all().find(n=>n.type==='button'&&content(n).startsWith('升级技能'))!;expect(upgrade.props.disabled).toBeFalsy();upgrade.props.onClick();expect(v.command).toHaveBeenCalledExactlyOnceWith('/api/heroes/1/skills/upgrade',{slot:1})
   byLabel(v,'查看英雄属性与天赋').props.onClick();await flush();expect(v.byClass('hero-overview')).toBeDefined()
   byLabel(v,'头盔').props.onClick();await flush();v.all().find(n=>n.props.class==='hero-list-item'&&content(n).includes('章邯'))!.props.onClick();await flush();expect(v.byClass('hero-overview')).toBeDefined()
  }finally{v.app.unmount()}
 })
 it('点击名字仍消耗改名卡走自制窗口，取消不提交',async()=>{
  const v=mountRoster()
  try{byLabel(v,'使用改名卡修改英雄名字').props.onClick();await flush();expect(prompt).toHaveBeenCalledOnce();expect(v.command).not.toHaveBeenCalled();prompt.mockResolvedValueOnce('新的名字');byLabel(v,'使用改名卡修改英雄名字').props.onClick();await flush();expect(v.command).toHaveBeenCalledExactlyOnceWith('/api/heroes/1/rename',{name:'新的名字',clientActionId:actionId()})}finally{v.app.unmount()}
 })
 it('良好天赋单击直接使用天赋水，连点只提交一次，处理后可继续',async()=>{
  const v=mountRoster()
  try{
   talent(v).props.onClick();talent(v).props.onClick();await flush();expect(prompt).not.toHaveBeenCalled();expect(v.command).toHaveBeenCalledExactlyOnceWith('/api/heroes/1/items/use',{itemId:30,clientActionId:actionId()})
   v.props.busy=true;await flush();v.props.busy=false;await flush();talent(v).props.onClick();expect(v.command).toHaveBeenCalledTimes(2)
  }finally{v.app.unmount()}
 })
 it('随身经验书点击直接使用，不弹选择或确认窗口',async()=>{
  const v=mountRoster()
  try{
   v.props.world.inventory.push({item:{...water.item,id:40,name:'经验书',effectConfig:{kind:'EXPERIENCE',amount:1000}},quantity:2});await flush()
   const b=v.find('button','经验书')!;b.props.onClick();b.props.onClick();await flush();expect(v.command).toHaveBeenCalledExactlyOnceWith('/api/heroes/1/items/use',{itemId:40,clientActionId:actionId()});expect(v.useItem).not.toHaveBeenCalled();expect(prompt).not.toHaveBeenCalled()
  }finally{v.app.unmount()}
 })
 it('完美天赋是纯文字，但随身道具仍允许主动重洗；缺水与出征均不提交',async()=>{
  const v=mountRoster()
  try{
   v.props.world.ownedHeroes[0].talentGrade='PERFECT';await flush();expect(v.all().filter(n=>String(n.props['aria-label']??'').startsWith('使用天赋水'))).toHaveLength(0);expect(v.byClass('perfect')?.props.onClick).toBeUndefined()
   v.find('button','天赋水')!.props.onClick();expect(v.command).toHaveBeenCalledExactlyOnceWith('/api/heroes/1/items/use',{itemId:30,clientActionId:actionId()});expect(prompt).not.toHaveBeenCalled()
   v.props.busy=true;await flush();v.props.busy=false;await flush();v.command.mockClear()
   v.props.world.ownedHeroes[0].talentGrade='GOOD';v.props.world.inventory=[];await flush();talent(v).props.onClick();await flush();expect(notice).toHaveBeenCalledWith(expect.stringContaining('缺少天赋水'));expect(v.command).not.toHaveBeenCalled()
   v.props.world.ownedHeroes[0].busy=true;await flush();expect(talent(v).props.disabled).toBe(true);talent(v).props.onClick();await flush();expect(notice).toHaveBeenCalledOnce();expect(v.command).not.toHaveBeenCalled()
  }finally{v.app.unmount()}
 })
})

describe('从包裹主动使用道具',()=>{
 it('各品质物品说明不显示颜色品质文案，保留类别、数量与品质边框',async()=>{
  const v=renderClient(Bag,{inventory:structuredClone([water]),skills:[]}),event={currentTarget:{getBoundingClientRect:()=>({left:20,right:80,top:50})}}
  try{
   v.all().find(n=>n.type==='button'&&content(n).startsWith('消耗品'))!.props.onClick();await flush()
   for(let tier=1;tier<=7;tier++){
    v.props.inventory[0].item.qualityTier=tier;await flush();byLabel(v,'天赋水，数量2').props.onMouseenter(event);await flush()
    const tip=nodes(v.body).find(n=>n.props.role==='tooltip')!;expect(content(tip)).not.toContain('品质');expect(content(tip)).toContain('消耗道具 · 数量 2');expect(tip.props.class).toContain('quality-'+tier)
    byLabel(v,'天赋水，数量2').props.onMouseleave();await flush();expect(nodes(v.body).some(n=>n.props.role==='tooltip')).toBe(false)
   }
  }finally{v.app.unmount()}
 })
 it('可主动重洗完美天赋，明确警示，连点只提交一次',async()=>{
  const use=vi.fn(),v=renderClient(UseItem,{entry:structuredClone(water),heroes:[hero(1,'PERFECT'),hero(2)],initialHeroId:1,busy:false,onUse:use})
  try{
   expect(content(v.root)).toContain('当前已是完美天赋');const button=v.all().find(n=>n.type==='button'&&content(n).includes('神珊珊'))!;expect(button.props.disabled).toBeFalsy();button.props.onClick();button.props.onClick();await flush();expect(use).toHaveBeenCalledExactlyOnceWith({heroId:1,itemId:30,clientActionId:actionId()});expect(button.props.disabled).toBe(true);expect(v.find('button','使用天赋水')).toBeUndefined()
   v.props.busy=true;await flush();v.props.busy=false;v.props.error='使用失败，请重试';await flush();expect(button.props.disabled).toBe(false);expect(content(v.root)).toContain('使用失败，请重试')
  }finally{v.app.unmount()}
 })
 it('取消不使用，出征英雄不能选，空库存、下架或没有英雄均禁用',async()=>{
  const use=vi.fn(),close=vi.fn(),v=renderClient(UseItem,{entry:structuredClone(water),heroes:[hero(),{...hero(2),busy:true}],busy:false,onUse:use,onClose:close})
  try{
   v.find('button','返回')!.props.onClick();expect(close).toHaveBeenCalledOnce();expect(use).not.toHaveBeenCalled()
   const marching=v.all().find(n=>n.type==='button'&&content(n).includes('章邯'))!;expect(marching.props.disabled).toBe(true);marching.props.onClick();await flush();expect(marching.props['aria-pressed']).toBe(false)
   const choose=v.all().find(n=>n.type==='button'&&content(n).includes('神珊珊'))!
   v.props.entry.quantity=0;await flush();expect(choose.props.disabled).toBe(true);choose.props.onClick();expect(use).not.toHaveBeenCalled()
   v.props.entry.quantity=2;v.props.entry.item.enabled=false;await flush();expect(choose.props.disabled).toBe(true)
   v.props.entry.item.enabled=true;v.props.heroes=[];await flush();expect(v.all().filter(n=>n.type==='button')).toHaveLength(1);expect(content(v.root)).toContain('还没有英雄')
  }finally{v.app.unmount()}
 })
 it('包裹悬停离开即关，点击可用天赋水发出使用请求，停用道具不可用',async()=>{
  const useItem=vi.fn(),v=renderClient(Bag,{inventory:structuredClone([water]),skills:[],onUseItem:useItem}),event={currentTarget:{getBoundingClientRect:()=>({left:20,right:80,top:50})}}
  try{
   v.all().find(n=>n.type==='button'&&content(n).startsWith('消耗品'))!.props.onClick();await flush();const icon=()=>byLabel(v,'天赋水，数量2'),tip=()=>nodes(v.body).find(n=>n.props.role==='tooltip')
   icon().props.onMouseenter(event);await flush();expect(content(tip()!)).toContain('重洗英雄天赋');expect(tip()!.props.onMouseenter).toBeUndefined();icon().props.onMouseleave();await flush();expect(tip()).toBeUndefined()
   icon().props.onClick(event);await flush();expect(useItem).toHaveBeenCalledExactlyOnceWith(30);expect(tip()).toBeUndefined()
   v.props.inventory[0].item.enabled=false;await flush();icon().props.onClick(event);await flush();expect(useItem).toHaveBeenCalledOnce();expect(content(tip()!)).toContain('已停用')
  }finally{v.app.unmount()}
 })
 it('所有物品浮层不接收鼠标、不依赖延时，藏宝阁也没有常驻详情',()=>{
  for(const file of ['GameHints.vue','IconInventoryPicker.vue','InventoryBag.vue','TavernCandidates.vue']){
   const source=readFileSync('web/'+file,'utf8');expect(source).not.toMatch(/setTimeout|deferClose|cancelClose/);expect(source).not.toMatch(/@mouseenter="(?:keep|cancelClose)/)
  }
  expect(readFileSync('web/inventory.css','utf8')).toContain('.bag-tooltip{pointer-events:none}')
  expect(readFileSync('web/Treasury.vue','utf8')).toContain(':preview="false"')
 })
})
