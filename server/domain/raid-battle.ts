import {type ArmyStack,type UnitLoss} from '../../shared/military.js'
import type {IncomingRaid} from '../../shared/incoming-raids.js'
import type {CombatSkill} from '../../shared/contracts.js'
import {resolveArmyCombat} from './army-battle.js'

// One deterministic casualty budget per side, then largest-remainder allocation.
// Splitting an army into many stacks cannot evade fractional losses.
export function proportionalLosses(army:ArmyStack[],ownPower:number,enemyPower:number,troopReduction=0):UnitLoss[]{
  const units=army.filter(s=>s.kind!=='HERO'&&s.quantity>0),weight=(s:ArmyStack)=>s.quantity*(s.kind==='TROOP'?1-Math.max(0,Math.min(1,troopReduction)):1),total=units.reduce((n,s)=>n+weight(s),0)
  const rate=enemyPower<=0?0:ownPower<=enemyPower?1:(enemyPower/ownPower)**2
  const budget=Math.min(total,Math.floor(total*rate+1e-9))
  const shares=units.map(s=>{const expected=total?budget*weight(s)/total:0;return {s,lost:Math.floor(expected),fraction:expected-Math.floor(expected)}})
  let remainder=budget-shares.reduce((n,s)=>n+s.lost,0)
  for(const part of [...shares].sort((a,b)=>b.fraction-a.fraction||a.s.code.localeCompare(b.s.code))){if(remainder<=0)break;if(part.lost<part.s.quantity){part.lost++;remainder--}}
  return shares.map(({s,lost})=>({code:s.code,name:s.name,sent:s.quantity,lost,remaining:s.quantity-lost}))
}
export function incomingRaidOutcome(raid:Pick<IncomingRaid,'attackPower'|'troopCount'|'attackType'|'name'>,defenders:ArmyStack[],skills:CombatSkill[]=[],seed='incoming-raid'){
  const meleeAttack=raid.attackType==='RANGED'?0:raid.attackType==='MELEE'?raid.attackPower:Math.floor(raid.attackPower/2),rangedAttack=raid.attackPower-meleeAttack
  // The raid's configured power already is its total attack, not a base value to double again.
  const attacker:ArmyStack={code:'raiders',name:raid.name,quantity:1,kind:'TROOP',stats:{meleeAttack,rangedAttack,meleeDefense:0,rangedDefense:0,speed:0,loadCapacity:0}}
  const {p,skillEvents,reductions,defenderContributions}=resolveArmyCombat([attacker],defenders,seed,{attackerTech:0,defenderTech:1,randomize:false,nodeType:'CITY_DEFENSE',defenderSkills:skills})
  const defensePower=p.defense,attackPower=p.power,result=defensePower>attackPower?'VICTORY':defensePower===attackPower?'DRAW':'DEFEAT'
  const defendingHeroes=defenderContributions.filter(s=>s.kind==='HERO').map(s=>({heroId:Number(s.code.replace('hero_','')),name:s.name,meleeDefense:s.meleeDefense,rangedDefense:s.rangedDefense}))
  return {result,baseAttackPower:raid.attackPower,attackPower,defensePower,meleeAttack:p.melee,rangedAttack:p.ranged,meleeDefense:p.dm,rangedDefense:p.dr,defendingHeroes,skillEvents,defenderLossReduction:reductions.DEFENSE,troopLosses:proportionalLosses(defenders,defensePower,attackPower,reductions.DEFENSE),attackerLosses:proportionalLosses([{...attacker,quantity:raid.troopCount}],attackPower,defensePower)}
}
