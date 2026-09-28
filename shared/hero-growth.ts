import type { TalentGrade } from './contracts.js'

export const statLabels = {meleeAttack:'近攻',rangedAttack:'远攻',meleeDefense:'近防',rangedDefense:'远防',speed:'速度',loadCapacity:'负重'} as const
export type StatKey = keyof typeof statLabels
export type HeroStats = Record<StatKey,number>
export interface GrowthRules { combatRate:number; loadRate:number; speedRate:number; starFactors:number[]; talentFactors:Record<TalentGrade,number>; sourceStatus:'ESTIMATED'|'DIY' }
// 旧版星级/天赋影响成长的机制可考证，完整逐级表未找到。此曲线为单机适配，不能标作原版实测。
export const defaultGrowth:GrowthRules={combatRate:0.1,loadRate:0.02,speedRate:0,starFactors:[0.6,0.7,0.8,0.9,1,1.1],talentFactors:{MEDIOCRE:0.6,COMMON:0.7,GOOD:0.8,EXCELLENT:0.9,PERFECT:1},sourceStatus:'ESTIMATED'}
export function growStats(base:HeroStats,star:number,talent:TalentGrade,level:number,rules:GrowthRules=defaultGrowth,bonus:Partial<HeroStats>={}):HeroStats{
  const l=Math.max(1,Math.min(20,Math.trunc(level))),quality=rules.starFactors[Math.max(0,Math.min(5,star-1))]*rules.talentFactors[talent]
  return Object.fromEntries((Object.keys(statLabels) as StatKey[]).map(key=>{
    const factor=key==='speed'?1+(l-1)*rules.speedRate:key==='loadCapacity'?1+(l-1)*rules.loadRate*quality:1+(l*l-1)*rules.combatRate*quality
    // 保持原本为零的攻击通道，不把纯近战武将升级成双攻武将。
    return [key,Math.round(base[key]*factor*(1+(bonus[key]??0)/100))]
  })) as HeroStats
}
