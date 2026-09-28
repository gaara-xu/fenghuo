import type {EquipmentSlot} from './items.js'
export type ForgeOperation='REFINE'|'DRILL'|'SOCKET'|'UNSOCKET'
export type ForgeTarget={kind:'EQUIPPED';heroId:number;slot:EquipmentSlot;instanceId?:number}|{kind:'INSTANCE';instanceId:number}|{kind:'STACK';itemId:number}
export type ForgeCommand=({operation:'REFINE'|'DRILL'|'SOCKET';materialId:number}|{operation:'UNSOCKET';gemIndex:number;gemItemId:number})&{clientActionId:string}
export interface ForgeRules {refineRates:number[];divineBonus:number;downgradeChance:number;drillRates:number[];drillCost:number;sourceStatus:'ESTIMATED'|'DIY'}
// Official mechanisms; probability tables remain configurable single-player estimates.
export const defaultForgeRules:ForgeRules={refineRates:[1,.9,.8,.7,.6,.5,.4,.3,.2],divineBonus:.15,downgradeChance:.35,drillRates:[.8,.5,.25],drillCost:1,sourceStatus:'ESTIMATED'}
export function refineOutcome(level:number,divine:boolean,rules:ForgeRules,roll:number,failureRoll:number,advanced=false){
  if(!Number.isInteger(level)||level<0||level>=9)throw Error('精炼已达上限')
  const chance=Math.min(1,rules.refineRates[level]+(divine?rules.divineBonus:advanced ? .1 : 0))
  return {level:roll<chance?level+1:Math.max(0,level-(failureRoll<rules.downgradeChance?1:0)),success:roll<chance,chance}
}
