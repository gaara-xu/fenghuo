import {expect,it} from 'vitest'
import {crossesRiver,mapBridges,marchRoute,routeDistance,routePosition} from '../shared/map-routes'
import {travelSeconds} from '../server/domain/travel'
it('全图刷新坐标均可达，跨河路段只走三座桥，返程沿原路线',()=>{
  expect(mapBridges).toHaveLength(3)
  const used=new Set<number>()
  for(let x=0;x<=100;x+=4)for(let y=0;y<=100;y+=4){
    const route=marchRoute({x,y})
    expect(routePosition(route,0)).toEqual({x:50,y:50});expect(routePosition(route,1).x).toBeCloseTo(x);expect(routePosition(route,1).y).toBeCloseTo(y)
    expect(routeDistance(route)).toBeGreaterThanOrEqual(Math.hypot(x-50,y-50)-1e-6)
    for(let i=1;i<route.length;i++)if(crossesRiver(route[i-1],route[i])){
      const bridge=mapBridges.find(b=>(route[i-1]===b.a&&route[i]===b.b)||(route[i-1]===b.b&&route[i]===b.a))
      expect(bridge).toBeDefined();used.add(bridge!.id)
    }
  }
  expect(used.size).toBe(3)
})
it('远距离增加基础耗时，同时保留速度差别',()=>{
  expect(travelSeconds(50,5000)).toBeGreaterThan(100)
  expect(travelSeconds(50,5000)).toBeLessThan(travelSeconds(50,4900))
  expect(travelSeconds(70,5000)).toBeGreaterThan(travelSeconds(30,5000))
})
