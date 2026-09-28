import {describe,it,expect} from 'vitest'
import {defaultGrowth,growStats} from '../shared/hero-growth'
import {equipmentBonuses,type DropPool,type ItemDefinition,type EquipmentSlot} from '../shared/items'
import {officialSkills} from '../shared/skill-catalog'
import {battleOutcome} from '../server/domain/battle'
import {learnedSkill,maxSkillSlots,unlockedSkillSlots} from '../server/domain/skills'
import {rollLoot} from '../server/item-service'
import {carriedRewards} from '../server/domain/rewards'
import type {LearnedSkill,SkillDefinition} from '../shared/contracts'
const base={meleeAttack:2187,rangedAttack:0,meleeDefense:4375,rangedDefense:4375,speed:5000,loadCapacity:50000}
function skill(code:string):LearnedSkill{const row=officialSkills.find(s=>s[0]===code)!;return learnedSkill({id:officialSkills.indexOf(row)+1,name:row[1],effectType:row[2],targetScope:row[3],triggerRate:row[5]/100,maxLevel:10,effectConfig:{base:row[6],perLevel:0,ratePerLevel:0,mode:row[4]}} as SkillDefinition,10,1)}
describe('英雄真实成长与技能目录',()=>{
  it('每级提高战斗属性；零攻击通道保留；默认速度不受等级天赋影响',()=>{for(let level=1;level<20;level++){const now=growStats(base,6,'GOOD',level),next=growStats(base,6,'GOOD',level+1);expect(next.meleeAttack).toBeGreaterThan(now.meleeAttack);expect(next.loadCapacity).toBeGreaterThan(now.loadCapacity);expect(next.rangedAttack).toBe(0);expect(next.speed).toBe(5000)}})
  it('同基础下高星、高天赋成长更高，洗天赋重新计算当前等级',()=>{expect(growStats(base,6,'PERFECT',10).meleeAttack).toBeGreaterThan(growStats(base,6,'COMMON',10).meleeAttack);expect(growStats(base,6,'COMMON',10).meleeAttack).toBeGreaterThan(growStats(base,3,'COMMON',10).meleeAttack);expect(growStats(base,6,'PERFECT',1)).toEqual(base)})
  it('预览和战斗使用同一组派生数值',()=>{const a=battleOutcome({...growStats(base,6,'GOOD',5),level:5},10000,'x'),b=battleOutcome({...growStats(base,6,'GOOD',6),level:6},10000,'x');expect(b.basePower).toBeGreaterThan(a.basePower)})
  it('装备百分比与青铜最高档套装效果生效、不叠加档次',()=>{const slots:EquipmentSlot[]=['HELMET','SHOULDER','ARMOR','LEGS','BOOTS','NECKLACE','BRACELET','RING','BRACELET_2','RING_2'];const equipment=slots.map((slot,i)=>({heroId:1,slot,item:{id:i,effectConfig:{setCode:'BRONZE',bonuses:{meleeDefense:1}}} as ItemDefinition}));expect(equipmentBonuses(equipment).meleeDefense).toBe(35);expect(equipmentBonuses(equipment.slice(0,8)).meleeDefense).toBe(18);expect(equipmentBonuses(equipment.slice(0,5)).meleeDefense).toBe(12)})
  it('搬运量受成长后的负重限制，金币独立计算',()=>expect(carriedRewards({food:500,wood:500,gold:100},200)).toEqual({food:100,wood:100,gold:100}))
  it('星级容量分别为2/3/4，六星15级四槽、五星10级两槽',()=>{expect([3,5,6].map(maxSkillSlots)).toEqual([2,3,4]);expect(unlockedSkillSlots(6,15)).toBe(4);expect(unlockedSkillSlots(5,10)).toBe(2)})
  it('官方44项无重复，关键修正与官方满级相符',()=>{expect(officialSkills).toHaveLength(44);expect(new Set(officialSkills.map(s=>s[0])).size).toBe(44);expect(skill('fushi').mode).toBe('ATTACK');expect(skill('fushi').effectValue).toBe(70);expect(skill('jiaoxie').effectType).toBe('ENEMY_MELEE_ATTACK_REDUCE');expect(skill('lingwu').effectValue).toBe(60)})
  it('PVE技能按目标类型生效，实际改变战力和敌方防御',()=>{const s=skill('kongju'),h={...base,level:10};expect(battleOutcome(h,5000,'x',{attackerSkills:[s],nodeType:'OUTPOST'}).heroPower).toBeGreaterThan(battleOutcome(h,5000,'x').heroPower);expect(battleOutcome(h,5000,'x',{attackerSkills:[s],nodeType:'RANDOM_CITY'}).skillEvents[0].triggered).toBe(false);expect(battleOutcome(h,5000,'x',{attackerSkills:[skill('feijiang')]}).enemyRoll).toBeLessThan(battleOutcome(h,5000,'x').enemyRoll)})
  it('没有城防、敌方英雄、俘虏、普通士兵或家族加成时不伪触发',()=>{for(const code of ['xiejia','xiedai','dunzou','zhiliao','zhongcheng']){const r=battleOutcome({...base,level:10},100000,'x',{attackerSkills:[{...skill(code),triggerRate:1}]});expect(r.skillEvents[0].triggered).toBe(false);expect(r.skillEvents[0].reason).not.toBe('')}})
  it('家族战场所有技能无效，离间是俘虏基础概率相乘而非直接100%',()=>{expect(battleOutcome({...base,level:10},1,'x',{attackerSkills:[skill('kuangre')],familyBattle:true}).skillEvents[0].triggered).toBe(false);expect(battleOutcome({...base,level:10},1,'x',{attackerSkills:[{...skill('lijian'),triggerRate:1}],enemyHasHero:true,captureChance:.05}).captureChance).toBeCloseTo(.1)})
  it('最高四个战力技能占满后，经验辅助技能不触发',()=>{const list=['kuangre','xinnian','lingdaoli','kongju','lingwu'].map((c,i)=>({...skill(c),triggerRate:1,slotNo:i+1}));const r=battleOutcome({...base,level:10},10,'x',{attackerSkills:list});expect(r.skillEvents.filter(s=>s.triggered)).toHaveLength(4);expect(r.experienceBonus).toBe(0)})
  it('所有可配置默认系数均为有限正值，速度系数允许0',()=>{expect(defaultGrowth.combatRate).toBeGreaterThan(0);expect(defaultGrowth.starFactors).toHaveLength(6)})
})
describe('掉落权重',()=>{
  const items=[{id:1,name:'天赋水',enabled:true},{id:2,name:'未启用',enabled:false}] as ItemDefinition[]
  const pool:DropPool={id:1,name:'测试',nodeType:'OUTPOST',minLevel:1,maxLevel:20,chance:1,rolls:2,enabled:true,entries:[{itemId:1,weight:1,minQuantity:2,maxQuantity:3,enabled:true},{itemId:2,weight:999,minQuantity:1,maxQuantity:1,enabled:true}]}
  it('禁用条目和物品不掉落，同seed结果一致、数量合并正确',()=>{const result=rollLoot([pool],items,'OUTPOST',20,'same');expect(result).toEqual(rollLoot([pool],items,'OUTPOST',20,'same'));expect(result).toHaveLength(1);expect(result[0].itemId).toBe(1);expect(result[0].quantity).toBeGreaterThanOrEqual(4);expect(result[0].quantity).toBeLessThanOrEqual(6)})
  it('类型、等级、概率、开关、空池都能阻止掉落',()=>{expect(rollLoot([pool],items,'WILD',1,'x')).toEqual([]);expect(rollLoot([pool],items,'OUTPOST',21,'x')).toEqual([]);for(const p of [{...pool,chance:0},{...pool,enabled:false},{...pool,entries:[]}])expect(rollLoot([p],items,'OUTPOST',1,'x')).toEqual([])})
  it('低级到高级掉率递增，不影响野地且不超过管理员概率',()=>{const counts=[1,10,20].map(level=>Array.from({length:2000},(_,i)=>rollLoot([pool],items,'OUTPOST',level,'chance-'+i).length).reduce((a,b)=>a+b,0));expect(counts[0]).toBeGreaterThan(400);expect(counts[0]).toBeLessThan(600);expect(counts[1]).toBeGreaterThan(counts[0]);expect(counts[2]).toBe(2000);expect(rollLoot([{...pool,nodeType:'WILD'}],items,'WILD',1,'same')).toHaveLength(1)})
})
