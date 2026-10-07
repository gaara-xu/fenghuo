import {expect,it} from 'vitest'
import {existsSync,readFileSync} from 'node:fs'
import {zhengtuEquipment,zhengtuSets,zhengtuGrantQuantity} from '../shared/zhengtu-equipment'
import {equipmentBonuses,equipmentSetStates,slotMatches,type EquippedItem} from '../shared/items'
import {itemSchema} from '../server/routes/item-schema'
it('三套共27定义33件，所有名称、官方图源和品质齐全',()=>{
 expect(zhengtuEquipment).toHaveLength(27)
 expect(zhengtuEquipment.reduce((n,i)=>n+zhengtuGrantQuantity(i),0)).toBe(33)
 const manifest=JSON.parse(readFileSync('public/art/zhengtu/manifest.json','utf8'))
 for(const item of zhengtuEquipment){expect(itemSchema.safeParse(item).success).toBe(true);expect(existsSync('public'+item.effectConfig.icon)).toBe(true);expect(manifest.some((m:any)=>item.effectConfig.icon?.endsWith(m.file)&&m.imageUrl.startsWith('https://zt.ztgame.com/'))).toBe(true)}
})
it('双护腕与双戒指可穿戴；11件产生对应加成，移除一件降档',()=>{
 for(const set of zhengtuSets){
  const equipped:EquippedItem[]=[]
  zhengtuEquipment.filter(i=>i.effectConfig.setCode===set.code).forEach((raw,id)=>{const item={...raw,id};equipped.push({heroId:1,slot:item.effectConfig.slot!,item});if(zhengtuGrantQuantity(item)===2){const slot=item.effectConfig.slot==='RING'?'RING_2':'BRACELET_2';expect(slotMatches(item,slot)).toBe(true);equipped.push({heroId:1,slot,item})}})
  expect(equipmentSetStates(equipped)[0]).toMatchObject({name:set.name,count:11})
  expect(equipmentBonuses(equipped).meleeAttack).toBe(set.tiers[4])
  expect(equipmentBonuses(equipped.slice(0,-1)).meleeAttack).toBe(set.tiers[3])
 }
})
