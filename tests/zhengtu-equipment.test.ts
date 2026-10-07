import {expect,it} from 'vitest'
import {existsSync,readFileSync} from 'node:fs'
import {zhengtuEquipment,zhengtuExtras,zhengtuSets,zhengtuGrantQuantity} from '../shared/zhengtu-equipment'
import {equipmentBonuses,equipmentSetStates,slotMatches,type EquippedItem} from '../shared/items'
import {itemSchema} from '../server/routes/item-schema'
it('三套共27定义33件，所有名称、官方图源和品质齐全',()=>{
 expect(zhengtuEquipment).toHaveLength(27)
 expect(zhengtuEquipment.reduce((n,i)=>n+zhengtuGrantQuantity(i),0)).toBe(33)
 const manifest=JSON.parse(readFileSync('public/art/zhengtu/manifest.json','utf8'))
 for(const item of zhengtuEquipment){expect(itemSchema.safeParse(item).success).toBe(true);expect(existsSync('public'+item.effectConfig.icon)).toBe(true);expect(manifest.some((m:any)=>item.effectConfig.icon?.replace('.svg','.jpg').endsWith(m.file)&&m.imageUrl.startsWith('https://zt.ztgame.com/'))).toBe(true)}
})
it('每套补齐肩铠、坐骑与两件宝物，卓越降为金色并降低属性',()=>{
 expect(zhengtuExtras).toHaveLength(12)
 for(const i of zhengtuExtras){expect(itemSchema.safeParse(i).success).toBe(true);expect(existsSync('public'+i.effectConfig.icon)).toBe(true)}
 for(const set of zhengtuSets){const items=zhengtuExtras.filter(i=>i.code.startsWith('zt_'+set.key+'_'));expect(items.filter(i=>i.itemType==='TREASURE')).toHaveLength(2);for(const i of items.filter(i=>i.itemType==='TREASURE')){expect(slotMatches({...i,id:0},'TREASURE_1')).toBe(true);expect(slotMatches({...i,id:0},'TREASURE_2')).toBe(true)}}
 const gold=zhengtuEquipment.filter(i=>i.code.startsWith('zt_tianzun_'));expect(gold.every(i=>i.qualityTier===3)).toBe(true);expect(gold.find(i=>i.effectConfig.slot==='WEAPON')!.effectConfig.flatBonuses!.meleeAttack).toBeLessThan(6000)
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
