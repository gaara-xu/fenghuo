import type { HeroStats } from './hero-growth.js'
import type { EquippedItem,InventoryEntry,Loot,ItemDefinition } from './items.js'
export type CurrencyCode = 'food' | 'wood' | 'stone' | 'iron' | 'gold' | 'coupon'
export type TalentGrade = 'MEDIOCRE' | 'COMMON' | 'GOOD' | 'EXCELLENT' | 'PERFECT'
export type RewardType = 'HERO' | 'SKILL_BOOK' | 'ITEM'

export interface Wallet {
  food: number
  wood: number
  stone: number
  iron: number
  gold: number
  coupon: number
}

export interface PlayerSummary {
  id: number
  displayName: string
  cityName: string
  nationCode: string
  wallet: Wallet
}

export interface HeroDefinition {
  id: number
  code: string
  name: string
  star: number
  qualityTier?:number
  attackType: 'MELEE' | 'RANGED' | 'BALANCED' | 'DEFENSE'
  meleeAttack: number
  rangedAttack: number
  meleeDefense: number
  rangedDefense: number
  speed: number
  loadCapacity: number
  staminaMax: number
  enabled: boolean
  sourceStatus: 'VERIFIED' | 'ESTIMATED' | 'DIY'
  description: string
  portraitKey?: string | null
}

export interface SkillDefinition {
  id: number
  code: string
  name: string
  rarity: number
  qualityTier?:number
  effectType: string
  targetScope: string
  triggerRate: number
  maxLevel: number
  enabled: boolean
  sourceStatus: 'VERIFIED' | 'ESTIMATED' | 'DIY'
  description: string
  iconKey?: string | null
  effectConfig?: SkillEffectConfig
  levels?: SkillLevel[]
}

export interface SkillEffectConfig { base:number; perLevel:number; ratePerLevel:number; mode:'ATTACK'|'DEFENSE'|'BOTH' }
export interface SkillLevel { level:number; effectValue:number; upgradeExp:number; sameBookCost:number }
export interface LearnedSkill { slotNo:number; skillDefinitionId:number; name:string; level:number; iconKey?:string|null; description:string; effectType:string; targetScope:string; triggerRate:number; effectValue:number; mode:SkillEffectConfig['mode']; upgradeExp:number; maxLevel:number;qualityTier?:number;sameBookCost?:number;nextEffectValue?:number;nextTriggerRate?:number }
export interface SkillEvent { name:string; level:number; side:'ATTACK'|'DEFENSE'; triggered:boolean; reason:string; effectValue:number; triggerRate:number; target:string; message:string }

export interface TavernPool {
  id: number
  code: string
  name: string
  poolType: 'HERO' | 'SKILL' | 'MIXED' | 'ITEM'
  currencyCode: CurrencyCode
  refreshCost: number
  candidateCount: number
  selectLimit: number
  enabled: boolean
}

export interface TavernCandidate {
  id: number
  slotNo: number
  rewardType: RewardType
  heroDefinitionId?: number
  skillDefinitionId?: number
  itemDefinitionId?: number
  item?: ItemDefinition
  name: string
  rarity: number
  talentGrade?: TalentGrade
  recruited: boolean
}

export interface TavernRefreshResult {
  refreshId: number
  pool: TavernPool
  candidates: TavernCandidate[]
  remainingCurrency: number
  createdAt: string
}

export interface GameClock {
  multiplier: number
  offsetSeconds: number
  gameNow: string
}

export interface MapNode {
  id: number
  nodeType: 'OUTPOST' | 'WILD' | 'DUNGEON' | 'SYSTEM_CITY' | 'RANDOM_CITY'
  name: string
  level: number
  x: number
  y: number
  defenseBias: 'MELEE' | 'RANGED' | 'BALANCED'
  status: string
  worldBoss?: boolean
  expiresGameAt?: string
  rewardHint: string
  defensePower?:number
  meleeDefense?:number
  rangedDefense?:number
  dropFactor?:number
}

export interface BootstrapPayload {
  player: PlayerSummary
  clock: GameClock
  pools: TavernPool[]
  latestRefresh: TavernRefreshResult | null
  latestRefreshes?: TavernRefreshResult[]
  tavernRecordingEnabled?: boolean
  mapNodes: MapNode[]
}

export interface OwnedHero {
  id: number
  name: string
  originalName?:string
  star: number
  level: number
  talentGrade: TalentGrade
  stamina: number
  power: number
  qualityTier?:number
  stats:HeroStats
  nextStats:HeroStats|null
  upgradeExp:number
  busy:boolean
  equipment:EquippedItem[]
  heroDefinitionId:number
  portraitKey?:string|null
  experience:number
  unlockedSlots:number
  skills:LearnedSkill[]
}

export interface WorldStatus {
  incomingArmies?:import('./incoming-raids.js').IncomingRaid[]
  ownedHeroes: OwnedHero[]
  inventory:InventoryEntry[]
  marches: Array<{ id:number; targetName:string; heroName:string; status:string; arriveGameAt:string; departGameAt:string; returnGameAt?:string;heroId:number;targetX:number;targetY:number;portraitKey?:string; result?:string;troops?:Array<{name:string;quantity:number}> }>
  autoFarmJobs: Array<{ id:number; heroName:string;heroId:number; nodeType:MapNode['nodeType']; minLevel:number; maxLevel:number; runsRemaining:number|null; status:string; nextRunGameAt:string; lastError?:string;targetName?:string;totalRuns?:number|null;completedRuns?:number;phase?:string;roundTripSeconds?:number }>
  reports: BattleReport[]
  incoming:IncomingReportPage
  skillBooks:Array<{skillDefinitionId:number; quantity:number}>
  defenses: Array<{ id:number; defenseType:string; level:number; quantity:number; damagedQuantity:number; unitCost:{wood:number;stone:number;iron:number} }>
}

export interface BattleReport {id:number;direction:'OUTGOING'|'INCOMING';title:string;result:'VICTORY'|'DEFEAT'|'DRAW';reward:Partial<Wallet>;occurredGameAt:string;skillEvents:SkillEvent[];basePower?:number;finalPower?:number;enemyPower?:number;loot?:Loot[];targetLevelBefore?:number;targetLevelAfter?:number;outpostLevelBefore?:number;outpostLevelAfter?:number;meleeAttack?:number;rangedAttack?:number;meleeDefense?:number;rangedDefense?:number;troopLosses?:import('./military.js').UnitLoss[];incomingRaidId?:number;attackPower?:number;defensePower?:number;attackerLosses?:import('./military.js').UnitLoss[]}
export interface IncomingReportPage {reports:BattleReport[];total:number;nextCursor:number|null}
