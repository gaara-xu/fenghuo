import type {ItemDefinition,Loot} from './items.js'
import type {ArmyStack} from './military.js'

export const WORLD_BOSS_LEVEL=200
export const WORLD_BOSS_LIFETIME_SECONDS=300
// Single-player extension: extrapolate the existing outpost curve without its level-20 cap.
export const WORLD_BOSS_POWER=500*(WORLD_BOSS_LEVEL**3+WORLD_BOSS_LEVEL)
export const bossLootLabels={EQUIPMENT:'装备',TREASURE:'宝物',SKILL_BOOK:'技能书',CONSUMABLE:'消耗品',GEM:'宝石',MATERIAL:'其他材料'} as const
export type BossLootCategory=keyof typeof bossLootLabels
export interface WorldBossStrength {level:number;meleeDefense:number;rangedDefense:number}
export interface WorldBossRules extends WorldBossStrength {enabled:boolean;spawnChance:number;itemChance:number;quantities:Record<BossLootCategory,{min:number;max:number}>}
export const defaultWorldBossRules:WorldBossRules={enabled:true,level:WORLD_BOSS_LEVEL,meleeDefense:WORLD_BOSS_POWER,rangedDefense:WORLD_BOSS_POWER,spawnChance:.2,itemChance:.8,quantities:{EQUIPMENT:{min:5,max:20},TREASURE:{min:5,max:20},SKILL_BOOK:{min:20,max:100},CONSUMABLE:{min:50,max:200},GEM:{min:1000,max:10000},MATERIAL:{min:100,max:1000}}}
function bossConfig(raw:unknown):Record<string,unknown>{try{const c=typeof raw==='string'?JSON.parse(raw):raw;return c&&typeof c==='object'?c:{}}catch{return {}}}
export function worldBossDefenses(raw:unknown){const c=bossConfig(raw),valid=(n:unknown)=>typeof n==='number'&&Number.isSafeInteger(n)&&n>0&&n<=1e12;return {meleeDefense:valid(c.meleeDefense)?c.meleeDefense as number:WORLD_BOSS_POWER,rangedDefense:valid(c.rangedDefense)?c.rangedDefense as number:WORLD_BOSS_POWER}}
export function worldBossArmy(raw:unknown):ArmyStack[]{return [{code:'garrison',name:'首领守军',kind:'TROOP',quantity:1,stats:{...worldBossDefenses(raw),meleeAttack:0,rangedAttack:0,speed:0,loadCapacity:0}}]}
export function worldBossExpiresAt(raw:unknown):string|undefined {const t=bossConfig(raw).expiresGameAt;return typeof t==='string'&&Number.isFinite(Date.parse(t))?t:undefined}
export function worldBossExpired(raw:unknown,now:Date|number){const t=worldBossExpiresAt(raw);return Boolean(t&&Date.parse(t)<=Number(now))}
export function worldBossCountdown(expires:string|undefined,now:number){if(!expires)return '限时5分钟';const n=Math.max(0,Math.ceil((Date.parse(expires)-now)/1000));return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`}
export function worldBossGarrison(rules:WorldBossStrength,now:Date){return {worldBoss:true,power:Math.max(rules.meleeDefense,rules.rangedDefense),meleeDefense:rules.meleeDefense,rangedDefense:rules.rangedDefense,expiresGameAt:new Date(now.getTime()+WORLD_BOSS_LIFETIME_SECONDS*1000).toISOString()}}
export function isWorldBoss(raw:unknown):boolean {
  try{const c=typeof raw==='string'?JSON.parse(raw):raw;return Boolean(c&&typeof c==='object'&&'worldBoss' in c&&c.worldBoss===true)}catch{return false}
}
export function worldBossAfterBattle(victory:boolean,level=WORLD_BOSS_LEVEL,raw?:unknown){const d=worldBossDefenses(raw);return {level:victory?0:level,power:victory?0:Math.max(d.meleeDefense,d.rangedDefense),status:victory?'DEPLETED':'ACTIVE'} as const}
export function rollWorldBossLoot(items:ItemDefinition[],rules:WorldBossRules,random:()=>number):Loot[]{
  const loot:Loot[]=[]
  for(const item of items){
    const gem=item.itemType==='MATERIAL'&&Boolean(item.effectConfig.gemStat||item.effectConfig.gemFamily||item.effectConfig.gemLevel)
    // Each level-one gem type rolls independently; higher/legacy unlevelled gems never enter material loot.
    if(gem&&item.effectConfig.gemLevel!==1)continue
    if(!item.enabled||item.deletedAt||random()>=rules.itemChance)continue
    const category:BossLootCategory=gem?'GEM':item.itemType
    const range=rules.quantities[category]
    loot.push({itemId:item.id,name:item.name,quantity:range.min+Math.floor(random()*(range.max-range.min+1))})
  }
  return loot
}
