import {describe,it,expect} from 'vitest'
import {isObsoleteItem} from '../shared/obsolete-items'
import {forgeMaterials} from '../shared/official-catalog'
import {originalGems,renameCard} from '../shared/gems'
describe('废弃道具精准清理范围',()=>{
  it('只选择六种原始无等级宝石及尚未实现用途的合成神石',()=>{
    expect(forgeMaterials.filter(isObsoleteItem).map(i=>i.code)).toEqual(['gem_meleeattack','gem_rangedattack','gem_meleedefense','gem_rangeddefense','gem_speed','gem_loadcapacity'])
    expect(isObsoleteItem({code:'synthesis_stone',itemType:'MATERIAL',effectConfig:{}})).toBe(true)
  })
  it('原版40种宝石、有效材料、改名卡和后台改成有效宝石的旧定义全部保留',()=>{
    for(const i of [...originalGems,renameCard,...forgeMaterials.filter(i=>!i.effectConfig.gemStat)])expect(isObsoleteItem(i)).toBe(false)
    const old=forgeMaterials.find(i=>i.code==='gem_speed')!
    for(const extra of [{gemFamily:'custom'},{gemLevel:1},{gemAmount:61},{gemBonuses:{speed:60}},{gemSlots:['MOUNT'] as const}])expect(isObsoleteItem({...old,effectConfig:{...old.effectConfig,...extra} as typeof old.effectConfig})).toBe(false)
    expect(isObsoleteItem({...old,code:'my_gem'})).toBe(false)
    expect(isObsoleteItem({code:'synthesis_stone',itemType:'MATERIAL',effectConfig:{gemStat:'speed',gemAmount:10}})).toBe(false)
  })
})
