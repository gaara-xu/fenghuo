import type {InventoryEntry,EquippedItem} from '../shared/items'
import {equipmentSlots,itemTypes,itemStatBonuses,equipmentSetStates,itemSetBonuses} from '../shared/items'
import {qualityTier} from '../shared/quality'
import {gemBonuses,gemSummary} from '../shared/gems'
import {statLabels} from '../shared/hero-growth'

export interface IconChoice {
  id:number;name:string;detail:string;quality?:number;iconKey?:string|null;imageUrl?:string
  badge?:string;lines?:string[];glyph?:'book'|'treasure'|'armor'|'material'|'bottle';disabled?:boolean
  setTiers?:Array<{text:string;active:boolean}>
}
export function inventoryChoice(e:InventoryEntry,worn?:EquippedItem[]):IconChoice{
  const i=e.item,c=i.effectConfig,g=e.gear,lines:string[]=[itemTypes[i.itemType]]
  if(['EQUIPMENT','TREASURE'].includes(i.itemType))lines.push('★'.repeat(i.rarity))
  if(c.gemStat){for(const [key,value] of Object.entries(gemBonuses(i)))lines.push(statLabels[key as keyof typeof statLabels]+' +'+value.toLocaleString());if(c.gemSlots?.length)lines.push('镶嵌部位：'+c.gemSlots.map(s=>equipmentSlots[s]).join('、'))}
  if(c.kind==='RENAME')lines.push('在英雄界面点击名字，消耗一张改名卡修改名字')
  if(c.kind==='EXPERIENCE')lines.push('增加英雄经验 '+(c.amount??0)+' 点')
  if(c.kind==='STAMINA')lines.push('恢复体力 '+(c.amount??0)+' 点，不超过上限')
  if(c.kind==='TALENT')lines.push('重新洗练天赋，可能提升或降低')
  if(c.slot)lines.push('部位：'+equipmentSlots[c.slot])
  if(c.requiredStrength)lines.push('实力要求：'+c.requiredStrength)
  for(const [key,value] of Object.entries(itemStatBonuses(i,g)))lines.push(statLabels[key as keyof typeof statLabels]+' +'+value)
  for(const [key,value] of Object.entries(itemStatBonuses(i,g,true)))lines.push(statLabels[key as keyof typeof statLabels]+' +'+value+'%')
  if(g){lines.push('精炼 +'+g.refineLevel+' · 孔位 '+g.gems.length+' / '+g.sockets);for(const gem of g.gems)lines.push(gem.name+'：'+gemSummary(gem))}
  const set=worn?equipmentSetStates(worn).find(s=>s.code===c.setCode):undefined
  const setTiers=set?.tiers.map(t=>({active:t.active,text:'套装 '+t.count+' 件：'+Object.entries(t.bonuses).map(([k,v])=>statLabels[k as keyof typeof statLabels]+' +'+v+'%').join('，')+' · '+(t.active?'已生效':t.unlocked?'高档已替代':'未激活')}))
  if(!set){for(const tier of itemSetBonuses(i))lines.push('套装 '+tier.count+' 件：'+Object.entries(tier.bonuses).map(([k,v])=>statLabels[k as keyof typeof statLabels]+' +'+v+'%').join('，'))}
  if(!i.enabled)lines.push(i.deletedAt?'已移入回收站，暂不可新穿戴。':'已停用，暂不可使用。')
  return {id:g?-g.instanceId:i.id,name:i.name,detail:i.description,quality:qualityTier(i.rarity,i.qualityTier),imageUrl:c.icon,iconKey:i.itemType==='SKILL_BOOK'?i.code.replace('skill_book_',''):undefined,badge:g?'+'+g.refineLevel:String(e.quantity),lines,setTiers,glyph:i.itemType==='TREASURE'?'treasure':i.itemType==='SKILL_BOOK'||['EXPERIENCE','RENAME'].includes(c.kind??'')?'book':i.itemType==='MATERIAL'?'material':i.itemType==='CONSUMABLE'?'bottle':'armor'}
}
