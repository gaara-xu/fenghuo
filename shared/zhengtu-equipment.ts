import type {ItemDefinition,EquipmentSlot} from './items.js'
import type {HeroStats} from './hero-growth.js'
export const zhengtuSets=[
  {key:'tianmo',code:'ZT_PERFECT_TIANMO',name:'完美的天魔',prefix:'完美的',quality:4,rarity:4,power:1000,tiers:[6,10,16,25,30]},
  {key:'tianzun',code:'ZT_EXCELLENT_TIANZUN',name:'卓越的天尊',prefix:'卓越的',quality:5,rarity:5,power:2500,tiers:[9,15,24,35,45]},
  {key:'yingxiong',code:'ZT_SUPREME_HERO',name:'至尊的英雄',prefix:'至尊的',quality:7,rarity:6,power:5000,tiers:[12,20,32,45,60]},
] as const
const pieces:Array<{key:string;slot:EquipmentSlot;suffix:string;stats:Partial<HeroStats>;page:string}>=[
  {key:'weapon',slot:'WEAPON',suffix:'刀',stats:{meleeAttack:2.4,rangedAttack:.8},page:'00c-1329-00200-112476'},
  {key:'shield',slot:'SHIELD',suffix:'盾',stats:{meleeDefense:1.8,rangedDefense:1.8},page:'000-1329-00205-112526'},
  {key:'armor',slot:'ARMOR',suffix:'',stats:{meleeDefense:2,rangedDefense:2},page:'000-1329-0020c-112610'},
  {key:'helmet',slot:'HELMET',suffix:'盔',stats:{meleeDefense:1.1,rangedDefense:1.1},page:'000-1329-0020d-112620'},
  {key:'belt',slot:'LEGS',suffix:'腰带',stats:{meleeDefense:1,rangedDefense:1,loadCapacity:8},page:'006-1329-0020e-112630'},
  {key:'bracelet',slot:'BRACELET',suffix:'护腕',stats:{meleeAttack:.6,rangedAttack:.6,meleeDefense:.5,rangedDefense:.5},page:'000-1329-0020f-112638'},
  {key:'boots',slot:'BOOTS',suffix:'靴',stats:{meleeDefense:.7,rangedDefense:.7,speed:.12},page:'000-1329-00210-112649'},
  {key:'necklace',slot:'NECKLACE',suffix:'项链',stats:{meleeAttack:1,rangedAttack:1},page:'006-1329-00211-112658'},
  {key:'ring',slot:'RING',suffix:'戒指',stats:{meleeAttack:.8,rangedAttack:.8},page:'002-1329-00212-112667'},
]
export const zhengtuEquipment:Omit<ItemDefinition,'id'>[]=zhengtuSets.flatMap(set=>pieces.map(piece=>{
  const family=set.key==='tianmo'?'天魔':set.key==='tianzun'?'天尊':'英雄'
  const name=set.prefix+family+(piece.key==='armor'?(set.key==='tianmo'?'圣铠':'帝铠'):piece.suffix)
  return {code:`zt_${set.key}_${piece.key}`,name,itemType:'EQUIPMENT',rarity:set.rarity,qualityTier:set.quality,enabled:true,
    description:`${name}。${set.name}套装的一部分，左右护腕与戒指分别计件。集齐3、5、8、10、11件，近攻、远攻、近防、远防分别提高${set.tiers.join('%、')}%，仅取最高档。${piece.key==='belt'?'腰带穿戴于护腿位。':''}可精炼至+9，最多镶嵌三颗相容宝石。`,
    effectConfig:{slot:piece.slot,icon:`/art/zhengtu/${set.key}-${piece.key}.jpg`,setCode:set.code,flatBonuses:Object.fromEntries(Object.entries(piece.stats).map(([key,value])=>[key,Math.round(value*set.power)])),
      setBonuses:[3,5,8,10,11].map((count,i)=>({count,bonuses:{meleeAttack:set.tiers[i],rangedAttack:set.tiers[i],meleeDefense:set.tiers[i],rangedDefense:set.tiers[i]}})),
      requiredStrength:0,refineStep:.2,initialSockets:0,sourceStatus:'DIY',sourceUrl:`https://zt.ztgame.com/game/${piece.page}.shtml`}}
}))
export const zhengtuGrantQuantity=(item:Pick<ItemDefinition,'effectConfig'>)=>['BRACELET','RING'].includes(item.effectConfig.slot??'')?2:1
