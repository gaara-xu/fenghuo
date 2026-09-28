import {afterEach,describe,it,expect,vi} from 'vitest'
import {outpostGemBaseChance,outpostGemPoolCodes,outpostGemQuantityRange} from '../scripts/outpost-gem-rate-data'
import {outpostDropFactor} from '../shared/world-rules'
import {rollLoot} from '../server/item-service'
import {originalGems} from '../shared/gems'
import type {DropPool} from '../shared/items'
import {SeededRandom} from '../server/domain/random'
const item={...originalGems[0],id:1}
const pool:DropPool={id:1,name:'据点宝石',nodeType:'OUTPOST',minLevel:1,maxLevel:20,chance:outpostGemBaseChance,rolls:1,enabled:true,entries:[{itemId:1,weight:100,...outpostGemQuantityRange,enabled:true}]}
afterEach(()=>vi.restoreAllMocks())
describe('据点宝石掉率提高',()=>{
  it('只定位三档宝石池，实际概率随等级从25%到100%',()=>{
    expect(outpostGemPoolCodes).toEqual(['gem_outpost_low','gem_outpost_mid','gem_outpost_high'])
    expect(outpostGemBaseChance*outpostDropFactor(1)).toBe(.25)
    expect(outpostGemBaseChance*outpostDropFactor(10)).toBeCloseTo(.605263)
    expect(outpostGemBaseChance*outpostDropFactor(20)).toBe(1)
  })
  it('同一批种子低中高等级掉落次数均增加；20级胜利必掉，每组随机1至1000',()=>{
    expect(outpostGemQuantityRange).toEqual({minQuantity:1,maxQuantity:1000})
    for(const [level,oldChance] of [[1,.12],[10,.16],[20,.2]]){
      let before=0,after=0;const quantities=new Set<number>()
      for(let i=0;i<2000;i++){
        const seed='gem-rate-'+i
        before+=rollLoot([{...pool,chance:oldChance}],[item],'OUTPOST',level,seed).length
        const loot=rollLoot([pool],[item],'OUTPOST',level,seed);after+=loot.length
        if(loot.length){expect(loot[0].quantity).toBeGreaterThanOrEqual(1);expect(loot[0].quantity).toBeLessThanOrEqual(1000);quantities.add(loot[0].quantity)}
      }
      expect(after).toBeGreaterThan(before*4)
      expect(quantities.size).toBeGreaterThan(100)
      if(level===20)expect(after).toBe(2000)
    }
  })
  it.each([0,1-Number.EPSILON])('据点数量范围包含两端：%s',roll=>{
    vi.spyOn(SeededRandom.prototype,'next').mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(roll)
    expect(rollLoot([pool],[item],'OUTPOST',20,'boundary')[0].quantity).toBe(roll===0?1:1000)
  })
})
