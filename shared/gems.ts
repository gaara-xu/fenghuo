import original from './original-gems.json' with {type:'json'}
import type {ItemDefinition,EquipmentSlot,GearState} from './items.js'
import {equipmentSlots} from './items.js'
import {statLabels,type HeroStats} from './hero-growth.js'
export const gemFamilies={xiuluo:'修罗',benlei:'奔雷',jingang:'金刚',jifeng:'疾风',juxiang:'巨象'} as const
const attackSlots:EquipmentSlot[]=['WEAPON','BRACELET','NECKLACE','RING']
const types:Array<{family:keyof typeof gemFamilies;stat:keyof HeroStats;slots:EquipmentSlot[]}>=[
 {family:'xiuluo',stat:'meleeAttack',slots:attackSlots},{family:'benlei',stat:'rangedAttack',slots:attackSlots},
 {family:'jingang',stat:'meleeDefense',slots:['HELMET','SHOULDER','ARMOR','SHIELD']},
 {family:'jifeng',stat:'speed',slots:['BOOTS','MOUNT']},{family:'juxiang',stat:'loadCapacity',slots:['LEGS']},
]
export const originalGems:Omit<ItemDefinition,'id'>[]=types.flatMap(t=>Array.from({length:8},(_,index)=>{
 const level=index+1,name=level+'级'+gemFamilies[t.family]+'宝石',row=original.gems.find(g=>g.name===name)
 // These two levels are in the original client icon mapping and the January 2012 numerical table.
 const id=row?.id??(level===7?534:535),amount=row?.amount??(level===7?6400:25600)
 const bonuses:Partial<HeroStats>=t.family==='jingang'?{meleeDefense:amount,rangedDefense:amount}:{[t.stat]:amount}
 return {code:'gem_'+t.family+'_'+level,name,itemType:'MATERIAL',rarity:Math.min(level,6),qualityTier:[1,2,4,5,6,7,7,7][index],enabled:true,
  description:'镶入'+t.slots.map(s=>equipmentSlots[s]).join('、')+'，增加'+Object.entries(bonuses).map(([k,v])=>statLabels[k as keyof HeroStats]+' '+v.toLocaleString()).join('、')+'。'+(level<8?'四颗同类同级宝石可合成高一级宝石。':'已达八级。'),
  effectConfig:{gemFamily:t.family,gemLevel:level,gemStat:t.stat,gemAmount:amount,gemBonuses:bonuses,gemSlots:[...t.slots],icon:'/art/official/item'+id+'.gif',sourceStatus:'VERIFIED',sourceUrl:row?original.source:'https://www.juxia.com/news/2012-1-7/27741.html'}}
}))
export function gemBonuses(item:ItemDefinition):Partial<HeroStats>{const c=item.effectConfig;return c.gemBonuses??(c.gemStat&&c.gemAmount?{[c.gemStat]:c.gemAmount}:{})}
export function gemFitsEquipment(gem:ItemDefinition,equipment:ItemDefinition){
 const c=gem.effectConfig,slot=equipment.effectConfig.slot
 if(gem.itemType!=='MATERIAL'||equipment.itemType!=='EQUIPMENT'||!c.gemStat||!c.gemAmount||!slot)return false
 return c.gemSlots?.length?c.gemSlots.includes(slot):Boolean(equipment.effectConfig.flatBonuses?.[c.gemStat]||equipment.effectConfig.bonuses?.[c.gemStat])
}
export function gemSummary(gem:GearState['gems'][number]){return Object.entries(gem.bonuses??{[gem.stat]:gem.amount}).map(([k,v])=>statLabels[k as keyof HeroStats]+' +'+v.toLocaleString()).join(' · ')}
export const renameCard:Omit<ItemDefinition,'id'>={code:'rename_card',name:'改名卡',itemType:'CONSUMABLE',rarity:3,qualityTier:4,enabled:true,description:'为麾下英雄更名。进入英雄详情，点击英雄名字，每次更名消耗一张；等级、天赋、技能与装备不变。',effectConfig:{kind:'RENAME',icon:'/art/official/item63.gif',sourceStatus:'VERIFIED',sourceUrl:original.source}}
