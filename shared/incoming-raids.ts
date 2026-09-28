import type {WorldBossRules} from './world-boss.js'
export const INCOMING_RAID_VERSION='0022_incoming_raids'
export const RAID_TRAVEL_SECONDS=300
export const RAID_UNIT_POWER=100
export interface IncomingRaidRules extends Pick<WorldBossRules,'itemChance'|'quantities'> {enabled:boolean;attackMin:number;attackMax:number}
export const defaultIncomingRaidRules:IncomingRaidRules={enabled:true,attackMin:10000,attackMax:100000,itemChance:.25,quantities:{EQUIPMENT:{min:1,max:2},TREASURE:{min:1,max:2},SKILL_BOOK:{min:2,max:5},CONSUMABLE:{min:5,max:20},GEM:{min:100,max:1000},MATERIAL:{min:10,max:50}}}
export interface IncomingRaid {id:number;name:string;attackPower:number;troopCount:number;attackType:'MELEE'|'RANGED'|'BALANCED';originX:number;originY:number;departGameAt:string;arriveGameAt:string}
export function raidCountdown(arrive:string,now:number){const n=Math.max(0,Math.ceil((Date.parse(arrive)-now)/1000));return n?`${Math.floor(n/60)}分${String(n%60).padStart(2,'0')}秒`:'正在交战'}
