// 实际过桥路线按统一距离系数换算，全部耗时受速度影响。
// 距离50、速度5000约100秒；速度翻倍时耗时减半（最低1秒）。
export function travelSeconds(distance:number,speed:number):number{
  return Math.max(1,(1500+Math.max(0,distance)*10000)/Math.max(1,speed))
}
