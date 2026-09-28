import type {ItemDefinition,InventoryEntry,EquippedItem} from './items.js'
import {qualityTier} from './quality.js'
export const isTreasuryItem=(item:ItemDefinition)=>['EQUIPMENT','TREASURE'].includes(item.itemType)
export const visibleInTreasury=(item:ItemDefinition)=>isTreasuryItem(item)&&item.enabled&&!item.deletedAt
export interface TreasuryFilter {search:string;quality:number;ownedOnly:boolean}
export function treasuryHoldings(inventory:InventoryEntry[],equipment:EquippedItem[]){
 const counts:Record<number,{bag:number;equipped:number}>={}
 for(const e of inventory){counts[e.item.id]??={bag:0,equipped:0};counts[e.item.id].bag+=e.quantity}
 for(const e of equipment){counts[e.item.id]??={bag:0,equipped:0};counts[e.item.id].equipped++}
 return counts
}
export function filterTreasury(items:ItemDefinition[],filter:TreasuryFilter,holdings:ReturnType<typeof treasuryHoldings>={}){
 const search=filter.search.trim().toLocaleLowerCase()
 return items.filter(i=>visibleInTreasury(i)&&(!search||(i.name+' '+i.description).toLocaleLowerCase().includes(search))&&(!filter.quality||qualityTier(i.rarity,i.qualityTier)===filter.quality)&&(!filter.ownedOnly||((holdings[i.id]?.bag??0)+(holdings[i.id]?.equipped??0)>0)))
  .sort((a,b)=>qualityTier(b.rarity,b.qualityTier)-qualityTier(a.rarity,a.qualityTier)||b.rarity-a.rarity||a.id-b.id)
}
