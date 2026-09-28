// Keep the entire scrollable detail panel inside the viewport, preferring the card's right side.
export function tooltipPosition(rect:{left:number;right:number;top:number},viewport:{width:number;height:number}){
  const margin=8,gap=12,width=Math.min(320,Math.max(0,viewport.width-margin*2)),height=Math.min(350,Math.max(0,viewport.height-margin*2))
  const preferred=rect.right+gap+width<=viewport.width-margin?rect.right+gap:rect.left-gap-width
  return {left:Math.max(margin,Math.min(preferred,viewport.width-width-margin))+'px',top:Math.max(margin,Math.min(rect.top,viewport.height-height-margin))+'px'}
}
