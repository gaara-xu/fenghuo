import {officialHeroArt,officialItemIcons} from '../shared/official-catalog'
import {officialSkills} from '../shared/skill-catalog'
export const portraitNames:Record<string,string>={...Object.fromEntries(Object.entries(officialHeroArt).map(([key,h])=>[key,h.name])),youxia:'游侠',ru_sheng:'儒生',shen_shanshan:'神珊珊',meng_tian:'蒙恬',wang_ben:'王贲'}
export function portraitStyle(key?:string|null){const h=key?officialHeroArt[key]:undefined;if(!h)return null;const rows=[9,201,401,596,785,982,1177,1376,1566,1759,1954,2156,2346],x=h.index%2?820:326,y=rows[Math.floor(h.index/2)];return {backgroundImage:'url(/art/official/hero_intro.jpg)',backgroundSize:(1600/148*100)+'% '+(2521/148*100)+'%',backgroundPosition:(x/(1600-148)*100)+'% '+(y/(2521-148)*100)+'%'}}
const bronzeEquipmentIcons:Record<string,string>={
  '青铜头盔':'helmet','青铜肩铠':'shoulder','青铜胸铠':'armor','青铜护腿':'legs',
  '青铜战靴':'boots','青铜项链':'necklace','青铜手镯':'bracelet','青铜戒指':'ring',
}
const oneStarTreasureIcons:Record<string,string>={
  '一星近攻宝物':'meleeattack','一星远攻宝物':'rangedattack',
  '一星近防宝物':'meleedefense','一星远防宝物':'rangeddefense',
  '一星速度宝物':'speed','一星负重宝物':'loadcapacity',
}
const consumableIcons:Record<string,string>={
  '天赋水':'talent_water','英雄经验书':'hero_experience_book','英雄体力药':'hero_stamina_potion',
  '精炼石':'refine_common','高级精炼石':'refine_advanced','精炼神石':'refine_stone','合成神石':'synthesis_stone',
}
const legacyGemIcons:Record<string,string>={
  '近攻宝石':'item73','远攻宝石':'item76','近防宝石':'item79',
  '远防宝石':'item79','速度宝石':'item82','负重宝石':'item85',
}
export function itemArt(name:string,icon?:string,size:'small'|'large'='small'){
  if(icon?.startsWith('/art/')&&!icon.includes('..'))return icon
  if(Object.hasOwn(officialItemIcons,name))return officialItemIcons[name]
  if(Object.hasOwn(bronzeEquipmentIcons,name))return `/art/equipment/bronze_${bronzeEquipmentIcons[name]}-${size}.png`
  if(Object.hasOwn(oneStarTreasureIcons,name))return `/art/treasures/one_star_${oneStarTreasureIcons[name]}-${size}.png`
  if(Object.hasOwn(consumableIcons,name))return `/art/items/${consumableIcons[name]}-${size}.png`
  if(Object.hasOwn(legacyGemIcons,name))return `/art/official/${legacyGemIcons[name]}.gif`
  return null
}
export const iconNames:Record<string,string>=Object.fromEntries(officialSkills.map(s=>[s[0],s[1]]))
export function artUrl(key:string|null|undefined,skill=false,size:'small'|'large'='small'):string{
  const names=skill?iconNames:portraitNames
  if(skill)return '/art/skills/'+(key&&Object.hasOwn(names,key)?key:'xueyuan')+'-'+size+'.png'
  return '/art/'+(key&&Object.hasOwn(names,key)?key:skill?'xueyuan':'youxia')+'.png'
}
