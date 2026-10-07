import {beforeEach,describe,expect,it,vi} from 'vitest'
import type {EquippedItem} from '../shared/items'
import {defaultGrowth} from '../shared/hero-growth'
const fixtures=vi.hoisted(()=>({heroes:[] as any[],skills:[] as any[],equipment:[] as any[],query:vi.fn(),gear:vi.fn()}))
vi.mock('../server/db.js',()=>({getPool:()=>({query:fixtures.query}),inTransaction:vi.fn()}))
vi.mock('../server/item-service.js',()=>({getEquipment:fixtures.gear}))
import {homeHeroArmy} from '../server/home-defense-service'
const hero=(id:number,patch:Record<string,unknown>={})=>({owned_hero_id:id,hero_name:'武将'+id,star:6,level:1,talent_grade:'PERFECT',melee_attack:100,ranged_attack:0,melee_defense:100,ranged_defense:200,speed:100,load_capacity:100,...patch})
const skill=(id:number,slot:number,patch:Record<string,unknown>={})=>({id:40,owned_hero_id:id,slot_no:slot,skill_level:5,code:'jiuzheng',name:'拯救',rarity:6,quality_tier:7,effect_type:'DEFENSE_PERCENT',target_scope:'HERO_SELF',trigger_rate:.2,max_level:10,enabled:1,source_status:'VERIFIED',description:'提高自身防御。',icon_key:'jiuzheng',effect_config:JSON.stringify({base:10,perLevel:2,ratePerLevel:.03,mode:'DEFENSE'}),effect_value:66,...patch})
beforeEach(()=>{
 fixtures.heroes=[];fixtures.skills=[];fixtures.equipment=[];fixtures.query.mockReset();fixtures.gear.mockReset().mockImplementation(async()=>fixtures.equipment)
 fixtures.query.mockImplementation(async(sql:string)=>{
  if(sql.includes('FROM owned_heroes o JOIN hero_definitions'))return [fixtures.heroes]
  if(sql.includes('FROM owned_hero_skills'))return [fixtures.skills]
  if(sql.includes("setting_key='hero_growth_rules'"))return [[{setting_value:JSON.stringify(defaultGrowth)}]]
  throw Error('Unexpected query: '+sql)
 })
})
describe('驻城武将读取',()=>{
 it('限定当前玩家存活且不在行军、返程或自动出征中的武将；战斗才加锁',async()=>{
  expect(await homeHeroArmy()).toEqual({army:[],skills:[],heroes:[]});expect(fixtures.gear).not.toHaveBeenCalled();expect(fixtures.query).toHaveBeenCalledTimes(1)
  const [sql,args]=fixtures.query.mock.calls[0]
  expect(sql).toContain('o.player_id=? AND o.retired_at IS NULL');expect(args).toHaveLength(1)
  expect(sql).toContain("m.status IN ('MARCHING','FIGHTING','RETURNING')")
  expect(sql).toContain("j.status='ACTIVE'");expect(sql).not.toContain('stamina>');expect(sql).not.toContain('FOR UPDATE')
  await homeHeroArmy({query:fixtures.query} as any,true);expect(fixtures.query.mock.calls[1][0]).toMatch(/FOR UPDATE$/)
 })
 it('装备精炼、宝石、套装及天赋成长逐人计算，自定义姓名正确，科技只乘一次',async()=>{
  fixtures.heroes=[hero(1,{hero_name:'守城大将',level:2}),hero(2)]
  const helmet:EquippedItem={heroId:1,slot:'HELMET',item:{id:1,code:'bronze',name:'青铜头盔',itemType:'EQUIPMENT',rarity:1,description:'测试',enabled:true,effectConfig:{setCode:'BRONZE',flatBonuses:{meleeDefense:100,rangedDefense:100},bonuses:{meleeDefense:10}}},gear:{instanceId:1,refineLevel:1,sockets:1,gems:[{itemId:3,name:'防御宝石',stat:'meleeDefense',amount:50,bonuses:{meleeDefense:50,rangedDefense:50}}]}}
  fixtures.equipment=[helmet,{heroId:1,slot:'ARMOR',item:{...helmet.item,id:2,effectConfig:{setCode:'BRONZE'}}}]
  const result=await homeHeroArmy()
  // Grown defense 133/266; +130 refinement, +50 gem; +12.5% item and +4% two-piece set.
  expect(result.army[0]).toMatchObject({code:'hero_1',name:'守城大将',quantity:1,stats:{meleeDefense:365,rangedDefense:464}})
  expect(result.army[1].stats).toMatchObject({meleeDefense:100,rangedDefense:200})
  expect(result.heroes).toEqual([{heroId:1,name:'守城大将',meleeDefense:730,rangedDefense:928},{heroId:2,name:'武将2',meleeDefense:200,rangedDefense:400}])
 })
 it('只加载留城英雄已解锁的上架技能，沿用数据库等级效果和逐级触发率',async()=>{
  fixtures.heroes=[hero(1),hero(2,{star:3,level:5})]
  fixtures.skills=[skill(1,1),skill(1,2),skill(2,1,{id:41}),skill(2,2),skill(3,1),skill(2,0)]
  const result=await homeHeroArmy()
  expect(result.skills).toHaveLength(2)
  expect(result.skills[0]).toMatchObject({ownerCode:'hero_1',ownerName:'武将1',effectValue:66,level:5,triggerRate:.35,mode:'DEFENSE'})
  expect(result.skills[1].ownerCode).toBe('hero_2')
  expect(fixtures.query.mock.calls.find(([sql])=>sql.includes('FROM owned_hero_skills'))![0]).toContain('s.enabled=1')
 })
})
