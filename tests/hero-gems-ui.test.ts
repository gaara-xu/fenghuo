import {afterEach,describe,expect,it,vi} from 'vitest'
import {h,nextTick,createSSRApp} from 'vue'
import {renderToString} from '@vue/server-renderer'
import {readFileSync} from 'node:fs'
import {clientComponent} from './vue-client'
import * as bossRules from '../shared/world-boss'
import * as mapRoutes from '../shared/map-routes'
import {content,renderClient} from './ui-renderer'
import * as gems from '../shared/gems'
import * as labels from '../shared/labels'
import * as choices from '../web/item-choices'
import * as positioning from '../web/tooltip-position'
import {equipmentFlatBonuses,type ItemDefinition} from '../shared/items'
import {itemSchema} from '../server/routes/item-schema'
import {activeDialog,finishDialog,gamePrompt} from '../web/game-dialog'
import GameModal from '../web/GameModal.vue'
const confirm=vi.fn(),actionId=()=> '00000000-0000-4000-8000-000000000001'
const Picker={props:['options','modelValue'],emits:['update:modelValue'],setup(p:any,{emit}:any){return()=>h('div',p.options.map((o:any)=>h('button',{onClick:()=>emit('update:modelValue',o.id)},o.name)))}}
const Workshop=clientComponent('web/GemWorkshop.vue',{'../shared/gems':gems,'./item-choices':choices,'./IconInventoryPicker.vue':Picker,'./game-dialog':{gameConfirm:confirm},'./api':{actionId}})
const Map=clientComponent('web/WorldMap.vue',{'../shared/map-routes':mapRoutes,'../shared/world-boss':bossRules,'../shared/labels':labels,'./AssetIcon.vue':{setup:()=>()=>h('span')},'./MapSprite.vue':{setup:()=>()=>h('canvas')},'./tooltip-position':positioning})
const flush=async()=>{await nextTick();await Promise.resolve();await nextTick()}
afterEach(()=>{while(activeDialog.value)finishDialog(activeDialog.value.id,null);vi.unstubAllGlobals();confirm.mockReset()})
describe('原版宝石目录与属性',()=>{
 it('五系各八级，40张原图均为GIF，无估算占位图',()=>{
  expect(gems.originalGems).toHaveLength(40);expect(new Set(gems.originalGems.map(g=>g.code)).size).toBe(40)
  for(const gem of gems.originalGems){expect(gem.effectConfig.gemLevel).toBeGreaterThan(0);expect(gem.effectConfig.gemLevel).toBeLessThanOrEqual(8);expect(readFileSync('public'+gem.effectConfig.icon).subarray(0,3).toString()).toBe('GIF');expect(itemSchema.safeParse(gem).success).toBe(true)}
  expect(gems.originalGems.find(g=>g.code==='gem_juxiang_8')?.effectConfig.gemAmount).toBe(81920000)
 })
 it('部位限制按原版，金刚双防，旧镶嵌快照仍可计算',()=>{
  const gem={...gems.originalGems.find(g=>g.code==='gem_jingang_1')!,id:1},gear:ItemDefinition={id:2,code:'helm',name:'头盔',itemType:'EQUIPMENT',enabled:true,rarity:3,description:'',effectConfig:{slot:'HELMET'}}
  expect(gems.gemFitsEquipment(gem,gear)).toBe(true);expect(gems.gemFitsEquipment(gem,{...gear,effectConfig:{slot:'WEAPON'}})).toBe(false);expect(gems.gemFitsEquipment(gem,{...gear,itemType:'TREASURE'})).toBe(false)
  const bonus=equipmentFlatBonuses([{heroId:1,slot:'HELMET',item:gear,gear:{instanceId:1,refineLevel:0,sockets:2,gems:[{itemId:1,name:gem.name,stat:'meleeDefense',amount:500,bonuses:gems.gemBonuses(gem)},{itemId:5,name:'旧宝石',stat:'speed',amount:60}]}}]);expect(bonus).toEqual({meleeDefense:500,rangedDefense:500,speed:60})
 })
 it('改名卡无需经验数值，原图可用，后台允许修改',()=>{expect(itemSchema.safeParse(gems.renameCard).success).toBe(true);expect(readFileSync('public'+gems.renameCard.effectConfig.icon).subarray(0,3).toString()).toBe('GIF')})
})
describe('游戏风格输入框',()=>{
 it('输入窗口支持取消和排队；过期事件不能关闭另一个窗口',async()=>{
  const a=gamePrompt({title:'一',message:'输入名字'}),first=activeDialog.value!.id,b=gamePrompt({title:'二',message:'输入名字'});finishDialog(first,'新名字');expect(await a).toBe('新名字');expect(activeDialog.value?.title).toBe('二');finishDialog(first,null);expect(activeDialog.value?.title).toBe('二');finishDialog(activeDialog.value!.id,null);expect(await b).toBeNull();expect(activeDialog.value).toBeNull()
 })
 it('输入校验、去空格、关闭返回空值',async()=>{const result=gamePrompt({title:'改名',message:'',validate:v=>v.length<2?'太短':''}),id=activeDialog.value!.id;finishDialog(id,'a');expect(activeDialog.value?.id).toBe(id);finishDialog(id,'  新名字  ');expect(await result).toBe('新名字');const cancel=gamePrompt({title:'改名',message:''});finishDialog(activeDialog.value!.id,null);expect(await cancel).toBeNull()})
 it('弹窗使用自制DOM与无障碍角色，未调用系统dialog',async()=>{const context:any={};await renderToString(createSSRApp(GameModal,{title:'调兵遣将'}),context);expect(context.teleports.body).toContain('role="dialog"');expect(context.teleports.body).toContain('war-modal');expect(context.teleports.body).toContain('调兵遣将');for(const f of ['HeroRoster.vue','ItemManager.vue','QuietReports.vue','EquipmentForge.vue'])expect(readFileSync('web/'+f,'utf8')).not.toMatch(/\b(?:window\.)?(?:confirm|alert|prompt)\(/)})
})
describe('地图与派遣入口',()=>{
 const node={id:10,name:'秦军据点',nodeType:'OUTPOST',level:4,x:30,y:65,rewardHint:'宝石',meleeDefense:900,rangedDefense:800}
 it('拖动后再次点击目标仍打开派遣，右键也能选择',async()=>{
  const select=vi.fn(),v=renderClient(Map,{nodes:[node],world:{marches:[],autoFarmJobs:[]},gameTime:0,onSelect:select})
  try{const viewport=v.byClass('world-map-viewport')!,capture=vi.fn();viewport.props.onPointerdown({button:0,clientX:1,clientY:1,target:{closest:()=>null},currentTarget:{setPointerCapture:capture},pointerId:1});viewport.props.onPointermove({clientX:40,clientY:20});viewport.props.onPointerup();await flush();const button=v.byClass('original-node')!;button.props.onClick({detail:1});expect(select).not.toHaveBeenCalled();viewport.props.onPointerdown({button:0,target:{closest:()=>button}});button.props.onClick({detail:1});expect(select).toHaveBeenCalledExactlyOnceWith(node);const preventDefault=vi.fn();button.props.onContextmenu({preventDefault});expect(preventDefault).toHaveBeenCalled();expect(select).toHaveBeenCalledTimes(2)}finally{v.app.unmount()}
 })
 it('类型筛选只改变显示、不丢目标；仅有实心星',async()=>{const v=renderClient(Map,{nodes:[node],world:null,gameTime:0});try{v.find('button','野地')!.props.onClick();await flush();expect(v.byClass('original-node')).toBeUndefined();v.find('button','全部')!.props.onClick();await flush();expect(v.byClass('original-node')).toBeDefined()}finally{v.app.unmount()}for(const file of ['App.vue','HeroRoster.vue','AdminApp.vue','TavernCandidates.vue'])expect(readFileSync('web/'+file,'utf8')).not.toContain('☆')})
})
describe('宝石工坊操作',()=>{
 const catalog=gems.originalGems.map((i,index)=>({...i,id:index+1})),source=catalog.find(i=>i.code==='gem_xiuluo_1')!
 it('选择数量后点击立即合成，连点只提交一次',async()=>{
  const combine=vi.fn(),v=renderClient(Workshop,{catalog,inventory:[{item:source,quantity:8}],busy:false,onCombine:combine})
  try{await flush();expect(v.find('button','合成宝石')?.props.disabled).toBe(false);v.find('button','最大 2')!.props.onClick();await flush();const button=v.find('button','合成宝石')!;button.props.onClick();button.props.onClick();await flush();expect(combine).toHaveBeenCalledExactlyOnceWith({itemId:source.id,quantity:2,clientActionId:actionId()});expect(v.find('button','正在处理…')?.props.disabled).toBe(true)}finally{v.app.unmount()}
 })
 it('支持空目录、下架目标和最高等级，无虚假可合成按钮',async()=>{const v=renderClient(Workshop,{catalog,inventory:[],busy:false});try{await flush();expect(v.find('button','需要四颗同类同级宝石')?.props.disabled).toBe(true);v.find('button','8级修罗宝石')!.props.onClick();await flush();expect(v.find('button','已达八级')?.props.disabled).toBe(true);v.props.catalog=[];await flush();expect(v.find('button','请选择宝石')?.props.disabled).toBe(true)}finally{v.app.unmount()}})
})
