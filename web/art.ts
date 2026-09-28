import {officialHeroArt,officialItemIcons} from '../shared/official-catalog'
import {officialSkills} from '../shared/skill-catalog'
export const portraitNames:Record<string,string>={...Object.fromEntries(Object.entries(officialHeroArt).map(([key,h])=>[key,h.name])),youxia:'游侠',ru_sheng:'儒生',shen_shanshan:'神珊珊',meng_tian:'蒙恬',wang_ben:'王贲'}
export function portraitStyle(key?:string|null){const h=key?officialHeroArt[key]:undefined;if(!h)return null;const rows=[9,201,401,596,785,982,1177,1376,1566,1759,1954,2156,2346],x=h.index%2?820:326,y=rows[Math.floor(h.index/2)];return {backgroundImage:'url(/art/official/hero_intro.jpg)',backgroundSize:(1600/148*100)+'% '+(2521/148*100)+'%',backgroundPosition:(x/(1600-148)*100)+'% '+(y/(2521-148)*100)+'%'}}
export function itemArt(name:string,icon?:string){return icon?.startsWith('/art/')&&!icon.includes('..')?icon:officialItemIcons[name]??null}
export const iconNames:Record<string,string>=Object.fromEntries(officialSkills.map(s=>[s[0],s[1]]))
export function artUrl(key:string|null|undefined,skill=false,size:'small'|'large'='small'):string{
  const names=skill?iconNames:portraitNames
  if(skill)return '/art/skills/'+(key&&Object.hasOwn(names,key)?key:'xueyuan')+'-'+size+'.png'
  return '/art/'+(key&&Object.hasOwn(names,key)?key:skill?'xueyuan':'youxia')+'.png'
}
