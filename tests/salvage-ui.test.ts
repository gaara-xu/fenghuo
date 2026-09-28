import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest'
import {h,nextTick} from 'vue'
import {clientComponent} from './vue-client'
import {content,renderClient} from './ui-renderer'
import * as items from '../shared/items'
import * as salvage from '../shared/salvage'
import * as choices from '../web/item-choices'
import * as quality from '../shared/quality'
import * as art from '../web/art'
import * as positioning from '../web/tooltip-position'
import {useTimedNotice} from '../web/timed-notice'
const api=vi.fn(),confirm=vi.fn(),actionId=vi.fn(()=> '00000000-0000-4000-8000-000000000003')
const Picker=clientComponent('web/IconInventoryPicker.vue',{'./art':art,'../shared/quality':quality,'./ItemGlyph.vue':{setup:()=>()=>h('svg')},'./tooltip-position':positioning})
const Salvage=clientComponent('web/EquipmentSalvage.vue',{'../shared/items':items,'../shared/salvage':salvage,'./item-choices':choices,'./game-dialog':{gameConfirm:confirm},'./api':{api,actionId},'./timed-notice':{useTimedNotice},'./IconInventoryPicker.vue':Picker})
const item:items.ItemDefinition={id:1,code:'test',name:'测试头盔',itemType:'EQUIPMENT',rarity:5,qualityTier:6,enabled:true,description:'头盔',effectConfig:{slot:'HELMET'}}
const inventory:items.InventoryEntry[]=[{item,quantity:5},{item:{...item,id:2,name:'精炼头盔'},quantity:1,gear:{instanceId:10,refineLevel:9,sockets:0,gems:[]}},{item:{...item,id:3,name:'镶石头盔'},quantity:1,gear:{instanceId:11,refineLevel:0,sockets:1,gems:[{itemId:99,name:'宝石',stat:'speed',amount:1}]}},{item:{...item,id:4,name:'宝物',itemType:'TREASURE'},quantity:3}]
const flush=async()=>{await Promise.resolve();await nextTick();await Promise.resolve();await nextTick()}
beforeEach(()=>{api.mockReset();confirm.mockReset().mockResolvedValue(false);actionId.mockClear()})
afterEach(()=>vi.unstubAllGlobals())
describe('游戏风格批量分解交互',()=>{
  it('图标多选与取消、数量、过滤批选；不自动选高精炼，带宝石不可选',async()=>{
    const view=renderClient(Salvage,{inventory:structuredClone(inventory),busy:false})
    try{
      expect(content(view.root)).not.toContain('宝物');expect(view.all().some(n=>n.type==='select')).toBe(false)
      const icon=(name:string)=>view.all().find(n=>n.props['aria-label']===name)!
      icon('测试头盔，5').props.onClick();icon('精炼头盔，+9').props.onClick();await flush()
      expect(icon('测试头盔，5').props['aria-pressed']).toBe(true);expect(icon('精炼头盔，+9').props['aria-pressed']).toBe(true)
      expect(content(view.root)).toContain('分解炉 · 2 件');expect(content(view.root)).toContain('19')
      expect(icon('镶石头盔，+0').props['aria-disabled']).toBe(true);icon('镶石头盔，+0').props.onClick();await flush();expect(content(view.root)).toContain('分解炉 · 2 件')
      icon('测试头盔，5').props.onClick();await flush();expect(icon('测试头盔，5').props['aria-pressed']).toBe(false)
      view.find('button','选中可见未精炼装备')!.props.onClick();await flush();expect(content(view.root)).toContain('分解炉 · 5 件');expect(icon('精炼头盔，+9').props['aria-pressed']).toBe(false)
    }finally{view.app.unmount()}
  })
  it('点击立即分解；失败保留选择和重试编号，成功清空；连点不重复',async()=>{
    const changed=vi.fn(),view=renderClient(Salvage,{inventory:structuredClone(inventory),busy:false,onChanged:changed})
    try{
      view.find('button','选中可见未精炼装备')!.props.onClick();await flush()
      const button=()=>view.find('button','分解选中装备')!
      expect(content(view.root)).toContain('点击后直接分解');expect(confirm).not.toHaveBeenCalled()
      api.mockRejectedValueOnce(Error('请求中断'));button().props.onClick();button().props.onClick();await flush();expect(api).toHaveBeenCalledTimes(1)
      const first=JSON.parse(api.mock.calls[0][1].body);expect(first.targets).toEqual([{kind:'STACK',itemId:1,quantity:5}])
      api.mockResolvedValueOnce({message:'已分解'});button().props.onClick();await flush();expect(JSON.parse(api.mock.calls[1][1].body).clientActionId).toBe(first.clientActionId)
      expect(changed).toHaveBeenCalledWith('已分解');expect(content(view.root)).toContain('分解炉 · 0 件')
    }finally{view.app.unmount()}
  })
  it('提交前库存变化自动校正数量；非法数量和忙碌均不允许提交',async()=>{
    const view=renderClient(Salvage,{inventory:structuredClone(inventory),busy:false})
    try{
      view.find('button','选中可见未精炼装备')!.props.onClick();await flush()
      const input=view.all().find(n=>n.props['aria-label']==='测试头盔分解数量')!;input.props['onUpdate:modelValue'](1.5);await flush();expect(view.find('button','分解选中装备')!.props.disabled).toBe(true)
      input.props['onUpdate:modelValue'](5);await flush()
      view.props.busy=true;await flush();view.find('button','分解选中装备')!.props.onClick();expect(api).not.toHaveBeenCalled()
      view.props.busy=false;view.props.inventory=[];await flush();view.find('button','分解选中装备')!.props.onClick();expect(api).not.toHaveBeenCalled();expect(confirm).not.toHaveBeenCalled()
    }finally{view.app.unmount()}
  })
})
