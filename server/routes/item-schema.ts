import {z} from 'zod'
import {equipmentSlots,itemTypes} from '../../shared/items.js'
import {statLabels} from '../../shared/hero-growth.js'
const slot=z.enum(Object.keys(equipmentSlots) as (keyof typeof equipmentSlots)[])
const stat=z.enum(Object.keys(statLabels) as (keyof typeof statLabels)[])
const bonuses=z.partialRecord(stat,z.number().min(0).max(1000))
export const itemSchema=z.object({
 code:z.string().min(1).max(64),name:z.string().trim().min(1).max(64),itemType:z.enum(Object.keys(itemTypes) as (keyof typeof itemTypes)[]),rarity:z.number().int().min(1).max(6),qualityTier:z.number().int().min(1).max(7),description:z.string().max(4000),enabled:z.boolean(),
 effectConfig:z.object({
  refineMultipliers:z.array(z.number().min(0).max(10000)).length(10).refine(v=>v[0]===1&&v.every((n,i)=>i===0||n>=v[i-1]),'逐级精炼倍率须从1开始且不递减').optional(),
  kind:z.enum(['TALENT','EXPERIENCE','STAMINA','RENAME']).optional(),amount:z.number().int().min(1).max(1000000).optional(),slot:slot.optional(),bonuses:bonuses.optional(),flatBonuses:z.partialRecord(stat,z.number().min(0).max(10000000)).optional(),
  setCode:z.string().max(64).optional(),setBonuses:z.array(z.object({count:z.number().int().min(1).max(13),bonuses})).max(13).optional(),
  icon:z.string().regex(/^\/art\/[a-zA-Z0-9_/-]+\.(png|jpg|webp|svg|gif)$/).optional(),requiredStrength:z.number().int().min(0).max(1000).optional(),refineStep:z.number().min(0).max(10).optional(),initialSockets:z.number().int().min(0).max(3).optional(),
  gemFamily:z.string().regex(/^[a-z][a-z0-9_]{0,31}$/).optional(),gemLevel:z.number().int().min(1).max(8).optional(),gemBonuses:z.partialRecord(stat,z.number().min(0).max(100000000)).optional(),gemStat:stat.optional(),gemAmount:z.number().min(0).max(100000000).optional(),gemSlots:z.array(slot).optional(),sourceUrl:z.string().url().optional(),sourceStatus:z.enum(['VERIFIED','ESTIMATED','DIY']).optional(),
  talentWeights:z.record(z.enum(['MEDIOCRE','COMMON','GOOD','EXCELLENT','PERFECT']),z.number().int().min(0).max(100000)).refine(w=>Object.values(w).some(n=>n>0)).optional(),
 })
}).refine(i=>i.itemType!=='EQUIPMENT'||Boolean(i.effectConfig.slot&&!i.effectConfig.slot.startsWith('TREASURE_'))).refine(i=>i.itemType!=='CONSUMABLE'||Boolean(i.effectConfig.kind&&(['TALENT','RENAME'].includes(i.effectConfig.kind)||i.effectConfig.amount)))
