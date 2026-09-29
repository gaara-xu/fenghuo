import {describe,it,expect} from 'vitest'
import {incomingRaidOutcome,proportionalLosses} from '../server/domain/raid-battle'
import type {CombatSkill} from '../shared/contracts'
import type {ArmyStack} from '../shared/military'
const unit=(code:string,kind:ArmyStack['kind'],melee:number,ranged=melee,quantity=1):ArmyStack=>({code,name:code,kind,quantity,stats:{meleeAttack:0,rangedAttack:0,meleeDefense:melee,rangedDefense:ranged,speed:0,loadCapacity:0}})
const skill=(ownerCode:string,id:number,patch:Partial<CombatSkill>={}):CombatSkill=>({ownerCode,ownerName:ownerCode,slotNo:1,skillDefinitionId:id,name:'拯救',level:10,description:'',effectType:'DEFENSE_PERCENT',targetScope:'HERO_SELF',triggerRate:1,effectValue:100,mode:'DEFENSE',maxLevel:10,upgradeExp:0,...patch})
const raid={name:'敌军',attackType:'MELEE' as const,attackPower:1000,troopCount:100}
describe('留城武将联合防御',()=>{
 it('全部英雄加上士兵城防，满科技仅计一次，按敌军近远攻占比折算',()=>{
  const defenders=[unit('hero_1','HERO',100,20),unit('hero_2','HERO',200,40),unit('guard','TROOP',10,30,10),unit('wall','FORT',50,100,2)]
  const melee=incomingRaidOutcome(raid,defenders),ranged=incomingRaidOutcome({...raid,attackType:'RANGED'},defenders),both=incomingRaidOutcome({...raid,attackType:'BALANCED'},defenders)
  expect(melee.attackPower).toBe(1000);expect(melee.defensePower).toBe(1000);expect(ranged.defensePower).toBe(1120);expect(both.defensePower).toBe(1060)
  expect(melee.defendingHeroes).toEqual([{heroId:1,name:'hero_1',meleeDefense:200,rangedDefense:40},{heroId:2,name:'hero_2',meleeDefense:400,rangedDefense:80}]);expect(melee.troopLosses.every(l=>!l.code.startsWith('hero_'))).toBe(true)
 })
 it('每个英雄的同名自身技能各自触发，不增强另一名英雄；每英雄四技能而非全城四技能',()=>{
  const defenders=Array.from({length:6},(_,i)=>unit('hero_'+(i+1),'HERO',100))
  const out=incomingRaidOutcome(raid,defenders,defenders.map(h=>skill(h.code,1)))
  expect(out.skillEvents.filter(e=>e.triggered)).toHaveLength(6);expect(out.defensePower).toBe(1800);expect(out.defendingHeroes.every(h=>h.meleeDefense===300)).toBe(true)
  expect(out.skillEvents[0]).toMatchObject({ownerCode:'hero_1',ownerName:'hero_1',target:'hero_1'});expect(out.skillEvents[0].message).toContain('hero_1 · 拯救')
 })
 it('同名城防技能只判最高等级，城防与普通士兵、武将严格区分',()=>{
  const defenders=[unit('hero_1','HERO',100),unit('hero_2','HERO',200),unit('wall','FORT',100),unit('troop','TROOP',100)]
  const out=incomingRaidOutcome(raid,defenders,[skill('hero_1',2,{name:'同心',level:5,targetScope:'FORT_ALL',effectValue:50}),skill('hero_2',2,{name:'同心',targetScope:'FORT_ALL',effectValue:100})])
  expect(out.defensePower).toBe(1100);expect(out.skillEvents.filter(e=>e.triggered)).toHaveLength(1);expect(out.skillEvents[0]).toMatchObject({ownerCode:'hero_2',target:'wall',triggered:true});expect(out.skillEvents[1].reason).toContain('同名')
 })
 it('缴械削弱实际近攻，改变胜负和伤亡；没有近攻时不乱减远攻',()=>{
  const defenders=[unit('hero_1','HERO',300)],s=skill('hero_1',3,{name:'缴械',effectType:'ENEMY_MELEE_ATTACK_REDUCE',targetScope:'ENEMY_ONE',effectValue:50})
  expect(incomingRaidOutcome(raid,defenders).result).toBe('DEFEAT')
  const out=incomingRaidOutcome(raid,defenders,[s]);expect(out).toMatchObject({result:'VICTORY',baseAttackPower:1000,attackPower:500,defensePower:600});expect(out.skillEvents[0].triggered).toBe(true)
  const ranged=incomingRaidOutcome({...raid,attackType:'RANGED'},defenders,[s]);expect(ranged.attackPower).toBe(1000);expect(ranged.skillEvents[0].triggered).toBe(false)
 })
 it('防御战不触发进攻或PVE技能，敌军没有英雄时不生硬触发针对英雄技能',()=>{
  const out=incomingRaidOutcome(raid,[unit('hero_1','HERO',100)],[skill('hero_1',1,{mode:'ATTACK'}),skill('hero_1',2,{effectType:'PVE_EXPERIENCE'}),skill('hero_1',3,{effectType:'ATTACK_REDUCE',targetScope:'ENEMY_HERO'})])
  expect(out.skillEvents.every(e=>!e.triggered)).toBe(true);expect(out.attackPower).toBe(1000);expect(out.defensePower).toBe(200)
 })
 it('减伤技能减少普通士兵损失，不保护城防，也不把英雄删除',()=>{
  const army=[unit('guard','TROOP',.25,.25,1000),unit('fort','FORT',.25,.25,1000),unit('hero_1','HERO',0)]
  const out=incomingRaidOutcome({...raid,attackPower:100},army,[skill('hero_1',4,{name:'战争光环',effectType:'LOSS_REDUCTION',targetScope:'SELF_ALL',mode:'BOTH',effectValue:50})])
  expect(out.defenderLossReduction).toBe(.5);expect(out.troopLosses.map(l=>[l.code,l.lost])).toEqual([['guard',5],['fort',10]])
  expect(proportionalLosses(army,1000,100).map(l=>l.lost)).toEqual([10,10])
 })
 it('治疗仅在未获胜时触发，只有城防则没有士兵治疗目标',()=>{
  const s=skill('hero_1',5,{name:'治疗',effectType:'LOSS_REDUCTION_DEFEAT',targetScope:'SELF_ALL',mode:'BOTH',effectValue:30}),army=[unit('hero_1','HERO',0),unit('guard','TROOP',1,1,100)]
  expect(incomingRaidOutcome({...raid,attackPower:10},army,[s]).skillEvents[0].triggered).toBe(false)
  const lose=incomingRaidOutcome(raid,army,[s]);expect(lose.result).toBe('DEFEAT');expect(lose.troopLosses[0].remaining).toBe(30)
  expect(incomingRaidOutcome(raid,[army[0],unit('fort','FORT',1)], [s]).skillEvents[0].triggered).toBe(false)
 })
 it('概率确实生效，固定战斗种子重试不重抽，零概率不触发',()=>{
  const army=[unit('hero_1','HERO',100)],s=skill('hero_1',1,{triggerRate:.5})
  expect(incomingRaidOutcome(raid,army,[s],'raid:1')).toEqual(incomingRaidOutcome(raid,army,[s],'raid:1'))
  const results=new Set(Array.from({length:50},(_,i)=>incomingRaidOutcome(raid,army,[s],'raid:'+i).skillEvents[0].triggered));expect([...results].sort()).toEqual([false,true])
  expect(incomingRaidOutcome(raid,army,[{...s,triggerRate:0}]).skillEvents[0].triggered).toBe(false)
 })
})
