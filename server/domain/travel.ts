// 单机地图的时间适配，不是原作地图单位：100速度为基准，最短1秒。
export function travelSeconds(distance:number,speed:number):number{
  return Math.max(1,(15+Math.max(0,distance)*2)*100/Math.max(1,speed))
}
