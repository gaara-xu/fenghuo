export interface MapPoint {x:number;y:number}
// Measure clearance on the isometric screen, not just unique database coordinates.
// A six-coordinate step is only ~28px horizontally: unique points can still overlap.
export function mapClearance(a:MapPoint,b:MapPoint){
  return Math.max(Math.abs((a.x-a.y-b.x+b.y)*4.65)/108,Math.abs((a.x+a.y-b.x-b.y)*2.3)/72)
}
const candidates:MapPoint[]=Array.from({length:26*26},(_,i)=>({x:(i%26)*4,y:Math.floor(i/26)*4}))
export function chooseMapPosition(occupied:readonly MapPoint[],random:()=>number=Math.random):MapPoint|undefined {
  const blockers=[{x:50,y:50},...occupied]
  const ranked=candidates.map(p=>({p,score:Math.min(...blockers.map(b=>mapClearance(p,b)))})).filter(c=>c.score>=1).sort((a,b)=>b.score-a.score)
  if(!ranked.length)return undefined
  // Pick among well-separated farthest candidates, spreading successive targets over the whole map.
  const pool=ranked.filter(c=>c.score>=Math.max(1,ranked[0].score*.9))
  return {...pool[Math.min(pool.length-1,Math.floor(random()*pool.length))].p}
}
