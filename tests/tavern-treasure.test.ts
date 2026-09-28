import {describe,it,expect,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {eligibleTreasureItem,treasureWeight} from '../shared/tavern'
import type {ItemDefinition} from '../shared/items'
import {migrationStatements,migrateTreasureTavern} from '../scripts/tavern-migration'
const sql=readFileSync('database/migrations/0014_tavern_treasure.sql','utf8')
const item=(itemType:ItemDefinition['itemType'],qualityTier=3):ItemDefinition=>({id:8,code:'test',name:'珍品',itemType,qualityTier,rarity:3,description:'说明',effectConfig:{},enabled:true})
describe('酒馆藏宝阁规则与迁移',()=>{
  it('装备、宝物、消耗道具和材料可入池，技能书、停用和删除物品不可入池',()=>{
    for(const type of ['EQUIPMENT','TREASURE','CONSUMABLE','MATERIAL'] as const)expect(eligibleTreasureItem(item(type))).toBe(true)
    for(const i of [item('SKILL_BOOK'),{...item('TREASURE'),enabled:false},{...item('TREASURE'),deletedAt:'2026-09-17'}])expect(eligibleTreasureItem(i)).toBe(false)
  })
  it('七档权重均为正且逐级降低，红色最少',()=>{
    const weights=Array.from({length:7},(_,i)=>treasureWeight(item('TREASURE',i+1)))
    expect(weights).toEqual([600,400,250,120,45,10,1])
  })
  it('迁移只修改酒馆表，完整结构按外键依赖排序且包含新字段',()=>{
    expect(migrationStatements(sql)).toHaveLength(10)
    expect(()=>migrationStatements('DROP TABLE player_profile;')).toThrow('非预期')
    const schema=readFileSync('database/schema.sql','utf8'),tables=[...schema.matchAll(/CREATE TABLE IF NOT EXISTS `([^`]+)`/g)].map(m=>m[1])
    expect(new Set(tables).size).toBe(tables.length)
    expect(tables.indexOf('item_definitions')).toBeLessThan(tables.indexOf('tavern_pool_entries'))
    for(const text of ['`fk_entry_item`','`fk_candidate_item`','`uk_pool_item`','`item_snapshot`','`select_limit_snapshot`'])expect(schema).toContain(text)
  })
  it('迁移严格限库，已完成时不覆盖管理员权重或费用',async()=>{
    const c:any={query:vi.fn(),execute:vi.fn(),beginTransaction:vi.fn(),rollback:vi.fn(),commit:vi.fn()}
    c.query.mockResolvedValueOnce([[{db:'wrong'}]])
    await expect(migrateTreasureTavern(c,sql)).rejects.toThrow('越界');expect(c.execute).not.toHaveBeenCalled()
    c.query.mockImplementation(async(q:string)=>[q.startsWith('SELECT DATABASE')?[{db:'fenghuo'}]:q.includes('GET_LOCK')?[{acquired:1}]:q.startsWith('SHOW COLUMNS')?[{Field:'deleted_at'}]:q.includes('schema_migrations')?[{version:'done'}]:[]])
    expect(await migrateTreasureTavern(c,sql)).toBe(false);expect(c.execute).not.toHaveBeenCalled();expect(c.beginTransaction).not.toHaveBeenCalled()
  })
  it('可从已添加字段的中断点恢复；只初始化合法物品，不修改钱包与包裹',async()=>{
    const c:any={query:vi.fn(),execute:vi.fn().mockResolvedValue([{}]),beginTransaction:vi.fn(),rollback:vi.fn(),commit:vi.fn()}
    c.query.mockImplementation(async(q:string)=>{
      if(q.startsWith('SELECT DATABASE'))return [[{db:'fenghuo'}]]
      if(q.includes('GET_LOCK'))return [[{acquired:1}]]
      if(q.startsWith('SHOW COLUMNS'))return [[{Field:'deleted_at'}]]
      if(q.startsWith('SHOW CREATE'))return [[{'Create Table':'`item_definition_id` `item_snapshot`'}]]
      if(q.startsWith('SELECT id FROM tavern_pools'))return [[{id:3}]]
      if(q==='SELECT * FROM item_definitions')return [[{id:8,code:'test',name:'珍品',item_type:'TREASURE',quality_tier:7,rarity:6,enabled:1},{id:9,item_type:'SKILL_BOOK',enabled:1}]]
      return [[]]
    })
    expect(await migrateTreasureTavern(c,sql)).toBe(true)
    expect(c.query.mock.calls.filter(([q]:string[])=>q.includes('ADD COLUMN `item_'))).toHaveLength(0)
    expect(c.execute.mock.calls.find(([q]:string[])=>q.includes('INSERT IGNORE INTO tavern_pool_entries'))?.[1]).toEqual([3,8,1])
    expect(c.execute.mock.calls.map(([q]:string[])=>q).join(' ')).not.toMatch(/resource_wallet|player_inventory|DELETE/)
    expect(c.commit).toHaveBeenCalledOnce()
  })
})
