import {describe,it,expect} from 'vitest'
import {existsSync,readFileSync} from 'node:fs'
import {officialItems,officialCatalog,officialHeroKeys,forgeMaterials} from '../shared/official-catalog'
import {equipmentBonuses,equipmentFlatBonuses,equipmentSlots,slotMatches,type EquippedItem,type ItemDefinition} from '../shared/items'
import {refineOutcome,defaultForgeRules} from '../shared/forge'
import {itemSchema} from '../server/routes/item-schema'
describe('官方图鉴与装备机制',()=>{
 it('26位英雄、15套装、45散件对应本地原图',()=>{
  expect(officialCatalog.heroes).toHaveLength(26);expect(officialHeroKeys).toHaveLength(26);expect(new Set(officialHeroKeys).size).toBe(26)
  expect(officialItems).toHaveLength(165);expect(new Set(officialItems.map(i=>i.code)).size).toBe(165)
  for(const item of officialItems){expect(existsSync('public'+item.effectConfig.icon)).toBe(true);expect(item.name).not.toContain('套装');expect(itemSchema.safeParse(item).success).toBe(true)}
  for(const m of forgeMaterials)expect(itemSchema.safeParse(m).success).toBe(true)
 })
 it('13个装备槽；两枚手镯、戒指可适配两侧，不误认宝物',()=>{
  expect(Object.keys(equipmentSlots).filter(s=>!s.startsWith('TREASURE'))).toHaveLength(13)
  const bracelet={...officialItems[6],id:1};expect(slotMatches(bracelet,'BRACELET_2')).toBe(true);expect(slotMatches(bracelet,'HELMET')).toBe(false);expect(slotMatches(bracelet,'TREASURE_1')).toBe(false)
 })
 it('固定属性受精炼影响，宝石不重复受精炼；重复同一槽位不会额外计件',()=>{
  const e:EquippedItem={heroId:1,slot:'HELMET',item:{...officialItems[0],id:1},gear:{instanceId:1,refineLevel:2,sockets:1,gems:[{itemId:1,name:'近防宝石',stat:'meleeDefense',amount:300}]}}
  expect(equipmentFlatBonuses([e]).meleeDefense).toBe(Math.round(e.item.effectConfig.flatBonuses!.meleeDefense!*1.4)+300)
  expect(equipmentBonuses([e,e,e]).meleeDefense??0).toBe(0)
  const pieces=officialItems.slice(0,3).map((i,n)=>({heroId:1,slot:i.effectConfig.slot!,item:{...i,id:n+1}}));expect(equipmentBonuses(pieces).meleeDefense).toBe(5)
 })
 it('精炼成功、失败不变、降级和上下限',()=>{
  expect(refineOutcome(0,false,defaultForgeRules,.9,.1).level).toBe(1)
  expect(refineOutcome(5,false,defaultForgeRules,.99,.99).level).toBe(5)
  expect(refineOutcome(5,false,defaultForgeRules,.99,0).level).toBe(4)
  expect(refineOutcome(5,true,defaultForgeRules,.6,0).level).toBe(6)
  expect(()=>refineOutcome(9,true,defaultForgeRules,0,0)).toThrow('上限')
 })
 it('实例结构和幂等结构包含在完整设计文件内',()=>{
  const schema=readFileSync('database/schema.sql','utf8');for(const field of ['equipment_instances','forge_operations','instance_id','refine_level','sockets','gems_json','extra_bonuses'])expect(schema).toContain('`'+field+'`')
 })
 it('后台编辑不会丢弃新装备参数，并拒绝外部图片地址',()=>{
  const item=officialItems[0];expect(itemSchema.parse(item).effectConfig).toEqual(item.effectConfig)
  expect(itemSchema.safeParse({...item,effectConfig:{...item.effectConfig,icon:'https://external.invalid/a.jpg'}}).success).toBe(false)
 })
})
