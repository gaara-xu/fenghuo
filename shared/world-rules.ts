export const MAX_OWNED_HEROES = 6
export const MAX_OUTPOST_LEVEL = 20
// Local refresh balance: 1–5 = 5%, 6–10 = 10%, 11–15 = 25%, 16–20 = 60%.
// Each level in a band has the same weight. Combat/drop rules are independent.
export const OUTPOST_LEVEL_WEIGHTS:readonly number[]=Object.freeze(Array.from({length:MAX_OUTPOST_LEVEL},(_,i)=>i<5?1:i<10?2:i<15?5:12))
export function rollOutpostLevel(roll:number=Math.random()):number {
  if(!Number.isFinite(roll)||roll<0||roll>=1)throw new Error('据点刷新随机数须在0至1之间')
  let cursor=roll*OUTPOST_LEVEL_WEIGHTS.reduce((sum,weight)=>sum+weight,0)
  for(let i=0;i<OUTPOST_LEVEL_WEIGHTS.length;i++){cursor-=OUTPOST_LEVEL_WEIGHTS[i];if(cursor<0)return i+1}
  return MAX_OUTPOST_LEVEL
}
export function outpostLevel(level:number):number { return Math.max(0,Math.min(MAX_OUTPOST_LEVEL,Math.floor(level))) }
export function outpostDefense(level:number):number { const n=outpostLevel(level);return 500*(n*n*n+n) }
// Multiplier of the administrator's configured drop-pool chance, not an extra roll.
export function outpostDropFactor(level:number):number { const n=outpostLevel(level);return n===0?0:0.25+0.75*(n-1)/(MAX_OUTPOST_LEVEL-1) }
export function outpostAfterAttack(level:number){const next=Math.max(0,outpostLevel(level)-1);return {level:next,power:outpostDefense(next),status:next===0?'DEPLETED':'ACTIVE'} as const}
export function targetAfterAttack(nodeType:string,level:number,power:number){
  if(nodeType==='OUTPOST')return outpostAfterAttack(level)
  const before=Math.max(0,Math.floor(level)),next=Math.max(0,before-1)
  return {level:next,power:before>0?Math.max(0,Math.round(power*next/before)):0,status:next===0?'DEPLETED':'ACTIVE'} as const
}
