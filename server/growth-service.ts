import type { Pool,PoolConnection,RowDataPacket } from 'mysql2/promise'
import { getPool,inTransaction } from './db.js'
import { defaultGrowth,growStats,type GrowthRules,type HeroStats } from '../shared/hero-growth.js'
export async function getGrowthRules(c:Pool|PoolConnection=getPool()):Promise<GrowthRules>{
  const [rows]=await c.query<RowDataPacket[]>("SELECT setting_value FROM game_settings WHERE setting_key='hero_growth_rules'")
  return rows[0]?JSON.parse(rows[0].setting_value):structuredClone(defaultGrowth)
}
export async function saveGrowthRules(rules:GrowthRules){await inTransaction(async c=>{
  const before=await getGrowthRules(c)
  await c.execute("INSERT INTO game_settings (setting_key,setting_value,value_type,description) VALUES ('hero_growth_rules',?,'JSON','武将成长；数值为估算或自定义，不声称原版逐级表') ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)",[JSON.stringify(rules)])
  await c.execute("INSERT INTO admin_audit_logs (action,entity_type,before_json,after_json) VALUES ('UPDATE','HERO_GROWTH',?,?)",[JSON.stringify(before),JSON.stringify(rules)])
})}
export function statsFromRow(row:RowDataPacket,rules:GrowthRules,level=Number(row.hero_level??row.level),bonus:Partial<HeroStats>={},flat:Partial<HeroStats>={}){
  const base:HeroStats={meleeAttack:Number(row.melee_attack),rangedAttack:Number(row.ranged_attack),meleeDefense:Number(row.melee_defense),rangedDefense:Number(row.ranged_defense),speed:Number(row.speed),loadCapacity:Number(row.load_capacity)}
  const grown=growStats(base,Number(row.star),row.talent_grade,level,rules)
  return Object.fromEntries(Object.entries(grown).map(([key,value])=>{const k=key as keyof HeroStats;return [key,Math.round((value+(flat[k]??0))*(1+(bonus[k]??0)/100))]})) as HeroStats
}
