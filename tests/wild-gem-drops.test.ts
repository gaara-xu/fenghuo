import {afterEach,describe,it,expect,vi} from 'vitest'
import {originalGems} from '../shared/gems'
import {wildGemDropDefaults} from '../shared/drop-rules'
import {rollLoot} from '../server/item-service'
import {SeededRandom} from '../server/domain/random'
import type {DropPool} from '../shared/items'
const gems=originalGems.filter(g=>g.effectConfig.gemLevel===1).map((g,i)=>({...g,id:i+1}))
const pool:DropPool={...wildGemDropDefaults,id:1,enabled:true,entries:gems.map(g=>({itemId:g.id,weight:100,minQuantity:1,maxQuantity:1000,enabled:true}))}
afterEach(()=>vi.restoreAllMocks())
describe('野地一级宝石',()=>{
  it('只抽五系一级宝石，一次一种一组；数量随机且可复现',()=>{
    const quantities=new Set<number>(),ids=new Set<number>()
    for(let i=0;i<1000;i++){
      const loot=rollLoot([pool],gems,'WILD',1+i%100,'wild-gem-'+i)
      expect(loot).toHaveLength(1);expect(loot).toEqual(rollLoot([pool],gems,'WILD',1+i%100,'wild-gem-'+i))
      expect(loot[0].quantity).toBeGreaterThanOrEqual(1);expect(loot[0].quantity).toBeLessThanOrEqual(1000)
      quantities.add(loot[0].quantity);ids.add(loot[0].itemId)
    }
    expect(ids.size).toBe(5);expect(quantities.size).toBeGreaterThan(500)
  })
  it.each([0,1-Number.EPSILON])('包含随机范围的两端：%s',roll=>{
    vi.spyOn(SeededRandom.prototype,'next').mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(roll)
    expect(rollLoot([pool],gems,'WILD',5,'boundary')[0].quantity).toBe(roll===0?1:1000)
  })
  it('不为其他地图类型发奖，概率和后台停用开关仍有效',()=>{
    for(const type of ['OUTPOST','DUNGEON','SYSTEM_CITY','RANDOM_CITY'])expect(rollLoot([pool],gems,type,5,'scope')).toEqual([])
    for(const change of [{enabled:false},{chance:0},{entries:[]}])expect(rollLoot([{...pool,...change}],gems,'WILD',1,'disabled')).toEqual([])
    expect(rollLoot([pool],gems.map(g=>({...g,enabled:false})),'WILD',1,'disabled')).toEqual([])
  })
})
