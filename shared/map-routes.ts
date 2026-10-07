export interface RoutePoint{x:number;y:number}
export const projectMap=(p:RoutePoint)=>({x:1650+(p.x-p.y)*13.95,y:975-(p.x+p.y-100)*6.9})
const unproject=(p:RoutePoint)=>({x:((p.x-1650)/13.95+100-(p.y-975)/6.9)/2,y:(100-(p.y-975)/6.9-(p.x-1650)/13.95)/2})
const distance=(a:RoutePoint,b:RoutePoint)=>Math.hypot(a.x-b.x,a.y-b.y)
function curve(start:number[],segments:number[][]){
  const points:RoutePoint[]=[{x:start[0],y:start[1]}];let a=points[0]
  for(const s of segments){for(let i=1;i<=12;i++){const t=i/12,u=1-t;points.push({x:u*u*u*a.x+3*u*u*t*s[0]+3*u*t*t*s[2]+t*t*t*s[4],y:u*u*u*a.y+3*u*u*t*s[1]+3*u*t*t*s[3]+t*t*t*s[5]})}a=points[points.length-1]}
  return points
}
export const mapRivers=[
  {width:18,points:curve([910,320],[[1090,490,1170,550,1260,650],[1350,750,1460,780,1330,870],[1200,960,1240,1000,1360,1050],[1480,1100,1560,1160,1530,1280],[1500,1400,1700,1520,1940,1830]])},
  {width:8,points:curve([2680,540],[[2480,730,2320,805,2150,850],[1980,895,1910,975,1740,975],[1570,975,1490,980,1360,1050]])},
].map(r=>({...r,d:r.points.map((p,i)=>(i?'L':'M')+p.x.toFixed(2)+' '+p.y.toFixed(2)).join(' ')}))
export const mapBridges=[[0,18],[0,43],[1,18]].map(([r,i],id)=>{
  const points=mapRivers[r].points,p=points[i],a=points[i-1],b=points[i+1],length=distance(a,b),nx=-(b.y-a.y)/length,ny=(b.x-a.x)/length
  return {id,x:p.x,y:p.y,angle:Math.atan2(ny,nx)*180/Math.PI,a:unproject({x:p.x-32*nx,y:p.y-32*ny}),b:unproject({x:p.x+32*nx,y:p.y+32*ny})}
})
function intersects(a:RoutePoint,b:RoutePoint,c:RoutePoint,d:RoutePoint){
  const cross=(u:RoutePoint,v:RoutePoint,w:RoutePoint)=>(v.x-u.x)*(w.y-u.y)-(v.y-u.y)*(w.x-u.x)
  return Math.max(a.x,b.x)+1e-7>=Math.min(c.x,d.x)&&Math.max(c.x,d.x)+1e-7>=Math.min(a.x,b.x)&&Math.max(a.y,b.y)+1e-7>=Math.min(c.y,d.y)&&Math.max(c.y,d.y)+1e-7>=Math.min(a.y,b.y)&&cross(a,b,c)*cross(a,b,d)<=1e-7&&cross(c,d,a)*cross(c,d,b)<=1e-7
}
export function crossesRiver(a:RoutePoint,b:RoutePoint){const p=projectMap(a),q=projectMap(b);return mapRivers.some(r=>r.points.slice(1).some((end,i)=>intersects(p,q,r.points[i],end)))}
let graph:{points:RoutePoint[];cost:number[];previous:number[]}|undefined
function routingGraph(){
  if(graph)return graph
  const points:RoutePoint[]=Array.from({length:2601},(_,i)=>({x:i%51*2,y:Math.floor(i/51)*2})),edges:Array<Array<[number,number]>>=points.map(()=>[])
  const link=(a:number,b:number)=>{const d=distance(points[a],points[b]);edges[a].push([b,d]);edges[b].push([a,d])}
  for(let i=0;i<2601;i++)for(const [dx,dy] of [[1,0],[0,1],[1,1],[-1,1]]){const x=i%51+dx,y=Math.floor(i/51)+dy,j=y*51+x;if(x>=0&&x<=50&&y<=50&&!crossesRiver(points[i],points[j]))link(i,j)}
  for(const bridge of mapBridges){const first=points.length;for(const p of [bridge.a,bridge.b]){const id=points.length;points.push(p);edges.push([]);for(let i=0;i<2601;i++)if(distance(p,points[i])<=5&&!crossesRiver(p,points[i]))link(id,i)}link(first,first+1)}
  const cost=points.map(()=>Infinity),previous=points.map(()=>-1),visited=new Set<number>();cost[25*51+25]=0
  for(let n=0;n<points.length;n++){let best=-1;for(let i=0;i<points.length;i++)if(!visited.has(i)&&(best<0||cost[i]<cost[best]))best=i;if(best<0||!Number.isFinite(cost[best]))break;visited.add(best);for(const [j,d] of edges[best])if(cost[best]+d<cost[j]){cost[j]=cost[best]+d;previous[j]=best}}
  return graph={points,cost,previous}
}
const cache=new Map<string,RoutePoint[]>()
export function marchRoute(target:RoutePoint):RoutePoint[]{
  const home={x:50,y:50},key=target.x+','+target.y
  if(cache.has(key))return cache.get(key)!
  if(!crossesRiver(home,target)){const route=[home,target];cache.set(key,route);return route}
  const g=routingGraph();let best=-1,score=Infinity
  for(let i=0;i<g.points.length;i++){const d=distance(g.points[i],target);if(d<=5&&g.cost[i]+d<score&&!crossesRiver(g.points[i],target)){best=i;score=g.cost[i]+d}}
  if(best<0)throw Error('目标没有可通行的过桥路线')
  const route=[target];for(let i=best;i>=0;i=g.previous[i])route.push(g.points[i]);route.reverse();cache.set(key,route);return route
}
export function routeDistance(route:RoutePoint[]){return route.slice(1).reduce((sum,p,i)=>sum+distance(route[i],p),0)}
export function routePosition(route:RoutePoint[],progress:number){let remaining=routeDistance(route)*Math.max(0,Math.min(1,progress));for(let i=1;i<route.length;i++){const d=distance(route[i-1],route[i]);if(remaining<=d&&d>0){const t=remaining/d;return {x:route[i-1].x+(route[i].x-route[i-1].x)*t,y:route[i-1].y+(route[i].y-route[i-1].y)*t}}remaining-=d}return route[route.length-1]}
