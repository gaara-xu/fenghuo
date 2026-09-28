import {describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {proportionalLosses,incomingRaidOutcome} from '../server/domain/raid-battle'
import {incomingRaidRulesSchema} from '../server/incoming-raid-service'
import {defaultIncomingRaidRules,raidCountdown} from '../shared/incoming-raids'
import {rollWorldBossLoot} from '../shared/world-boss'
import type {ArmyStack} from '../shared/military'
import type {ItemDefinition} from '../shared/items'
const stack=(quantity:number,code='guard',kind:ArmyStack['kind']='TROOP'):ArmyStack=>({code,name:code,kind,quantity,stats:{meleeAttack:0,rangedAttack:0,meleeDefense:.5,rangedDefense:.5,speed:0,loadCapacity:0}})
describe('来袭军队比例伤亡',()=>{
 it.each([[100,100],[1000,10],[10000,1],[100000,0]])('100对%d：守方损失%d，无随机保底伤亡',(defense,lost)=>{
  const out=incomingRaidOutcome({name:'敌军',attackPower:100,troopCount:100,attackType:'MELEE'},[stack(defense)])
  expect(out.troopLosses[0].lost).toBe(lost);expect(out.attackerLosses[0].lost).toBe(100);expect(out.result).toBe(defense===100?'DRAW':'VICTORY')
 })
 it('强攻弱守规则对称，无守军则敌军零损失，不额外扣资源',()=>{
  const out=incomingRaidOutcome({name:'敌军',attackPower:1000,troopCount:1000,attackType:'BALANCED'},[stack(100)])
  expect(out.result).toBe('DEFEAT');expect(out.troopLosses[0].remaining).toBe(0);expect(out.attackerLosses[0].lost).toBe(10)
  expect(incomingRaidOutcome({name:'敌军',attackPower:100,troopCount:100,attackType:'RANGED'},[]).attackerLosses[0].lost).toBe(0)
 })
 it('拆成不同兵种和城防不减少总伤亡，数量守恒',()=>{
  const out=proportionalLosses([stack(333,'a'),stack(333,'b','FORT'),stack(334,'c')],1000,100)
  expect(out.reduce((n,s)=>n+s.lost,0)).toBe(10);expect(out.every(s=>s.lost>=0&&s.remaining+s.lost===s.sent)).toBe(true)
  const split=proportionalLosses(Array.from({length:1000},(_,i)=>stack(1,String(i))),1000,100)
  expect(split.reduce((n,s)=>n+s.lost,0)).toBe(10)
 })
 it('近远攻按攻击占比对对应双防，不将近远防相加',()=>{
  const army=stack(100);army.stats.meleeDefense=10;army.stats.rangedDefense=1
  const raid={name:'敌军',attackPower:1000,troopCount:10}
  expect(incomingRaidOutcome({...raid,attackType:'MELEE'},[army]).defensePower).toBe(2000)
  expect(incomingRaidOutcome({...raid,attackType:'RANGED'},[army]).defensePower).toBe(200)
  expect(incomingRaidOutcome({...raid,attackType:'BALANCED'},[army]).defensePower).toBe(1100)
 })
 it('后台范围、概率、分类数量严格校验；5分钟倒计时',()=>{
  expect(incomingRaidRulesSchema.parse(defaultIncomingRaidRules)).toEqual(defaultIncomingRaidRules)
  for(const patch of [{attackMin:0},{attackMax:1},{attackMin:1.5},{itemChance:1.01},{itemChance:-1},{attackMax:1e10+1},{schedulerInterval:1}])expect(()=>incomingRaidRulesSchema.parse({...defaultIncomingRaidRules,...patch})).toThrow()
  expect(()=>incomingRaidRulesSchema.parse({...defaultIncomingRaidRules,quantities:{...defaultIncomingRaidRules.quantities,GEM:{min:2,max:1}}})).toThrow()
  expect(raidCountdown(new Date(300000).toISOString(),0)).toBe('5分00秒');expect(raidCountdown(new Date(300000).toISOString(),300000)).toBe('正在交战')
 })
 it('防守丰厚掉落仅含上架物品和各系一级宝石，数量范围有效',()=>{
  const item=(id:number,patch:Partial<ItemDefinition>):ItemDefinition=>({id,code:'item'+id,name:'道具'+id,itemType:'MATERIAL',rarity:1,description:'',enabled:true,effectConfig:{},...patch})
  const items=[item(1,{effectConfig:{gemLevel:1,gemStat:'meleeDefense'}}),item(2,{effectConfig:{gemLevel:2,gemStat:'meleeDefense'}}),item(3,{enabled:false}),item(4,{deletedAt:'2026-01-01'}),item(5,{itemType:'CONSUMABLE'})]
  const drops=rollWorldBossLoot(items,{...defaultIncomingRaidRules,itemChance:1},()=>.5)
  expect(drops.map(d=>d.itemId)).toEqual([1,5]);expect(drops[0].quantity).toBe(550);expect(drops[1].quantity).toBe(13)
  expect(rollWorldBossLoot(items,{...defaultIncomingRaidRules,itemChance:0},()=>0)).toEqual([])
 })
 it('结构基线与增量表一致，接入部署更新，不创建周期生成器',()=>{
  const sql=readFileSync('database/migrations/0022_incoming_raids.sql','utf8').trim()
  expect(readFileSync('database/schema.sql','utf8')).toContain(sql)
  expect(JSON.parse(readFileSync('package.json','utf8')).scripts['db:update']).toContain('scripts/update-incoming-raids.ts')
  for(const path of ['server/incoming-raid-service.ts','shared/incoming-raids.ts','scripts/update-incoming-raids.ts'])expect(readFileSync(path,'utf8')).not.toMatch(/setInterval|setTimeout|node-cron/)
 })
})
