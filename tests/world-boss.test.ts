import {describe,it,expect} from 'vitest'
import {defaultWorldBossRules as defaults,WORLD_BOSS_LEVEL,WORLD_BOSS_POWER,isWorldBoss,worldBossAfterBattle,rollWorldBossLoot,worldBossGarrison,worldBossArmy,worldBossExpired,worldBossCountdown} from '../shared/world-boss'
import {worldBossRulesSchema} from '../server/world-boss-service'
import {npcArmy,armyStats} from '../shared/military'
import type {ItemDefinition} from '../shared/items'
import {originalGems} from '../shared/gems'
const item=(id:number,itemType:ItemDefinition['itemType'],effectConfig:ItemDefinition['effectConfig']={}):ItemDefinition=>({id,itemType,effectConfig,name:'物品'+id,code:'test'+id,rarity:1,enabled:true,description:''})
const items=[item(1,'EQUIPMENT'),item(2,'TREASURE'),item(3,'SKILL_BOOK',{skillId:1}),item(4,'CONSUMABLE'),item(5,'MATERIAL',{gemStat:'speed',gemLevel:1}),item(6,'MATERIAL')]
describe('世界首领规则',()=>{
 it('200级强度外推且双防一致；只有胜利一次消失，败战不降级',()=>{
  expect(WORLD_BOSS_LEVEL).toBe(200);expect(WORLD_BOSS_POWER).toBe(4000100000)
  const stats=armyStats(npcArmy(WORLD_BOSS_POWER,'BALANCED',false));expect(stats.meleeDefense).toBe(WORLD_BOSS_POWER);expect(stats.rangedDefense).toBe(WORLD_BOSS_POWER)
  expect(worldBossAfterBattle(false)).toEqual({level:200,power:WORLD_BOSS_POWER,status:'ACTIVE'});expect(worldBossAfterBattle(true)).toEqual({level:0,power:0,status:'DEPLETED'})
  expect(isWorldBoss('{"worldBoss":true}')).toBe(true);for(const value of [null,{},'bad','{"worldBoss":false}','{"worldBoss":"true"}'])expect(isWorldBoss(value)).toBe(false)
 })
 it('全类别独立豪华掉落，数量含上下界；停用、回收物品不参与',()=>{
  const rules={...defaults,itemChance:1}
  expect(rollWorldBossLoot(items,rules,()=>0).map(l=>l.quantity)).toEqual([5,5,20,50,1000,100])
  expect(rollWorldBossLoot(items,rules,()=>.999999).map(l=>l.quantity)).toEqual([20,20,100,200,10000,1000])
  expect(rollWorldBossLoot(items,defaults,()=>.8)).toEqual([])
  expect(rollWorldBossLoot([{...items[0],enabled:false},{...items[1],deletedAt:'2026-01-01'}],rules,()=>0)).toEqual([])
  expect(rollWorldBossLoot([...items,item(7,'TREASURE')],rules,()=>0)).toHaveLength(7)
 })
 it('五系仅一级宝石参与，各自独立随机数量；高等级和旧无等级宝石不冒充其他材料',()=>{
  const gems=originalGems.map((g,n)=>({...g,id:n+100})),rules={...defaults,itemChance:1}
  const draws=[0,0,0,.25,0,.5,0,.75,0,.999999],loot=rollWorldBossLoot(gems,rules,()=>draws.shift()!)
  expect(loot.map(l=>l.itemId)).toEqual(gems.filter(g=>g.effectConfig.gemLevel===1).map(g=>g.id))
  expect(loot.map(l=>l.quantity)).toEqual([1000,3250,5500,7750,10000]);expect(draws).toHaveLength(0)
  expect(rollWorldBossLoot([item(1,'MATERIAL',{gemStat:'speed'}),item(2,'MATERIAL',{gemLevel:8}),{...gems[0],enabled:false},{...gems[0],deletedAt:'2026-01-01'}],rules,()=>0)).toEqual([])
 })
 it('后台范围校验拒绝越界、小数数量、反向区间、缺分类和额外字段',()=>{
  expect(worldBossRulesSchema.parse(defaults)).toEqual(defaults)
  for(const change of [{spawnChance:1.01},{itemChance:-1},{level:0},{level:1001},{level:1.5},{meleeDefense:0},{rangedDefense:1e12+1},{meleeDefense:1.1},{unknown:true},{quantities:{}},{quantities:{...defaults.quantities,GEM:{min:10,max:1}}},{quantities:{...defaults.quantities,GEM:{min:1.5,max:2}}},{quantities:{...defaults.quantities,GEM:{min:1,max:100001}}}])expect(worldBossRulesSchema.safeParse({...defaults,...change}).success).toBe(false)
 })
 it('强度独立保存到首领快照，旧配置兼容默认值；失败不回退200级',()=>{
  const {level,meleeDefense,rangedDefense,...legacy}=defaults;expect(worldBossRulesSchema.parse(legacy)).toEqual(defaults)
  const rules={...defaults,level:75,meleeDefense:1234,rangedDefense:5678},snap=worldBossGarrison(rules,new Date(0))
  expect(armyStats(worldBossArmy(snap))).toMatchObject({meleeDefense:1234,rangedDefense:5678})
  expect(worldBossAfterBattle(false,rules.level,snap)).toEqual({level:75,power:5678,status:'ACTIVE'})
  expect(worldBossAfterBattle(true,rules.level,snap)).toEqual({level:0,power:0,status:'DEPLETED'})
 })
 it('存活固定300秒，到点即过期，倒计时不出现负数',()=>{
  const snap=worldBossGarrison(defaults,new Date(0));expect(snap.expiresGameAt).toBe('1970-01-01T00:05:00.000Z')
  expect(worldBossExpired(snap,299999)).toBe(false);expect(worldBossExpired(JSON.stringify(snap),300000)).toBe(true)
  expect(worldBossCountdown(snap.expiresGameAt,0)).toBe('5:00');expect(worldBossCountdown(snap.expiresGameAt,299999)).toBe('0:01');expect(worldBossCountdown(snap.expiresGameAt,310000)).toBe('0:00')
 })
})
