// 拦截页面接收到的缩放手势，不影响普通滚动及地图自身缩放。
export function installPageZoomGuard(){
  const options={capture:true,passive:false}
  const cancel=(event:Event)=>event.preventDefault()
  const wheel=(event:WheelEvent)=>{if(event.ctrlKey||event.metaKey)event.preventDefault()}
  const key=(event:KeyboardEvent)=>{
    if((event.ctrlKey||event.metaKey)&&(['+','=','-','_','0'].includes(event.key)||['NumpadAdd','NumpadSubtract','Numpad0'].includes(event.code)))event.preventDefault()
  }
  const touch=(event:TouchEvent)=>{if(event.touches.length>1)event.preventDefault()}
  window.addEventListener('wheel',wheel,options)
  window.addEventListener('keydown',key,options)
  window.addEventListener('touchmove',touch,options)
  for(const name of ['gesturestart','gesturechange','gestureend'])window.addEventListener(name,cancel,options)
  return ()=>{
    window.removeEventListener('wheel',wheel,true);window.removeEventListener('keydown',key,true);window.removeEventListener('touchmove',touch,true)
    for(const name of ['gesturestart','gesturechange','gestureend'])window.removeEventListener(name,cancel,true)
  }
}
