import {officialCatalog} from './official-catalog-data.js'
import {statLabels,type HeroStats} from './hero-growth.js'
import type {EquipmentSlot,ItemDefinition} from './items.js'
export {officialCatalog}
const slots:EquipmentSlot[]=['HELMET','SHOULDER','ARMOR','LEGS','BOOTS','NECKLACE','BRACELET','RING']
const suffix=['头盔','肩铠','胸铠','护腿','战靴','项链','手镯','戒指']
export const officialHeroKeys=['qin_shihuang','qu_yuan','sun_wu','zhuangzi','fan_li','guan_zhong','wu_zixu','zhang_liang','yue_nv','yang_youji','zhang_han','gui_guzi','huang_shigong','chi_songzi','xun_zi','li_si','bian_que','pang_juan','mao_dun','ou_yezi','qi_huangong','song_xianggong','jin_wengong','chu_zhuangwang','wu_wang_helv','yue_wang_goujian']
export const officialHeroArt=Object.fromEntries(officialHeroKeys.map((key,i)=>[key,{name:officialCatalog.heroes[i].name,index:i}]))
export const officialItems:Omit<ItemDefinition,'id'>[]=[]
function item(name:string,star:number,slot:EquipmentSlot,icon:string,setCode?:string,focus?:keyof HeroStats){
 const power=star===5?700:star===4?280:90,stat=focus??(slot==='WEAPON'?'meleeAttack':slot==='MOUNT'?'speed':'meleeDefense')
 const flatBonuses:Partial<HeroStats>={};flatBonuses[stat]=stat==='speed'?power/5:stat==='loadCapacity'?power*8:power
 if(slot==='SHIELD'||['HELMET','ARMOR','LEGS','SHOULDER'].includes(slot)){flatBonuses.meleeDefense=power;flatBonuses.rangedDefense=power}
 const setBonuses=setCode?[{count:3,bonuses:{[stat]:5}},{count:5,bonuses:{[stat]:9}},{count:8,bonuses:{[stat]:15}},{count:10,bonuses:{[stat]:25}}]:undefined
 officialItems.push({code:'official_'+icon.split('/').at(-1)!.replace('.jpg',''),name,itemType:'EQUIPMENT',rarity:star,qualityTier:star===5?6:star===4?5:2,description:`${name}。${setCode?'穿戴同套装可获得额外属性，左右手镯与戒指各计一件。':'装备后提升英雄属性。'}可精炼，最多镶嵌三颗相容宝石。`,enabled:true,effectConfig:{slot,icon,setCode,flatBonuses,setBonuses,requiredStrength:star*5+1,refineStep:.2,initialSockets:0,sourceStatus:'ESTIMATED',sourceUrl:officialCatalog.source}})
}
officialCatalog.sets.forEach((set,i)=>set.icons.forEach((icon,p)=>item(set.name.replace('套装','')+suffix[p],set.star,slots[p],icon,'OFFICIAL_'+i,(['meleeDefense','meleeAttack','rangedAttack','loadCapacity','speed'] as const)[i%5])))
officialCatalog.singles.forEach(s=>{const id=Number(s.icon.match(/(\d+)\.jpg$/)![1]),tail=id%1000,slot:EquipmentSlot=s.star===3?(tail<=45?'MOUNT':tail<=47?'SHIELD':'WEAPON'):s.star===4?(tail<=46?'MOUNT':tail<=48?'SHIELD':'WEAPON'):(tail<=47?'MOUNT':tail<=49?'SHIELD':'WEAPON');item(s.name,s.star,slot,s.icon)})
export const forgeMaterials:Omit<ItemDefinition,'id'>[]=[
 {code:'refine_common',name:'精炼石',itemType:'MATERIAL',rarity:2,qualityTier:2,description:'精炼装备或宝物，每次消耗一枚。精炼可能失败，失败可能降低等级。',enabled:true,effectConfig:{sourceStatus:'VERIFIED'}},
 {code:'refine_stone',name:'精炼神石',itemType:'MATERIAL',rarity:3,qualityTier:5,description:'精炼装备或宝物，提高本次精炼成功率；失败仍可能降低等级。',enabled:true,effectConfig:{sourceStatus:'ESTIMATED'}},
 {code:'drill_stone',name:'天工神石',itemType:'MATERIAL',rarity:3,qualityTier:5,description:'为装备打孔，最多三孔。打孔可能失败，失败不损坏原有孔位及宝石。',enabled:true,effectConfig:{sourceStatus:'VERIFIED'}},
 ...Object.entries(statLabels).map(([stat,name]):Omit<ItemDefinition,'id'>=>({code:'gem_'+stat.toLowerCase(),name:name+'宝石',itemType:'MATERIAL',rarity:3,qualityTier:5,description:`镶嵌后增加${name}。只可镶入具有对应属性的装备，镶嵌前可查看数值。`,enabled:false,effectConfig:{gemStat:stat as keyof HeroStats,gemAmount:stat==='speed'?60:stat==='loadCapacity'?1000:300,sourceStatus:'DIY'}})),
]
export const officialItemIcons=Object.fromEntries(officialItems.map(i=>[i.name,i.effectConfig.icon!]))
