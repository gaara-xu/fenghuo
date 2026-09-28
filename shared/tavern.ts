import type { ItemDefinition } from './items.js'
import { qualityTier } from './quality.js'

export const treasureItemTypes = ['EQUIPMENT','TREASURE','CONSUMABLE','MATERIAL'] as const
export function eligibleTreasureItem(item:ItemDefinition):boolean {
  return item.enabled && !item.deletedAt && (treasureItemTypes as readonly string[]).includes(item.itemType)
}
// Per-item weights, not a claim about the historical game's drop rates.
export function treasureWeight(item:Pick<ItemDefinition,'rarity'|'qualityTier'>):number {
  return [0,600,400,250,120,45,10,1][qualityTier(item.rarity,item.qualityTier)]!
}
export const currencyNames={food:'粮食',wood:'木材',stone:'石料',iron:'铁矿',gold:'金',coupon:'礼券'}
