// 实际过桥路线距离：每单位至少2秒路程，另计按部队速度缩放的行军耗时。
export function travelSeconds(distance:number,speed:number):number{
  return Math.max(1,Math.max(0,distance)*2+(15+Math.max(0,distance)*8)*100/Math.max(1,speed))
}
