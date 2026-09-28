import type {InventoryEntry,ItemDefinition} from './items.js'
export type SalvageTarget={kind:'STACK';itemId:number;quantity:number}|{kind:'INSTANCE';instanceId:number}
export const salvageRules={maxPieces:1000,advancedChance:.1} as const
export function salvageReward(star:number,level:number,quantity:number,random:()=>number){
  let advanced=0;for(let i=0;i<quantity;i++)if(random()<salvageRules.advancedChance)advanced++
  return {common:(Math.max(1,star)+level)*quantity,advanced}
}
export function salvageBlockReason(entry:InventoryEntry){
  if(entry.item.itemType!=='EQUIPMENT')return '只能分解装备'
  if(!entry.item.enabled||entry.item.deletedAt)return '物品已停用'
  if(entry.gear?.gems.length)return '请先免费取出宝石'
  return entry.quantity>0?'':'包裹中没有此装备'
}
export const advancedRefineStone:Omit<ItemDefinition,'id'>={code:'refine_advanced',name:'高级精炼石',itemType:'MATERIAL',rarity:4,qualityTier:5,enabled:true,description:'用于精炼装备或宝物，本次精炼成功率额外增加10个百分点，最高100%。每次消耗一枚，失败仍可能降级。分解装备时有机会获得。',effectConfig:{sourceStatus:'DIY'}}
