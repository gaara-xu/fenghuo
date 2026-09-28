export const MAX_DROP_QUANTITY=1000
// Local single-player balance, not an asserted original-game drop rate.
export const wildGemDropDefaults={
  code:'gem_wild',name:'野地一级宝石',nodeType:'WILD',minLevel:1,maxLevel:100,
  chance:1,rolls:1,weight:100,minQuantity:1,maxQuantity:MAX_DROP_QUANTITY,
} as const
