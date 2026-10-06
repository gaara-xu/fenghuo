import {describe,it,expect} from 'vitest'
import {chooseMapPosition,mapClearance,type MapPoint} from '../shared/map-placement'
import {SeededRandom} from '../server/domain/random'
describe('地图目标分散布局',()=>{
 it('不同随机序列保持图标间距，并能抽到全图与内部位置',()=>{
  const samples:MapPoint[]=[]
  for(let seed=0;seed<100;seed++){
   const random=new SeededRandom('map:'+seed),occupied:MapPoint[]=[]
   for(let n=0;n<13;n++){const p=chooseMapPosition(occupied,()=>random.next());expect(p).toBeDefined();expect(mapClearance(p!,{x:50,y:50})).toBeGreaterThanOrEqual(1);for(const prior of occupied)expect(mapClearance(p!,prior)).toBeGreaterThanOrEqual(1);occupied.push(p!)}
   samples.push(...occupied)
  }
  const xs=samples.map(p=>p.x-p.y),ys=samples.map(p=>p.x+p.y-100)
  expect(Math.min(...xs)).toBeLessThan(-70);expect(Math.max(...xs)).toBeGreaterThan(70);expect(Math.min(...ys)).toBeLessThan(-70);expect(Math.max(...ys)).toBeGreaterThan(70)
  expect(samples.filter(p=>p.x>20&&p.x<80&&p.y>20&&p.y<80).length).toBeGreaterThan(200)
  const first=Array.from({length:100},(_,i)=>chooseMapPosition([],()=>i/100)!)
  expect(new Set(first.map(p=>p.x+':'+p.y)).size).toBe(100)
 })
 it('重复使用同一个随机值也不会复用位置；保留其他目标与主城空间',()=>{
  const locked=[{x:20,y:80},{x:80,y:20}],points=[...locked]
  for(let n=0;n<12;n++){const p=chooseMapPosition(points,()=>.5);expect(p).toBeDefined();for(const prior of points)expect(mapClearance(p!,prior)).toBeGreaterThanOrEqual(1);points.push(p!)}
  expect(new Set(points.map(p=>p.x+':'+p.y)).size).toBe(points.length)
 })
 it('无空位返回空值，不重叠或覆盖原有坐标',()=>{
  const full=Array.from({length:26*26},(_,i)=>({x:i%26*4,y:Math.floor(i/26)*4}));expect(chooseMapPosition(full)).toBeUndefined()
 })
})
