import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {h,nextTick,toRaw} from 'vue'
import {clientComponent} from './vue-client'
import {content,nodes,renderClient} from './ui-renderer'
import * as items from '../shared/items'
import * as quality from '../shared/quality'
import * as gems from '../shared/gems'
import * as forge from '../shared/forge'
import * as growth from '../shared/hero-growth'
import * as choices from '../web/item-choices'
import * as art from '../web/art'
import * as positioning from '../web/tooltip-position'
const api=vi.fn(),actionId=vi.fn(()=> 'test-action')
const Picker=clientComponent('web/IconInventoryPicker.vue',{'./art':art,'../shared/quality':quality,'./ItemGlyph.vue':{setup:()=>()=>h('svg')},'./tooltip-position':positioning})
const Forge=clientComponent('web/EquipmentForge.vue',{'../shared/gems':gems,'../shared/forge':forge,'../shared/hero-growth':growth,'./api':{api,actionId},'./IconInventoryPicker.vue':Picker,'./item-choices':choices})
const Armory=clientComponent('web/EquipmentWorkbench.vue',{'../shared/items':items,'../shared/quality':quality,'./item-choices':choices,'./IconInventoryPicker.vue':Picker,'./EquipmentForge.vue':Forge})
const Workshop=clientComponent('web/GameWorkshop.vue',{'../shared/items':items,'./item-choices':choices,'./IconInventoryPicker.vue':Picker,'./EquipmentForge.vue':Forge,'./EquipmentSalvage.vue':{setup:()=>()=>h('section','批量分解')},'./GemWorkshop.vue':{props:['embedded'],emits:['combine'],setup(_p:any,{emit}:any){return()=>h('button',{onClick:()=>emit('combine',{itemId:1,quantity:2,clientActionId:'combine-test'})},'测试合成')}}})
const item:items.ItemDefinition={id:10,code:'helm',name:'魔怒头盔',itemType:'EQUIPMENT',enabled:true,rarity:6,qualityTier:6,description:'头盔完整说明',effectConfig:{slot:'HELMET',flatBonuses:{meleeAttack:700},requiredStrength:30}}
const equipped:items.EquippedItem={heroId:1,slot:'HELMET',item,gear:{instanceId:100,refineLevel:2,sockets:1,gems:[]}}
const material=(id:number,code:string,quantity=3,config:items.ItemDefinition['effectConfig']={}):items.InventoryEntry=>({item:{id,code,name:code==='refine_common'?'精炼石':code==='refine_stone'?'精炼神石':code==='drill_stone'?'天工神石':'宝石'+id,itemType:'MATERIAL',enabled:true,rarity:1,description:'材料说明',effectConfig:config},quantity})
const inventory=[material(1,'refine_stone'),material(2,'refine_common'),material(3,'drill_stone'),material(4,'gem_compatible',3,{gemStat:'meleeAttack',gemAmount:10}),material(5,'gem_wrong',3,{gemStat:'speed',gemAmount:10}),material(6,'gem_wrong_slot',3,{gemStat:'meleeAttack',gemAmount:10,gemSlots:['WEAPON']})]
const hero={id:1,star:6,level:5,busy:false,equipment:[equipped]}
const flush=async()=>{await Promise.resolve();await nextTick();await Promise.resolve();await nextTick()}
const click=async(v:ReturnType<typeof renderClient>,label:string)=>{const b=v.find('button',label);expect(b,'button '+label).toBeDefined();expect(b!.props.disabled,'enabled '+label).toBeFalsy();b!.props.onClick();await flush()}
beforeEach(()=>{api.mockReset().mockResolvedValue(structuredClone(forge.defaultForgeRules));actionId.mockClear()})
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers()})
describe('紧凑的游戏行装面板',()=>{
  it('只展示真实可用物品，无空格或常驻长详情；轮询不清空选择',async()=>{
    const onEquip=vi.fn(),replacement={item:{...item,id:11,name:'替换头盔'},quantity:1,gear:{...equipped.gear!,instanceId:101}}
    const v=renderClient(Armory,{hero:structuredClone(hero),slot:'HELMET',inventory:[replacement],locked:false,onEquip})
    try{
      expect(v.byClass('bag-empty')).toBeUndefined();expect(v.byClass('picker-preview')).toBeUndefined();expect(content(v.root)).not.toContain('头盔完整说明')
      const option=v.all().find(n=>n.props['aria-label']==='替换头盔，+2')!;option.props.onClick();await flush()
      v.props.hero=structuredClone(toRaw(v.props.hero));await flush();expect(option.props['aria-pressed']).toBe(true)
      await click(v,'换上');expect(onEquip).toHaveBeenCalledExactlyOnceWith({slot:'HELMET',itemId:11,instanceId:101})
      option.props.onDblclick();expect(onEquip).toHaveBeenCalledTimes(1)
    }finally{v.app.unmount()}
  })
  it('双击可穿戴，实力不足和出征锁定不能穿戴，切英雄清空选择',async()=>{
    const onEquip=vi.fn(),entries=[{item:{...item,id:11,name:'强者头盔',effectConfig:{...item.effectConfig,requiredStrength:99}},quantity:1},{item:{...item,id:12,name:'备用头盔'},quantity:1}]
    const v=renderClient(Armory,{hero:structuredClone(hero),slot:'HELMET',inventory:entries,locked:false,onEquip})
    try{
      const high=v.all().find(n=>n.props['aria-label']==='强者头盔，1')!;expect(high.props['aria-disabled']).toBe(true);high.props.onDblclick();expect(onEquip).not.toHaveBeenCalled()
      const normal=v.all().find(n=>n.props['aria-label']==='备用头盔，1')!;normal.props.onClick();await flush()
      v.props.hero={...v.props.hero,id:2};await flush();expect(normal.props['aria-pressed']).toBe(false)
      v.props.locked=true;await flush();normal.props.onDblclick();expect(onEquip).not.toHaveBeenCalled()
      v.props.locked=false;await flush();normal.props.onContextmenu({preventDefault:vi.fn()});expect(onEquip).toHaveBeenCalledExactlyOnceWith({slot:'HELMET',itemId:12,instanceId:undefined})
    }finally{v.app.unmount()}
  })
  it('卸下发出正确部位，不依赖额外选择；空部位工坊有返回入口',async()=>{
    const onEquip=vi.fn(),v=renderClient(Armory,{hero:structuredClone(hero),slot:'HELMET',inventory:[],locked:false,onEquip})
    try{await click(v,'卸下');expect(onEquip).toHaveBeenCalledExactlyOnceWith({slot:'HELMET',itemId:null});v.props.slot='TREASURE_1';await flush();await click(v,'装备工坊');expect(content(v.root)).toContain('先在此部位穿戴装备或宝物');await click(v,'前往换装');expect(content(v.root)).toContain('尚无可替换物品')}finally{v.app.unmount()}
  })
})
describe('工坊操作',()=>{
  it('免费取石点击即提交，精确孔位与连点防重，空宝石不可提交',async()=>{
    const g={itemId:81,name:'一级金刚',stat:'meleeDefense',amount:500,level:1,icon:'/gem.gif'},gear={...equipped.gear!,sockets:2,gems:[g,{...g,itemId:82,name:'二级金刚',level:2}]}
    const onForge=vi.fn(),v=renderClient(Forge,{equipment:{...equipped,gear},inventory:[],locked:false,onForge})
    try{
      await flush();await click(v,'取出');expect(content(v.root)).toContain('不消耗道具或金币');expect(v.byClass('forge-cost')).toBeUndefined();expect(content(v.root)).not.toContain('不可取回')
      const option=v.all().find(n=>n.props['aria-label']==='二级金刚，2孔')!;option.props.onClick();await flush()
      const button=v.find('button','开始取出')!;button.props.onClick();button.props.onClick();await flush();expect(v.byClass('forge-confirm')).toBeUndefined()
      
      expect(onForge).toHaveBeenCalledExactlyOnceWith({slot:'HELMET',operation:'UNSOCKET',gemIndex:1,gemItemId:82,clientActionId:'test-action'})
      v.props.locked=true;await flush();v.props.locked=false;await flush()
      v.props.equipment.gear.gems=[];await flush();expect(v.byClass('forge-confirm')).toBeUndefined();expect(v.find('button','没有已镶嵌的宝石')?.props.disabled).toBe(true)
    }finally{v.app.unmount()}
  })
  it('优先普通材料，单击精炼直接提交，无二次确认且连点不重复',async()=>{
    const onForge=vi.fn(),v=renderClient(Forge,{equipment:structuredClone(equipped),inventory:structuredClone(inventory),locked:false,onForge})
    try{
      await flush();expect(content(v.byClass('forge-cost')!)).toContain('精炼石');expect(content(v.byClass('forge-rate')!)).toContain('80%');expect(v.byClass('bag-empty')).toBeUndefined();expect(v.byClass('picker-preview')).toBeUndefined()
      expect(v.byClass('forge-confirm')).toBeUndefined();expect(v.find('button','取消')).toBeUndefined()
      const button=v.find('button','开始精炼')!;button.props.onClick();button.props.onClick();await flush();expect(onForge).toHaveBeenCalledExactlyOnceWith({slot:'HELMET',operation:'REFINE',materialId:2,clientActionId:'test-action'})
      v.props.locked=true;await flush();v.props.locked=false;await flush();expect(v.find('button','开始精炼')?.props.disabled).toBe(false)
    }finally{v.app.unmount()}
  })
  it('按后台打孔消耗检查库存，镶嵌仅显示相容宝石',async()=>{
    api.mockResolvedValue({...forge.defaultForgeRules,drillCost:4});const onForge=vi.fn(),v=renderClient(Forge,{equipment:structuredClone(equipped),inventory:structuredClone(inventory),locked:false,onForge})
    try{
      await flush();await click(v,'打孔');expect(v.find('button','材料数量不足')?.props.disabled).toBe(true)
      await click(v,'镶嵌');const icons=v.all().filter(n=>n.props.class?.includes('bag-slot'));expect(icons).toHaveLength(1);expect(icons[0].props['aria-label']).toContain('宝石4')
      v.props.equipment.gear.sockets=0;await flush();expect(v.byClass('forge-confirm')).toBeUndefined();expect(v.find('button','没有空孔，请先打孔')?.props.disabled).toBe(true);expect(onForge).not.toHaveBeenCalled()
    }finally{v.app.unmount()}
  })
  it('规则未加载或失败时禁用操作，支持重试；满级与宝物限制生效',async()=>{
    api.mockRejectedValueOnce(Error('offline'));const v=renderClient(Forge,{equipment:structuredClone(equipped),inventory:structuredClone(inventory),locked:false})
    try{
      expect(v.find('button','正在读取工坊规则…')?.props.disabled).toBe(true);await flush();expect(v.find('button','工坊暂未就绪')?.props.disabled).toBe(true);await click(v,'重试加载');expect(v.find('button','开始精炼')).toBeDefined()
      v.props.equipment.gear.refineLevel=9;await flush();expect(v.find('button','精炼已满级')?.props.disabled).toBe(true)
      v.props.equipment.item.itemType='TREASURE';await flush();expect(v.find('button','打孔')?.style.display).toBe('none');expect(v.find('button','镶嵌')?.style.display).toBe('none')
    }finally{v.app.unmount()}
  })
})
describe('独立工坊入口与选件',()=>{
  it('包裹装备无需穿戴即可提交打孔，生成实例后继续选中原件，切换英雄装备提交精确实例',async()=>{
    const bag={item:{...item,id:11,name:'包裹头盔'},quantity:2},onForge=vi.fn()
    const v=renderClient(Workshop,{world:{inventory:[bag,...structuredClone(inventory)],ownedHeroes:[{...structuredClone(hero),name:'章邯'}]},gems:[],busy:false,onForge})
    try{
      await flush();expect(v.all().some(n=>n.type==='select')).toBe(false);expect(content(v.root)).toContain('打孔 · 镶嵌 · 免费取石');expect(v.find('button','精炼')).toBeUndefined()
      await click(v,'开始打孔')
      expect(onForge).toHaveBeenCalledExactlyOnceWith({target:{kind:'STACK',itemId:11},slot:'HELMET',operation:'DRILL',materialId:3,clientActionId:'test-action'})
      const minted={...bag,quantity:1,gear:{instanceId:200,refineLevel:0,sockets:1,gems:[]}}
      v.props.world={...v.props.world,inventory:[{...bag,quantity:1},minted,...structuredClone(inventory)]};v.props.focusInstanceId=200;await flush()
      expect(v.all().find(n=>n.props['aria-label']==='包裹头盔，+0')?.props['aria-pressed']).toBe(true)
      await click(v,'英雄身上');expect(v.all().some(n=>n.props['aria-label']==='魔怒头盔，+2')).toBe(true);await click(v,'开始打孔')
      expect(onForge.mock.calls[1][0].target).toEqual({kind:'EQUIPPED',heroId:1,slot:'HELMET',instanceId:100})
      v.props.world.ownedHeroes[0].busy=true;await flush();expect(v.find('button','暂不可操作')?.props.disabled).toBe(true)
    }finally{v.app.unmount()}
  })
  it('空装备显示空态，独立合成入口转发请求，合成中不能切页',async()=>{
    const onCombine=vi.fn(),onBag=vi.fn(),v=renderClient(Workshop,{world:{inventory:[],ownedHeroes:[]},gems:[],busy:false,onCombine,onBag})
    try{
      await flush();expect(content(v.root)).toContain('炉火待启');expect(v.find('button','开始打孔')).toBeUndefined()
      await click(v,'宝石合成');await click(v,'测试合成');expect(onCombine).toHaveBeenCalledExactlyOnceWith({itemId:1,quantity:2,clientActionId:'combine-test'})
      v.props.busy=true;await flush();expect(v.find('button','装备工坊')?.props.disabled).toBe(true);v.props.busy=false;await flush();await click(v,'我的物品');expect(onBag).toHaveBeenCalledOnce()
    }finally{v.app.unmount()}
  })
})
describe('物品悬停浮层',()=>{
  it('禁用品可查属性，停在图标上滚动说明，离开立即消失且不可移入浮层',async()=>{
    vi.useFakeTimers();const change=vi.fn(),activate=vi.fn(),v=renderClient(Picker,{label:'头盔',options:[{...choices.inventoryChoice({item,quantity:1}),disabled:true}],compact:true,preview:false,'onUpdate:modelValue':change,onActivate:activate})
    try{
      const b=v.all().find(n=>n.props.class?.includes('bag-slot'))!;b.props.onClick();b.props.onDblclick();expect(change).not.toHaveBeenCalled();expect(activate).not.toHaveBeenCalled()
      b.props.onMouseenter({currentTarget:{getBoundingClientRect:()=>({left:1100,right:1160,top:700})}});await flush();const tip=()=>nodes(v.body).find(n=>n.props.role==='tooltip')
      expect(content(tip()!)).toContain('头盔完整说明');expect(content(tip()!)).toContain('近攻 +700');expect(content(tip()!)).not.toContain('品质');expect(tip()!.props.class).toContain('quality-6')
      expect(tip()!.props.tabindex).toBeUndefined();expect(tip()!.props.onMouseenter).toBeUndefined()
      const panel=tip()! as any;panel.scrollTop=0;const preventDefault=vi.fn();b.props.onWheel({deltaY:100,preventDefault});expect(panel.scrollTop).toBe(100);expect(preventDefault).toHaveBeenCalledOnce()
      b.props.onKeydown({key:'PageDown',preventDefault});expect(panel.scrollTop).toBe(340)
      b.props.onMouseleave();await flush();expect(tip()).toBeUndefined();vi.advanceTimersByTime(200);await flush();expect(tip()).toBeUndefined()
      b.props.onFocus({currentTarget:{getBoundingClientRect:()=>({left:1100,right:1160,top:700})}});await flush();expect(tip()).toBeDefined()
      v.dispatch('scroll',{target:tip()});await flush();expect(tip()).toBeDefined();v.dispatch('keydown',{key:'Escape'});await flush();expect(tip()).toBeUndefined()
    }finally{v.app.unmount()}
    expect(vi.getTimerCount()).toBe(0)
  })
})
