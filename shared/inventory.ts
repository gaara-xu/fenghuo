import type {ItemDefinition} from './items.js'
export const bagCategories={EQUIPMENT:'装备',SKILL_BOOK:'技能书',TREASURE:'宝物',CONSUMABLE:'消耗品'} as const
export type BagCategory=keyof typeof bagCategories
export function bagCategory(item:ItemDefinition):BagCategory {return item.itemType==='MATERIAL'?'CONSUMABLE':item.itemType}
