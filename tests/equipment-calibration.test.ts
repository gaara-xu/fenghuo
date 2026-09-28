import {describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {equipmentCalibration} from '../shared/equipment-calibration'
import {equipmentBonuses,equipmentFlatBonuses,equipmentSetStates,itemStatBonuses,type EquippedItem} from '../shared/items'
import {officialItems} from '../shared/official-catalog'
import {inventoryChoice} from '../web/item-choices'
import {itemSchema} from '../server/routes/item-schema'
import {salvageReward,salvageBlockReason} from '../shared/salvage'
import {salvageSchema} from '../server/salvage-service'
import {refineOutcome,defaultForgeRules} from '../shared/forge'
import {randomUUID} from 'node:crypto'
describe('装备校准、套装与分解规则',()=>{
  it('165件按部位校准；旗双防3000，轮回等远攻武器不再算近攻',()=>{
    expect(equipmentCalibration).toHaveLength(165)
    expect(equipmentCalibration.find(i=>i.name==='巡天曜日旗')!.flatBonuses).toEqual({meleeDefense:3000,rangedDefense:3000})
    for(const name of ['轮回','痴狂','离别'])expect(equipmentCalibration.find(i=>i.name===name)!.flatBonuses.rangedAttack).toBeGreaterThan(0)
    expect(equipmentCalibration.find(i=>i.name==='魔怒护腿')!.flatBonuses).toEqual({loadCapacity:40000})
    expect(equipmentCalibration.find(i=>i.name==='魔怒战靴')!.flatBonuses).toEqual({speed:37})
    for(const item of equipmentCalibration)expect(Object.values(item.flatBonuses).every(n=>n>0)).toBe(true)
  })
  it('单件逐级表统一用于面板和说明，宝石不跟着精炼放大',()=>{
    const item={...officialItems[0],id:1,effectConfig:{...officialItems[0].effectConfig,flatBonuses:{meleeDefense:100},bonuses:{speed:2},refineMultipliers:[1,2,3,4,5,6,7,8,9,10]}}
    const gear={instanceId:1,refineLevel:9,sockets:1,gems:[{itemId:9,name:'金刚宝石',stat:'meleeDefense' as const,amount:500}]}
    expect(itemStatBonuses(item,gear).meleeDefense).toBe(1000)
    expect(equipmentFlatBonuses([{heroId:1,slot:'HELMET',item,gear}]).meleeDefense).toBe(1500)
    expect(inventoryChoice({item,gear,quantity:1}).lines).toContain('近防 +1000')
    expect(inventoryChoice({item,gear,quantity:1}).lines).toContain('速度 +20%')
    expect(itemSchema.parse(item).effectConfig.refineMultipliers).toEqual(item.effectConfig.refineMultipliers)
    expect(itemSchema.safeParse({...item,effectConfig:{...item.effectConfig,refineMultipliers:[1,2]}}).success).toBe(false)
  })
  it('套装按穿戴槽位计数；三五八十档只高档生效，同款左右饰品各计一件',()=>{
    const pieces:EquippedItem[]=officialItems.slice(0,8).map((item,n)=>({heroId:1,slot:item.effectConfig.slot!,item:{...item,id:n+1}}))
    for(const [count,active,bonus] of [[2,0,0],[3,3,5],[5,5,9],[8,8,15]]){
      const worn=pieces.slice(0,count),states=equipmentSetStates(worn)[0]
      expect(states.tiers.filter(t=>t.active).map(t=>t.count)).toEqual(active?[active]:[])
      expect(equipmentBonuses(worn).meleeDefense??0).toBe(bonus)
      expect(inventoryChoice({...worn[0],quantity:1},worn).setTiers?.filter(t=>t.active)).toHaveLength(active?1:0)
    }
    expect(equipmentSetStates([pieces[0],pieces[0],pieces[1]])[0].count).toBe(2)
    const eight=[...pieces.filter(e=>e.slot!=='ARMOR'),{...pieces[7],slot:'RING_2' as const}]
    expect(equipmentSetStates(eight)[0].count).toBe(8);expect(equipmentBonuses(eight).meleeDefense).toBe(15)
    const ten=[...pieces,{...pieces[6],slot:'BRACELET_2' as const},{...pieces[7],slot:'RING_2' as const}]
    expect(equipmentSetStates(ten)[0].tiers.filter(t=>t.active).map(t=>t.count)).toEqual([10]);expect(equipmentBonuses(ten).meleeDefense).toBe(25)
    expect(equipmentBonuses(ten.slice(0,9)).meleeDefense).toBe(15)
    expect(equipmentSetStates([...ten,ten[0]])[0].count).toBe(10)
  })
  it('所有图标栏有+等级角标、侧栏已替换天赋文案、没有底部加载残留',()=>{
    const source=readFileSync('web/HeroRoster.vue','utf8');expect(source.match(/class="gear-level"/g)).toHaveLength(3)
    expect(source).toContain('当前装备加成');expect(source).not.toContain('class="inspector-talent"');expect(source).not.toContain('class="talent-odds"')
    expect(source).toContain("'set-inactive':!tier.active");expect(readFileSync('web/App.vue','utf8')).not.toContain('正在点燃烽火')
  })
  it('分解奖励：普通材料按星级与精炼级计算，高级材料10%独立抽取',()=>{
    expect(salvageReward(5,9,2,()=>0)).toEqual({common:28,advanced:2})
    expect(salvageReward(5,0,3,()=>.1)).toEqual({common:15,advanced:0})
    expect(salvageReward(5,0,1,()=>.099999)).toEqual({common:5,advanced:1})
    expect(refineOutcome(5,false,defaultForgeRules,.55,.9,true).success).toBe(true)
    expect(refineOutcome(5,false,defaultForgeRules,.55,.9).success).toBe(false)
  })
  it('空批、重复实例、超量、小数及非包裹目标拒绝，带宝石必须先取石',()=>{
    const key=randomUUID(),good={kind:'STACK',itemId:1,quantity:1}
    expect(salvageSchema.safeParse({clientActionId:key,targets:[good]}).success).toBe(true)
    for(const targets of [[],[good,good],[{...good,quantity:1001}],[{...good,quantity:1.5}],[{kind:'EQUIPPED',instanceId:1}]])expect(salvageSchema.safeParse({clientActionId:key,targets}).success).toBe(false)
    expect(salvageBlockReason({item:{...officialItems[0],id:1},quantity:1,gear:{instanceId:1,refineLevel:1,sockets:1,gems:[{itemId:2,name:'宝石',stat:'speed',amount:1}]}})).toContain('取出宝石')
  })
})
