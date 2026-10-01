import type {HeroStats} from './hero-growth.js'
import type {Wallet} from './contracts.js'
import {foodRates,type UpkeepState} from './upkeep.js'
export type MilitaryKind='TROOP'|'DEFENSE'
export interface MilitaryDefinition extends HeroStats {code:string;name:string;kind:MilitaryKind;role:string;description:string;cost:Partial<Wallet>;seconds:number;foodPerHour:number;enabled:boolean;sourceStatus:'VERIFIED'|'ESTIMATED'|'DIY';sourceNote:string}
export interface ArmyStack {code:string;name:string;kind:'HERO'|'TROOP'|'FORT';quantity:number;stats:HeroStats;foodPerHour?:number}
export interface TroopSelection {code:string;quantity:number}
export interface MilitaryOrder {id:number;code:string;name:string;kind:MilitaryKind;quantity:number;completed:number;seconds:number;startGameAt:string;endGameAt:string}
export interface DefenseHero {heroId:number;name:string;meleeDefense:number;rangedDefense:number}
export interface MilitaryState {definitions:MilitaryDefinition[];stock:Record<string,number>;orders:MilitaryOrder[];defense:{melee:number;ranged:number;heroes?:DefenseHero[]};ready:boolean;upkeep?:UpkeepState}
export interface MilitarySpeedupResult {orderId:number;goldSpent:number;completedUnits:number;savedSeconds:number;completedAt:string;alreadyCompleted?:boolean;replayed?:boolean}
export const MAX_MILITARY_ORDER_QUANTITY=1000
export const SPEEDUP_SECONDS_PER_GOLD=300
export function remainingProductionMs(order:MilitaryOrder,now:number){return Math.max(0,Math.min((order.quantity-order.completed)*order.seconds*1000,Date.parse(order.endGameAt)-Math.max(now,Date.parse(order.startGameAt))))}
export function speedupGoldCost(order:MilitaryOrder,now:number){return Math.ceil(remainingProductionMs(order,now)/(SPEEDUP_SECONDS_PER_GOLD*1000))}
export interface UnitLoss {code:string;name:string;sent:number;lost:number;remaining:number}
const costs=(food:number,wood:number,stone:number,iron:number,gold=0)=>({food,wood,stone,iron,gold})
const sourceNote='兵种属性据旧资料交叉整理；招募资源与满建筑耗时尚无完整原表，采用可调单机值。'
function troop(code:string,name:string,role:string,stats:number[],cost:Partial<Wallet>,seconds:number):MilitaryDefinition{return {code,name,kind:'TROOP',role,description:role+'，可与其他兵种混编出征。',meleeAttack:stats[0],rangedAttack:stats[1],meleeDefense:stats[2],rangedDefense:stats[3],speed:stats[4],loadCapacity:stats[5],cost,seconds,foodPerHour:foodRates[code]??0,enabled:true,sourceStatus:'ESTIMATED',sourceNote}}
function fort(code:string,name:string,melee:number,ranged:number,cost:Partial<Wallet>,seconds:number):MilitaryDefinition{return {...troop(code,name,melee===ranged?'双防城防':melee>ranged?'近防城防':'远防城防',[0,0,melee,ranged,0,0],cost,seconds),kind:'DEFENSE',description:(melee===ranged?'同时抵御近程与远程攻势。':melee>ranged?'侧重抵御近程部队，远程防御较弱。':'侧重抵御远程部队，近程防御较弱。')+'建成后参与本城防御。',sourceNote:'原作城防分近防与远防；当前数值、价格和满建筑耗时为待校准配置。'}}
export const militaryDefaults:MilitaryDefinition[]=[
 troop('supply','粮草兵','运输',[5,0,5,1,700,400],costs(60,30,10,10),8),
 troop('cart','运输车','重型运输',[20,0,20,4,400,2500],costs(180,350,100,120),25),
 troop('spear_guard','枪盾兵','近防步兵',[40,0,120,30,400,40],costs(100,80,40,100),12),
 troop('crossbow_guard','强弩兵','远防步兵',[0,40,30,120,400,40],costs(100,100,40,80),12),
 troop('pikeman','长枪兵','近攻步兵',[180,0,60,10,500,50],costs(140,100,40,160),18),
 troop('archer','弓箭兵','远攻步兵',[0,180,10,60,500,50],costs(140,160,40,100),18),
 troop('lance_cavalry','骑枪战将','近攻骑兵',[900,0,300,240,800,200],costs(600,300,200,500),60),
 troop('mounted_archer','骑射战将','远攻骑兵',[0,900,240,300,800,200],costs(600,500,200,300),60),
 troop('heavy_general','重甲将军','双防重装',[250,250,2500,2500,350,1000],costs(1800,1200,1500,2200),180),
 fort('wall','城墙',150,150,costs(0,80,160,25),30),
 fort('trap','陷阱',180,30,costs(0,100,40,80),20),
 fort('tower','箭塔',30,180,costs(0,140,90,60),30),
 fort('advanced_trap','高级陷阱',900,150,costs(0,500,400,500),90),
 fort('advanced_tower','高级箭塔',150,900,costs(0,700,500,300),100),
 fort('fire_box','火箱',1600,1600,costs(0,1200,800,1400,80),180),
]
export function stackFromDefinition(d:MilitaryDefinition,quantity:number):ArmyStack{return {code:d.code,name:d.name,kind:d.kind==='TROOP'?'TROOP':'FORT',quantity,foodPerHour:d.foodPerHour,stats:{meleeAttack:d.meleeAttack,rangedAttack:d.rangedAttack,meleeDefense:d.meleeDefense,rangedDefense:d.rangedDefense,speed:d.speed,loadCapacity:d.loadCapacity}}}
export function armyStats(stacks:ArmyStack[]):HeroStats{
 const total:HeroStats={meleeAttack:0,rangedAttack:0,meleeDefense:0,rangedDefense:0,speed:0,loadCapacity:0}
 for(const s of stacks.filter(s=>s.quantity>0)){for(const k of ['meleeAttack','rangedAttack','meleeDefense','rangedDefense','loadCapacity'] as const)total[k]+=s.stats[k]*s.quantity;if(s.stats.speed>0)total.speed=total.speed?Math.min(total.speed,s.stats.speed):s.stats.speed}
 return total
}
export function completedUnits(start:number,seconds:number,quantity:number,now:number){return Math.max(0,Math.min(quantity,Math.floor((now-start)/(seconds*1000))))}
export function durationText(seconds:number){const n=Math.max(0,Math.ceil(seconds));return n>=3600?`${Math.floor(n/3600)}时${Math.floor(n%3600/60)}分`:n>=60?`${Math.floor(n/60)}分${n%60}秒`:`${n}秒`}
export function weightedDefense(attackMelee:number,attackRanged:number,defenseMelee:number,defenseRanged:number){const total=attackMelee+attackRanged;return total>0?(defenseMelee*attackMelee+defenseRanged*attackRanged)/total:Math.max(defenseMelee,defenseRanged)}
export function npcArmy(power:number,bias:string,city:boolean):ArmyStack[]{
 const stats=(m:number,r:number)=>({meleeAttack:0,rangedAttack:0,meleeDefense:m,rangedDefense:r,speed:0,loadCapacity:0})
 const m=power*(bias==='MELEE'?1.5:bias==='RANGED'?.5:1),r=power*(bias==='RANGED'?1.5:bias==='MELEE'?.5:1),fraction=city?.65:1
 const army:ArmyStack[]=[{code:'garrison',name:'驻守部队',kind:'TROOP',quantity:1,stats:stats(m*fraction,r*fraction)}]
 if(city)army.push({code:'city_forts',name:'城池防御工事',kind:'FORT',quantity:1,stats:stats(m*.35,r*.35)})
 return army
}
