import {expect,it} from 'vitest'
import {clearMapBackground} from '../web/map-sprite'
it('清除外部白底与近白压缩噪点，保留建筑内白色细节',()=>{
  const data=new Uint8ClampedArray(7*7*4).fill(255)
  for(let y=1;y<6;y++)for(let x=1;x<6;x++)if(x===1||x===5||y===1||y===5)data.set([80,70,40,255],(y*7+x)*4)
  data.set([235,233,230,255],0)
  clearMapBackground(data,7,7)
  expect(data[3]).toBe(0)
  expect(data[(6*7+6)*4+3]).toBe(0)
  expect(Array.from(data.slice((3*7+3)*4,(3*7+3)*4+4))).toEqual([255,255,255,255])
  expect(data[(1*7+1)*4+3]).toBe(255)
})
