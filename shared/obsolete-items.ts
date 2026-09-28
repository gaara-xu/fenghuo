import type {ItemDefinition} from './items.js'

const legacyGems:Record<string,{gemStat:string;gemAmount:number}>={
  gem_meleeattack:{gemStat:'meleeAttack',gemAmount:300},gem_rangedattack:{gemStat:'rangedAttack',gemAmount:300},
  gem_meleedefense:{gemStat:'meleeDefense',gemAmount:300},gem_rangeddefense:{gemStat:'rangedDefense',gemAmount:300},
  gem_speed:{gemStat:'speed',gemAmount:60},gem_loadcapacity:{gemStat:'loadCapacity',gemAmount:1000},
}
export const obsoleteItemCodes=[...Object.keys(legacyGems),'synthesis_stone']
export function isObsoleteItem(item:Pick<ItemDefinition,'code'|'itemType'|'effectConfig'>){
  const c=item.effectConfig,old=legacyGems[item.code]
  if(item.itemType!=='MATERIAL'||c.gemLevel!==undefined||c.gemFamily)return false
  // Exact legacy definitions only; never infer obsolescence from disabled state or a missing icon.
  return old?c.gemStat===old.gemStat&&c.gemAmount===old.gemAmount&&!c.gemBonuses&&!c.gemSlots:item.code==='synthesis_stone'&&!c.gemStat&&!c.kind
}
