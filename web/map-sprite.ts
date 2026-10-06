// 仅清除与图片外缘连通的白色底，保留建筑内部的白墙、雪地等细节。
export function clearMapBackground(data:Uint8ClampedArray,width:number,height:number){
  const seen=new Uint8Array(width*height),queue:number[]=[]
  function visit(p:number){
    if(seen[p])return
    seen[p]=1
    const i=p*4,min=Math.min(data[i],data[i+1],data[i+2]),max=Math.max(data[i],data[i+1],data[i+2])
    if(min<210||max-min>35)return
    queue.push(p)
  }
  for(let x=0;x<width;x++){visit(x);visit((height-1)*width+x)}
  for(let y=0;y<height;y++){visit(y*width);visit(y*width+width-1)}
  for(let n=0;n<queue.length;n++){
    const p=queue[n],x=p%width,y=Math.floor(p/width)
    data[p*4+3]=0
    if(x>0)visit(p-1);if(x<width-1)visit(p+1)
    if(y>0)visit(p-width);if(y<height-1)visit(p+width)
  }
}
