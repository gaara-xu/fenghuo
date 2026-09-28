import type { LearnedSkill, SkillDefinition, SkillEffectConfig } from '../../shared/contracts.js'

export function unlockedSkillSlots(star:number,level:number):number {
  return (star===6?1:0)+(level>=5?1:0)+(star>=5&&level>=10?1:0)+(level>=15?1:0)
}

export function maxSkillSlots(star:number){return star===6?4:star===5?3:2}
export function slotUnlockLevel(star:number,slot:number){return (star===6?[1,5,10,15]:star===5?[5,10,15]:[5,15])[slot-1]??20}

export function skillConfig(raw:unknown):SkillEffectConfig {
  const value=typeof raw==='string'?JSON.parse(raw):(raw??{})
  return {base:Number(value.base??0),perLevel:Number(value.perLevel??0),ratePerLevel:Number(value.ratePerLevel??0),mode:value.mode??'BOTH'}
}

export function learnedSkill(definition:SkillDefinition,level:number,slotNo:number):LearnedSkill {
  const cfg=skillConfig(definition.effectConfig),row=definition.levels?.find(x=>x.level===level)
  const next=definition.levels?.find(x=>x.level===level+1)
  return {qualityTier:definition.qualityTier,slotNo,skillDefinitionId:definition.id,name:definition.name,level,iconKey:definition.iconKey,description:definition.description,effectType:definition.effectType,targetScope:definition.targetScope,
    triggerRate:Math.min(1,Math.max(0,definition.triggerRate+cfg.ratePerLevel*level)),effectValue:row?.effectValue??cfg.base+cfg.perLevel*level,mode:cfg.mode,maxLevel:definition.maxLevel,
    upgradeExp:next?.upgradeExp??100*(level+1),sameBookCost:next?.sameBookCost??1,nextEffectValue:level<definition.maxLevel?next?.effectValue??cfg.base+cfg.perLevel*(level+1):undefined,nextTriggerRate:level<definition.maxLevel?Math.min(1,definition.triggerRate+cfg.ratePerLevel*(level+1)):undefined}
}
