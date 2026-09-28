import { SeededRandom } from './random.js'
import type { LearnedSkill,SkillEvent } from '../../shared/contracts.js'
import { effectLabels,label } from '../../shared/labels.js'

export interface HeroCombatStats { level:number;meleeAttack:number;rangedAttack:number;meleeDefense:number;rangedDefense:number }

export function heroPower(hero:HeroCombatStats):number{
  // 单英雄战斗适配：满级科技按基础攻击 +100% 计算；防御不能冒充攻击。
  return Math.round((hero.meleeAttack+hero.rangedAttack)*2)
}

export interface BattleOptions {attackerSkills?:LearnedSkill[];defenderSkills?:LearnedSkill[];nodeType?:string;enemyHasFort?:boolean;enemyHasHero?:boolean;hasOwnFort?:boolean;ownCultureBonus?:number;enemyCultureBonus?:number;ownClanBonus?:number;enemyClanBonus?:number;enemyTechDefense?:number;hasTroops?:boolean;captureChance?:number;storageCapacity?:number;familyBattle?:boolean}
export function battleOutcome(hero:HeroCombatStats,enemyPower:number,seed:string,options:BattleOptions={}){
  const random=new SeededRandom(seed),basePower=heroPower(hero),skillEvents:SkillEvent[]=[]
  let enemyRoll=Math.round(enemyPower*(0.88+random.next()*0.24)),meleeBonus=1,rangedBonus=1,experienceBonus=0,lossReduction=0,captureBonus=0,escaped=false,storageIgnore=0,storageBonus=0,protectedResources=false
  const auxiliaries=['ESCAPE_CAPTURE','CAPTURE_BONUS','LOSS_REDUCTION','LOSS_REDUCTION_DEFEAT','PROTECT_RESOURCES','IGNORE_STORAGE','STORAGE_BONUS','PVE_EXPERIENCE']
  const pve=['OUTPOST','WILD','DUNGEON'].includes(options.nodeType??'OUTPOST')
  for(const side of ['ATTACK','DEFENSE'] as const){
    const skills=side==='ATTACK'?options.attackerSkills:options.defenderSkills,seen=new Set<number>();let count=0,captured:boolean|undefined
    for(const s of [...(skills??[])].sort((a,b)=>Number(auxiliaries.includes(a.effectType))-Number(auxiliaries.includes(b.effectType))||b.level-a.level||a.slotNo-b.slotNo)){
      let reason=''
      const attacks=['ATTACK_PERCENT','MELEE_ATTACK_PERCENT','RANGED_ATTACK_PERCENT','TECH_ATTACK_PERCENT','DEFENSE_REDUCE','MELEE_DEFENSE_REDUCE','RANGED_DEFENSE_REDUCE','IGNORE_DEFENSE','ALL_STATS_PERCENT','ENEMY_ALL_STATS_REDUCE','CULTURE_BONUS','CULTURE_REDUCE','ENEMY_TECH_DEFENSE_REDUCE','CLAN_ATTACK_PERCENT','ENEMY_CLAN_DEFENSE_REDUCE','PVE_ATTACK_PERCENT','PVE_DEFENSE_REDUCE',...auxiliaries]
      const defenses=['ENEMY_MELEE_ATTACK_REDUCE','ENEMY_RANGED_ATTACK_REDUCE','ATTACK_REDUCE','MELEE_DEFENSE_PERCENT','RANGED_DEFENSE_PERCENT','DEFENSE_PERCENT','ALL_STATS_PERCENT','ENEMY_ALL_STATS_REDUCE','CULTURE_BONUS','CULTURE_REDUCE','TECH_DEFENSE_PERCENT','ENEMY_TECH_ATTACK_REDUCE','CLAN_DEFENSE_PERCENT','ENEMY_CLAN_ATTACK_REDUCE',...auxiliaries]
      const attackPower=()=>Math.round(hero.meleeAttack*Math.max(0,1+meleeBonus)+hero.rangedAttack*Math.max(0,1+rangedBonus))
      const won=side==='ATTACK'?attackPower()>=enemyRoll:attackPower()<enemyRoll
      if(options.familyBattle)reason='家族战场中英雄技能无效'
      else if(seen.has(s.skillDefinitionId))reason='同名技能本方只判定一次'
      else if(count>=4)reason='本方已触发四个技能'
      else if(s.mode!=='BOTH'&&s.mode!==side)reason=side==='ATTACK'?'仅防守时生效':'仅进攻时生效'
      else if(!(side==='ATTACK'?attacks:defenses).includes(s.effectType))reason='本次战斗没有适用效果'
      else if(s.targetScope.startsWith('ENEMY_FORT')&&!options.enemyHasFort||s.targetScope.startsWith('FORT_')&&!options.hasOwnFort)reason='本场没有相应城防目标'
      else if(s.targetScope==='ENEMY_HERO'&&!options.enemyHasHero)reason='本场没有敌方英雄'
      else if(s.effectType.startsWith('PVE_')&&!pve)reason='仅据点、野地、副本战斗生效'
      else if(['CULTURE_BONUS','CULTURE_REDUCE'].includes(s.effectType)&&!(s.effectType==='CULTURE_BONUS'?options.ownCultureBonus:options.enemyCultureBonus))reason='本场没有对应文韬武略加成'
      else if(s.effectType.includes('CLAN')&&!(s.effectType.startsWith('ENEMY_')?options.enemyClanBonus:options.ownClanBonus))reason='本场没有对应家族加成'
      else if(s.effectType==='ENEMY_TECH_DEFENSE_REDUCE'&&!options.enemyTechDefense)reason='敌军没有护甲科技加成'
      else if(s.effectType.startsWith('LOSS_')&&!options.hasTroops)reason='本场没有普通士兵伤亡'
      else if(s.effectType==='LOSS_REDUCTION_DEFEAT'&&won)reason='战败后才生效'
      else if(['ESCAPE_CAPTURE','CAPTURE_BONUS'].includes(s.effectType)&&!options.captureChance)reason='本场没有英雄俘虏判定'
      else if(s.effectType==='CAPTURE_BONUS'&&!won)reason='获胜后才判定俘虏'
      else if(s.effectType==='ESCAPE_CAPTURE'&&won)reason='未被俘虏，无需遁走'
      else if(s.effectType==='ESCAPE_CAPTURE'&&!(captured??=random.next()<(options.captureChance??0)))reason='未发生俘虏，无需遁走'
      else if(['PROTECT_RESOURCES','STORAGE_BONUS'].includes(s.effectType)&&(side!=='DEFENSE'||won))reason='守城失败后才生效'
      else if(s.effectType==='IGNORE_STORAGE'&&(side!=='ATTACK'||!won))reason='进攻胜利后才生效'
      else if(['PROTECT_RESOURCES','STORAGE_BONUS','IGNORE_STORAGE'].includes(s.effectType)&&(pve||options.storageCapacity==null))reason='本场不是有密库的城池掠夺战'
      else if(s.effectType.includes('MELEE')&&hero.meleeAttack===0)reason='没有近战攻击目标'
      else if(s.effectType.includes('RANGED')&&hero.rangedAttack===0)reason='没有远程攻击目标'
      else if(random.next()>=s.triggerRate)reason='本次未触发'
      seen.add(s.skillDefinitionId)
      const triggered=!reason,value=s.effectValue/100
      if(triggered){
        count++
        switch(s.effectType){
          case 'ATTACK_PERCENT':case 'TECH_ATTACK_PERCENT':case 'PVE_ATTACK_PERCENT':meleeBonus+=value;rangedBonus+=value;break
          case 'ALL_STATS_PERCENT':if(side==='ATTACK'){meleeBonus+=value;rangedBonus+=value}else enemyRoll=Math.round(enemyRoll*(1+value));break
          case 'MELEE_ATTACK_PERCENT':meleeBonus+=value;break
          case 'RANGED_ATTACK_PERCENT':rangedBonus+=value;break
          case 'ENEMY_MELEE_ATTACK_REDUCE':meleeBonus-=value;break
          case 'ENEMY_RANGED_ATTACK_REDUCE':rangedBonus-=value;break
          case 'ATTACK_REDUCE':case 'ENEMY_TECH_ATTACK_REDUCE':meleeBonus-=value;rangedBonus-=value;break
          case 'ENEMY_ALL_STATS_REDUCE':if(side==='ATTACK')enemyRoll=Math.round(enemyRoll*Math.max(0,1-value));else{meleeBonus-=value;rangedBonus-=value}break
          case 'DEFENSE_REDUCE':case 'IGNORE_DEFENSE':case 'PVE_DEFENSE_REDUCE':enemyRoll=Math.round(enemyRoll*Math.max(0,1-value));break
          case 'MELEE_DEFENSE_REDUCE':enemyRoll=Math.round(enemyRoll*(1-value*hero.meleeAttack/Math.max(1,hero.meleeAttack+hero.rangedAttack)));break
          case 'RANGED_DEFENSE_REDUCE':enemyRoll=Math.round(enemyRoll*(1-value*hero.rangedAttack/Math.max(1,hero.meleeAttack+hero.rangedAttack)));break
          case 'DEFENSE_PERCENT':case 'TECH_DEFENSE_PERCENT':enemyRoll=Math.round(enemyRoll*(1+value));break
          case 'MELEE_DEFENSE_PERCENT':enemyRoll=Math.round(enemyRoll*(1+value*hero.meleeAttack/Math.max(1,hero.meleeAttack+hero.rangedAttack)));break
          case 'RANGED_DEFENSE_PERCENT':enemyRoll=Math.round(enemyRoll*(1+value*hero.rangedAttack/Math.max(1,hero.meleeAttack+hero.rangedAttack)));break
          case 'CULTURE_BONUS':case 'CLAN_ATTACK_PERCENT':case 'CLAN_DEFENSE_PERCENT':{const add=value*(s.effectType==='CULTURE_BONUS'?options.ownCultureBonus??0:options.ownClanBonus??0);if(side==='ATTACK'){meleeBonus+=add;rangedBonus+=add}else enemyRoll=Math.round(enemyRoll*(1+add));break}
          case 'CULTURE_REDUCE':case 'ENEMY_CLAN_DEFENSE_REDUCE':case 'ENEMY_CLAN_ATTACK_REDUCE':case 'ENEMY_TECH_DEFENSE_REDUCE':{const reduce=value*(s.effectType==='CULTURE_REDUCE'?options.enemyCultureBonus??0:s.effectType==='ENEMY_TECH_DEFENSE_REDUCE'?options.enemyTechDefense??0:options.enemyClanBonus??0);if(side==='ATTACK')enemyRoll=Math.round(enemyRoll*Math.max(0,1-reduce));else{meleeBonus-=reduce;rangedBonus-=reduce}break}
          case 'PVE_EXPERIENCE':experienceBonus+=value;break
          case 'LOSS_REDUCTION':case 'LOSS_REDUCTION_DEFEAT':lossReduction=Math.min(1,lossReduction+value);break
          case 'CAPTURE_BONUS':captureBonus+=value;break
          case 'ESCAPE_CAPTURE':escaped=true;break
          case 'IGNORE_STORAGE':storageIgnore=Math.max(storageIgnore,value);break
          case 'STORAGE_BONUS':storageBonus+=value;break
          case 'PROTECT_RESOURCES':protectedResources=true;break
        }
      }
      const target=s.effectType.includes('MELEE')?'近战部队':s.effectType.includes('RANGED')?'远程部队':'全军'
      skillEvents.push({name:s.name,level:s.level,side,triggered,reason,effectValue:s.effectValue,triggerRate:s.triggerRate,target,message:triggered?`${s.name}（${s.level}级）发动：${label(effectLabels,s.effectType)} ${s.effectValue}%`:`${s.name}：${reason}`})
    }
  }
  const power=Math.round(hero.meleeAttack*Math.max(0,1+meleeBonus)+hero.rangedAttack*Math.max(0,1+rangedBonus))
  return {victory:power>=enemyRoll,basePower,heroPower:power,enemyRoll,skillEvents,experienceBonus,lossReduction,captureChance:Math.min(1,(options.captureChance??0)*(1+captureBonus)),escaped,storageIgnore,storageBonus,protectedResources}
}
