import type { HeroStats } from './hero-growth.js'
import type { TalentGrade } from './contracts.js'
export const equipmentSlots={HELMET:'头盔',SHOULDER:'肩铠',ARMOR:'胸铠',LEGS:'护腿',BOOTS:'战靴',NECKLACE:'项链',BRACELET:'左手镯',BRACELET_2:'右手镯',RING:'左戒指',RING_2:'右戒指',WEAPON:'武器',SHIELD:'防具',MOUNT:'坐骑',TREASURE_1:'宝物一',TREASURE_2:'宝物二'} as const
export type EquipmentSlot=keyof typeof equipmentSlots
export const itemTypes={CONSUMABLE:'消耗道具',EQUIPMENT:'武将装备',TREASURE:'宝物',MATERIAL:'材料',SKILL_BOOK:'技能书'} as const
export interface ItemDefinition {id:number;code:string;name:string;itemType:keyof typeof itemTypes;rarity:number;qualityTier?:number;description:string;enabled:boolean;effectConfig:{refineMultipliers?:number[];kind?:'TALENT'|'EXPERIENCE'|'STAMINA'|'RENAME';amount?:number;slot?:EquipmentSlot;bonuses?:Partial<HeroStats>;flatBonuses?:Partial<HeroStats>;setCode?:string;setBonuses?:Array<{count:number;bonuses:Partial<HeroStats>}>;skillId?:number;icon?:string;requiredStrength?:number;refineStep?:number;initialSockets?:number;gemFamily?:string;gemLevel?:number;gemBonuses?:Partial<HeroStats>;gemStat?:keyof HeroStats;gemAmount?:number;gemSlots?:EquipmentSlot[];sourceUrl?:string;talentWeights?:Record<TalentGrade,number>;sourceStatus?:'VERIFIED'|'ESTIMATED'|'DIY'}}
export interface GearState {instanceId:number;refineLevel:number;sockets:number;gems:Array<{itemId:number;name:string;stat:keyof HeroStats;amount:number;bonuses?:Partial<HeroStats>;icon?:string;level?:number}>;extraBonuses?:Partial<HeroStats>}
export interface ItemDefinition {deletedAt?:string|null}
export interface InventoryEntry {item:ItemDefinition;quantity:number;gear?:GearState}
export interface EquippedItem {heroId:number;slot:EquipmentSlot;item:ItemDefinition;gear?:GearState}
export interface Loot {itemId:number;name:string;quantity:number}
export interface DropPool {id:number;name:string;nodeType:string;minLevel:number;maxLevel:number;chance:number;rolls:number;enabled:boolean;entries:Array<{itemId:number;weight:number;minQuantity:number;maxQuantity:number;enabled:boolean}>}
export function itemStatBonuses(item:ItemDefinition,gear?:GearState,percentage=false):Partial<HeroStats>{
  // 本体精炼追加递增收益；宝石在汇总时独立相加，不随精炼放大。
  const cfg=item.effectConfig,level=gear?.refineLevel??0,curve=cfg.refineMultipliers
  const extra=(item.itemType==='EQUIPMENT'||item.itemType==='TREASURE')?([0,.1,.3,.6,1.1,1.8,2.8,4.1,5.5,7.2][level]??0):0
  const factor=(curve?.[level]??(1+level*(cfg.refineStep??(percentage ? .15 : .2))))+extra
  return Object.fromEntries(Object.entries((percentage?cfg.bonuses:cfg.flatBonuses)??{}).map(([key,value])=>[key,percentage?Number((value*factor).toFixed(2)):Math.round(value*factor)]))
}
export function itemSetBonuses(item:Pick<ItemDefinition,'effectConfig'>):Array<{count:number;bonuses:Partial<HeroStats>}>{
  return item.effectConfig.setBonuses??(item.effectConfig.setCode==='BRONZE'?[{count:2,bonuses:{meleeDefense:4,rangedDefense:4}},{count:5,bonuses:{meleeDefense:7,rangedDefense:7}},{count:8,bonuses:{meleeDefense:10,rangedDefense:10}},{count:10,bonuses:{meleeDefense:25,rangedDefense:25}}]:[])
}
export function equipmentSetStates(items:EquippedItem[]){
  return [...new Set(items.map(e=>e.item.effectConfig.setCode).filter((c):c is string=>Boolean(c)))].map(code=>{
    const members=items.filter(e=>e.item.effectConfig.setCode===code),count=new Set(members.map(e=>e.slot)).size
    const tiers=itemSetBonuses(members[0].item)
    const activeCount=Math.max(0,...tiers.filter(t=>t.count<=count).map(t=>t.count))
    const importedNames:Record<string,string>={ZT_PERFECT_TIANMO:'完美的天魔',ZT_EXCELLENT_TIANZUN:'卓越的天尊',ZT_SUPREME_HERO:'至尊的英雄'}
    const name=importedNames[code]??(code==='BRONZE'?'青铜':members[0].item.name.replace(/(头盔|肩铠|胸铠|护腿|战靴|项链|手镯|戒指)$/,''))
    return {code,name,count,tiers:tiers.map(t=>({...t,active:t.count===activeCount,unlocked:t.count<=count}))}
  })
}
export function equipmentBonuses(items:EquippedItem[]):Partial<HeroStats>{
  const result:Partial<HeroStats>={}
  for(const e of items){for(const [key,value] of Object.entries(itemStatBonuses(e.item,e.gear,true))){const k=key as keyof HeroStats;result[k]=(result[k]??0)+value}for(const [key,value] of Object.entries(e.gear?.extraBonuses??{})){const k=key as keyof HeroStats;result[k]=(result[k]??0)+value}}
  for(const set of equipmentSetStates(items)){
    for(const [key,value] of Object.entries(set.tiers.find(t=>t.active)?.bonuses??{})){const k=key as keyof HeroStats;result[k]=(result[k]??0)+value}
  }
  return result
}
export function equipmentFlatBonuses(items:EquippedItem[]):Partial<HeroStats>{const out:Partial<HeroStats>={};for(const e of items){for(const [key,value] of Object.entries(itemStatBonuses(e.item,e.gear))){const k=key as keyof HeroStats;out[k]=(out[k]??0)+value}for(const gem of e.gear?.gems??[])for(const [key,value] of Object.entries(gem.bonuses??{[gem.stat]:gem.amount})){const k=key as keyof HeroStats;out[k]=(out[k]??0)+value}}return out}
export function slotMatches(item:ItemDefinition,slot:EquipmentSlot){return slot.startsWith('TREASURE_')?item.itemType==='TREASURE':item.itemType==='EQUIPMENT'&&item.effectConfig.slot===slot.replace(/_2$/,'')}
export function inventoryKey(e:InventoryEntry){return e.gear?-e.gear.instanceId:e.item.id}
