// 四类可搬运资源共用英雄负重；金币和道具不占此处资源负重。
export function carriedRewards(rewards:Record<string,number>,capacity:number):Record<string,number>{
  const keys=['food','wood','stone','iron'],total=keys.reduce((n,k)=>n+Math.max(0,rewards[k]??0),0),ratio=total>0?Math.min(1,Math.max(0,capacity)/total):1
  return Object.fromEntries(Object.entries(rewards).map(([k,v])=>[k,Math.floor(Math.max(0,v)*(keys.includes(k)?ratio:1))]))
}
