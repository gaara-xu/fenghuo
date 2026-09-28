import {armyStats,weightedDefense,type ArmyStack,type UnitLoss} from '../../shared/military.js'
import type {IncomingRaid} from '../../shared/incoming-raids.js'

// One deterministic casualty budget per side, then largest-remainder allocation.
// Splitting an army into many stacks cannot evade fractional losses.
export function proportionalLosses(army:ArmyStack[],ownPower:number,enemyPower:number):UnitLoss[]{
  const units=army.filter(s=>s.kind!=='HERO'&&s.quantity>0),total=units.reduce((n,s)=>n+s.quantity,0)
  const rate=enemyPower<=0?0:ownPower<=enemyPower?1:(enemyPower/ownPower)**2
  const budget=Math.min(total,Math.floor(total*rate+1e-9))
  const shares=units.map(s=>{const expected=total?budget*s.quantity/total:0;return {s,lost:Math.floor(expected),fraction:expected-Math.floor(expected)}})
  let remainder=budget-shares.reduce((n,s)=>n+s.lost,0)
  for(const part of [...shares].sort((a,b)=>b.fraction-a.fraction||a.s.code.localeCompare(b.s.code))){if(remainder<=0)break;if(part.lost<part.s.quantity){part.lost++;remainder--}}
  return shares.map(({s,lost})=>({code:s.code,name:s.name,sent:s.quantity,lost,remaining:s.quantity-lost}))
}
export function incomingRaidOutcome(raid:Pick<IncomingRaid,'attackPower'|'troopCount'|'attackType'|'name'>,defenders:ArmyStack[]){
  const meleeAttack=raid.attackType==='RANGED'?0:raid.attackType==='MELEE'?raid.attackPower:Math.floor(raid.attackPower/2),rangedAttack=raid.attackPower-meleeAttack
  const home=armyStats(defenders),meleeDefense=home.meleeDefense*2,rangedDefense=home.rangedDefense*2 // full technology
  const defensePower=weightedDefense(meleeAttack,rangedAttack,meleeDefense,rangedDefense)
  const attacker:ArmyStack={code:'raiders',name:raid.name,quantity:raid.troopCount,kind:'TROOP',stats:{meleeAttack:0,rangedAttack:0,meleeDefense:0,rangedDefense:0,speed:0,loadCapacity:0}}
  const result=defensePower>raid.attackPower?'VICTORY':defensePower===raid.attackPower?'DRAW':'DEFEAT'
  return {result,attackPower:raid.attackPower,defensePower,meleeAttack,rangedAttack,meleeDefense,rangedDefense,troopLosses:proportionalLosses(defenders,defensePower,raid.attackPower),attackerLosses:proportionalLosses([attacker],raid.attackPower,defensePower)}
}
