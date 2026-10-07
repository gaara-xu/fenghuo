import type {ItemDefinition,EquipmentSlot} from './items.js'
import type {HeroStats} from './hero-growth.js'
export const zhengtuSets=[
  {key:'tianmo',code:'ZT_PERFECT_TIANMO',name:'完美的天魔',prefix:'完美的',quality:4,rarity:4,power:1000,tiers:[6,10,16,25,30]},
  {key:'tianzun',code:'ZT_EXCELLENT_TIANZUN',name:'卓越的天尊',prefix:'卓越的',quality:3,rarity:3,power:1600,tiers:[8,12,20,28,35]},
  {key:'yingxiong',code:'ZT_SUPREME_HERO',name:'至尊的英雄',prefix:'至尊的',quality:7,rarity:6,power:5000,tiers:[12,20,32,45,60]},
] as const
const supremeText='至尊宝物计入套装；13件近远攻防提高100%；15件近远攻防提高200%、速度提高50%、负重提高100%，仅取最高档。'
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
    effectConfig:{slot:piece.slot,icon:`/art/zhengtu/${set.key}-${piece.key}.svg`,setCode:set.code,flatBonuses:Object.fromEntries(Object.entries(piece.stats).map(([key,value])=>[key,Math.round(value*set.power)])),
      setBonuses:[3,5,8,10,11].map((count,i)=>({count,bonuses:{meleeAttack:set.tiers[i],rangedAttack:set.tiers[i],meleeDefense:set.tiers[i],rangedDefense:set.tiers[i]}})),
      requiredStrength:0,refineStep:.2,initialSockets:0,sourceStatus:'DIY',sourceUrl:`https://zt.ztgame.com/game/${piece.page}.shtml`}}
}))
export const zhengtuGrantQuantity=(item:Pick<ItemDefinition,'effectConfig'>)=>['BRACELET','RING'].includes(item.effectConfig.slot??'')?2:1
export const zhengtuExtras:Omit<ItemDefinition,'id'>[]=zhengtuSets.flatMap(set=>[
  {key:'shoulder',name:set.name+'肩铠',slot:'SHOULDER' as const,type:'EQUIPMENT' as const,stats:{meleeDefense:1.2,rangedDefense:1.2}},
  {key:'mount',name:set.prefix+({tianmo:'赤兔马',tianzun:'天马',yingxiong:'圣马'})[set.key],slot:'MOUNT' as const,type:'EQUIPMENT' as const,stats:{speed:.6,loadCapacity:12}},
  {key:'war_charm',name:set.name+'战魂坠',slot:undefined,type:'TREASURE' as const,stats:{meleeAttack:1.5,rangedAttack:1.5}},
  {key:'ward_mirror',name:set.name+'护心镜',slot:undefined,type:'TREASURE' as const,stats:{meleeDefense:1.8,rangedDefense:1.8}},
].map(p=>({code:`zt_${set.key}_${p.key}`,name:p.name,itemType:p.type,rarity:set.rarity,qualityTier:set.quality,enabled:true,
 description:p.type==='TREASURE'?`${p.name}。${p.key==='war_charm'?'凝聚战意，提高近攻和远攻。':'护佑将身，提高近防和远防。'}可放入任一宝物位，可精炼至+9。`:`${p.name}。${p.key==='mount'?'提升行军速度和负重。':'提升近防和远防。'}计入${set.name}套装，沿用3、5、8、10、11件加成，取最高档。可精炼、打孔和镶嵌。`,
 effectConfig:{slot:p.slot,icon:`/art/zhengtu/${set.key}-${p.key}.svg`,flatBonuses:Object.fromEntries(Object.entries(p.stats).map(([k,v])=>[k,Math.round(v*set.power)])),setCode:p.type==='EQUIPMENT'?set.code:undefined,setBonuses:p.type==='EQUIPMENT'?zhengtuEquipment.find(i=>i.effectConfig.setCode===set.code)!.effectConfig.setBonuses:undefined,requiredStrength:0,refineStep:.2,initialSockets:0,sourceStatus:'DIY'}})))

// 全部至尊部件共享完整阶梯，包含两个宝物位；低品质套装保持原规则。
for(const item of [...zhengtuEquipment,...zhengtuExtras].filter(i=>i.code.startsWith('zt_yingxiong_'))){
 item.effectConfig.setCode='ZT_SUPREME_HERO'
 item.effectConfig.setBonuses=[
  ...[3,5,8,10,11].map((count,i)=>({count,bonuses:{meleeAttack:zhengtuSets[2].tiers[i],rangedAttack:zhengtuSets[2].tiers[i],meleeDefense:zhengtuSets[2].tiers[i],rangedDefense:zhengtuSets[2].tiers[i]}})),
  {count:13,bonuses:{meleeAttack:100,rangedAttack:100,meleeDefense:100,rangedDefense:100}},
  {count:15,bonuses:{meleeAttack:200,rangedAttack:200,meleeDefense:200,rangedDefense:200,speed:50,loadCapacity:100}},
 ]
 item.description+=' '+supremeText
}
