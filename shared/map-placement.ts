export interface MapPoint {x:number;y:number}
// Measure clearance on the isometric screen, not just unique database coordinates.
// 与三倍地图的投影一致；坐标不重复仍可能出现图标、名称重叠。
export function mapClearance(a:MapPoint,b:MapPoint){
  return Math.max(Math.abs((a.x-a.y-b.x+b.y)*13.95)/108,Math.abs((a.x+a.y-b.x-b.y)*6.9)/72)
}
const candidates:MapPoint[]=Array.from({length:26*26},(_,i)=>({x:(i%26)*4,y:Math.floor(i/26)*4}))
export function chooseMapPosition(occupied:readonly MapPoint[],random:()=>number=Math.random):MapPoint|undefined {
  const blockers=[{x:50,y:50},...occupied]
  // 所有可用位置等概率抽取；最远点排名会把每次刷新锁在四角附近。
  const pool=candidates.filter(p=>blockers.every(b=>mapClearance(p,b)>=1))
  if(!pool.length)return undefined
  return {...pool[Math.max(0,Math.min(pool.length-1,Math.floor(random()*pool.length)))]}
}
