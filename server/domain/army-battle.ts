import type {CombatSkill,SkillEvent} from '../../shared/contracts.js'
import {armyStats,weightedDefense,type ArmyStack,type UnitLoss} from '../../shared/military.js'
import {SeededRandom} from './random.js'
import {effectLabels,label} from '../../shared/labels.js'
type Combat=ArmyStack&{bonus:{meleeAttack:number;rangedAttack:number;meleeDefense:number;rangedDefense:number}}
const combat=(army:ArmyStack[],tech:number):Combat[]=>army.filter(s=>s.quantity>0).map(s=>({...s,stats:{...s.stats},bonus:{meleeAttack:tech,rangedAttack:tech,meleeDefense:tech,rangedDefense:tech}}))
const sum=(army:Combat[],key:keyof Combat['bonus'])=>army.reduce((n,s)=>n+s.quantity*s.stats[key]*Math.max(0,1+s.bonus[key]),0)
const auxiliary=new Set(['LOSS_REDUCTION','LOSS_REDUCTION_DEFEAT','PVE_EXPERIENCE','ESCAPE_CAPTURE','CAPTURE_BONUS','PROTECT_RESOURCES','IGNORE_STORAGE','STORAGE_BONUS'])
export interface ArmyBattleOptions {attackerSkills?:CombatSkill[];defenderSkills?:CombatSkill[];nodeType?:string;attackerTech?:number;defenderTech?:number;randomize?:boolean}
export function resolveArmyCombat(attackers:ArmyStack[],defenders:ArmyStack[],seed:string,options:ArmyBattleOptions={}){
 const random=new SeededRandom(seed),a=combat(attackers,options.attackerTech??1),d=combat(defenders,options.defenderTech??0),roll=options.randomize===false?1:.88+random.next()*.24
 const basePower=sum(a,'meleeAttack')+sum(a,'rangedAttack'),skillEvents:SkillEvent[]=[],seen={ATTACK:new Set<string>(),DEFENSE:new Set<string>()},triggered=new Map<string,number>(),reductions={ATTACK:0,DEFENSE:0}
 let experienceBonus=0
 const pve=['OUTPOST','WILD','DUNGEON'].includes(options.nodeType??'OUTPOST')
 const powers=()=>{const melee=sum(a,'meleeAttack'),ranged=sum(a,'rangedAttack'),dm=sum(d,'meleeDefense')*roll,dr=sum(d,'rangedDefense')*roll;return {melee,ranged,dm,dr,power:melee+ranged,defense:weightedDefense(melee,ranged,dm,dr)}}
 function targets(s:CombatSkill,side:'ATTACK'|'DEFENSE'){
  const own=side==='ATTACK'?a:d,enemy=side==='ATTACK'?d:a,scope=s.targetScope
  let pool:Combat[]=scope.startsWith('ENEMY_FORT')?enemy.filter(x=>x.kind==='FORT'):scope.startsWith('FORT_')?own.filter(x=>x.kind==='FORT'):scope==='ENEMY_HERO'?enemy.filter(x=>x.kind==='HERO'):scope==='HERO_SELF'?own.filter(x=>x.kind==='HERO'&&(!s.ownerCode||x.code===s.ownerCode)):scope.startsWith('ENEMY')?enemy.filter(x=>x.kind!=='FORT'):own.filter(x=>x.kind!=='FORT')
  // Single-unit-type skills select one eligible troop type, not the entire mixed army.
  if(scope.endsWith('_ONE')){const troops=pool.filter(x=>x.kind==='TROOP');if(troops.length)pool=troops;const channel=s.effectType.includes('MELEE')?'melee':s.effectType.includes('RANGED')?'ranged':null;if(channel){const key=`${channel}${s.effectType.includes('DEFENSE')?'Defense':'Attack'}` as keyof Combat['bonus'];pool=pool.filter(x=>x.stats[key]>0)}return pool.length?[pool[Math.floor(random.next()*pool.length)]]:[]}
  return pool
 }
 function run(s:CombatSkill,side:'ATTACK'|'DEFENSE',aux:boolean){
  let reason='',changed=false;const effect=s.effectType,value=s.effectValue/100,t=targets(s,side),own=side==='ATTACK'?a:d,enemy=side==='ATTACK'?d:a
  const caster=side+':'+(s.ownerCode??'army'),key=String(s.skillDefinitionId)+(s.targetScope==='HERO_SELF'&&s.ownerCode?':'+s.ownerCode:'')
  const winning=side==='ATTACK'?powers().power>=powers().defense:powers().power<powers().defense
  if(s.ownerCode&&!own.some(x=>x.code===s.ownerCode&&x.kind==='HERO'))reason='施放武将不在本场战斗'
  else if(seen[side].has(key))reason='同名技能本方只判定一次'
  else if((triggered.get(caster)??0)>=4)reason=s.ownerCode?'该武将已触发四个技能':'本方已触发四个技能'
  else if(s.mode!=='BOTH'&&s.mode!==side)reason=side==='ATTACK'?'仅防守时生效':'仅进攻时生效'
  else if(effect.startsWith('PVE_')&&!pve)reason='仅据点、野地、副本战斗生效'
  else if(effect.includes('CLAN')||effect.startsWith('CULTURE'))reason='本场没有对应家族或文韬武略加成'
  else if(['ESCAPE_CAPTURE','CAPTURE_BONUS'].includes(effect))reason='本场没有英雄俘虏判定'
  else if(['PROTECT_RESOURCES','IGNORE_STORAGE','STORAGE_BONUS'].includes(effect))reason='本场没有密库掠夺判定'
  else if(effect.startsWith('LOSS_')&&!own.some(x=>x.kind==='TROOP'))reason='本场没有普通士兵伤亡'
  else if(effect==='LOSS_REDUCTION_DEFEAT'&&winning)reason='战败后才生效'
  else if(!aux&&!t.length)reason='本场没有对应目标'
  else if(random.next()>=s.triggerRate)reason='本次未触发'
  seen[side].add(key)
  const add=(pool:Combat[],keys:(keyof Combat['bonus'])[],n:number)=>{for(const x of pool)for(const k of keys)if(x.stats[k]>0){x.bonus[k]+=n;changed=true}}
  if(!reason){
   switch(effect){
    case 'MELEE_ATTACK_PERCENT':add(t,['meleeAttack'],value);break
    case 'RANGED_ATTACK_PERCENT':add(t,['rangedAttack'],value);break
    case 'ATTACK_PERCENT':case 'TECH_ATTACK_PERCENT':case 'PVE_ATTACK_PERCENT':add(t,['meleeAttack','rangedAttack'],value);break
    case 'ALL_STATS_PERCENT':add(t,side==='ATTACK'?['meleeAttack','rangedAttack']:['meleeDefense','rangedDefense'],value);break
    case 'MELEE_DEFENSE_PERCENT':add(t,['meleeDefense'],value);break
    case 'RANGED_DEFENSE_PERCENT':add(t,['rangedDefense'],value);break
    case 'DEFENSE_PERCENT':case 'TECH_DEFENSE_PERCENT':add(t,['meleeDefense','rangedDefense'],value);break
    case 'MELEE_DEFENSE_REDUCE':add(t,['meleeDefense'],-value);break
    case 'RANGED_DEFENSE_REDUCE':add(t,['rangedDefense'],-value);break
    case 'DEFENSE_REDUCE':case 'IGNORE_DEFENSE':case 'PVE_DEFENSE_REDUCE':add(t,['meleeDefense','rangedDefense'],-value);break
    case 'ENEMY_MELEE_ATTACK_REDUCE':add(t,['meleeAttack'],-value);break
    case 'ENEMY_RANGED_ATTACK_REDUCE':add(t,['rangedAttack'],-value);break
    case 'ATTACK_REDUCE':add(t,['meleeAttack','rangedAttack'],-value);break
    case 'ENEMY_ALL_STATS_REDUCE':add(t,side==='ATTACK'?['meleeDefense','rangedDefense']:['meleeAttack','rangedAttack'],-value);break
    case 'ENEMY_TECH_ATTACK_REDUCE':case 'ENEMY_TECH_DEFENSE_REDUCE':{const tech=side==='DEFENSE'?options.attackerTech??1:options.defenderTech??0;if(tech)add(enemy.filter(x=>x.kind!=='FORT'),side==='DEFENSE'?['meleeAttack','rangedAttack']:['meleeDefense','rangedDefense'],-value*tech);break}
    case 'LOSS_REDUCTION':case 'LOSS_REDUCTION_DEFEAT':reductions[side]=Math.min(1,reductions[side]+value);changed=true;break
    case 'PVE_EXPERIENCE':experienceBonus+=value;changed=true;break
   }
   if(!changed)reason='本场没有可增强或削弱的对应属性'
  }
  if(!reason)triggered.set(caster,(triggered.get(caster)??0)+1)
  const target=aux?'战后结算':t.map(x=>x.name).join('、')
  skillEvents.push({name:s.name,level:s.level,side,triggered:!reason,reason,effectValue:s.effectValue,triggerRate:s.triggerRate,target,...(s.ownerCode?{ownerCode:s.ownerCode,ownerName:s.ownerName}:{}),message:(s.ownerName?s.ownerName+' · ':'')+(reason?`${s.name}：${reason}`:`${s.name}（${s.level}级）发动：${target} ${label(effectLabels,effect)} ${s.effectValue}%`)})
 }
 for(const aux of [false,true])for(const side of ['ATTACK','DEFENSE'] as const)for(const s of [...(side==='ATTACK'?options.attackerSkills??[]:options.defenderSkills??[])].sort((x,y)=>y.level-x.level||x.slotNo-y.slotNo))if(auxiliary.has(s.effectType)===aux)run(s,side,aux)
 const p=powers(),defenderContributions=d.map(s=>({code:s.code,name:s.name,kind:s.kind,meleeDefense:s.quantity*s.stats.meleeDefense*Math.max(0,1+s.bonus.meleeDefense)*roll,rangedDefense:s.quantity*s.stats.rangedDefense*Math.max(0,1+s.bonus.rangedDefense)*roll}))
 return {p,basePower,skillEvents,experienceBonus,reductions,defenderContributions,random}
}
export function armyBattleOutcome(attackers:ArmyStack[],defenders:ArmyStack[],seed:string,options:ArmyBattleOptions={}){
 const {p,basePower,skillEvents,experienceBonus,reductions,random}=resolveArmyCombat(attackers,defenders,seed,options),victory=p.power>=p.defense&&p.power>0
 // No original loss/armour table was located; deterministic ratio curve is isolated here for calibration.
 const ratio=p.power>0?p.defense/p.power:Infinity,attackLoss=Math.min(1,Math.pow(ratio,1.5))*(1-reductions.ATTACK),defenseLoss=Math.min(1,Math.pow(1/Math.max(ratio,.000001),1.5))*(1-reductions.DEFENSE)
 function losses(army:ArmyStack[],rate:number):UnitLoss[]{return army.filter(s=>s.kind!=='HERO').map(s=>{const expected=s.quantity*rate,lost=Math.min(s.quantity,Math.floor(expected)+(random.next()<expected%1?1:0));return {code:s.code,name:s.name,sent:s.quantity,lost,remaining:s.quantity-lost}})}
 const troopLosses=losses(attackers,attackLoss),defenderLosses=losses(defenders,defenseLoss)
 const survivors=attackers.filter(s=>s.kind==='TROOP').map(s=>({...s,quantity:troopLosses.find(l=>l.code===s.code)?.remaining??s.quantity}))
 return {victory,basePower,heroPower:Math.round(p.power),enemyRoll:Math.round(p.defense),meleeAttack:Math.round(p.melee),rangedAttack:Math.round(p.ranged),meleeDefense:Math.round(p.dm),rangedDefense:Math.round(p.dr),skillEvents,experienceBonus,lossReduction:reductions.ATTACK,troopLosses,defenderLosses,survivors,loadCapacity:armyStats([...attackers.filter(s=>s.kind==='HERO'),...survivors]).loadCapacity}
}
