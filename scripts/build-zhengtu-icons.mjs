import fs from 'node:fs/promises'
const root=new URL('../public/art/zhengtu/',import.meta.url)
const files=(await fs.readdir(root)).filter(f=>/^(tianmo|tianzun|yingxiong)-.*\.jpg$/.test(f))
const entries=files.map(file=>({name:file.replace('.jpg',''),file,crop:file.includes('-armor')?'20 40 105 140':undefined}))
for(const family of ['tianmo','tianzun','yingxiong'])entries.push(
 {name:family+'-shoulder',file:family+'-armor.jpg',crop:'5 45 70 65'},
 {name:family+'-war_charm',file:family+'-necklace.jpg'},
 {name:family+'-ward_mirror',file:family+'-shield.jpg'},
 {name:family+'-mount',file:({tianmo:'chitu',tianzun:'tianma',yingxiong:'shengma'})[family]+'.jpg',crop:({tianmo:'32 65 140 180',tianzun:'70 86 238 160',yingxiong:'7 280 41 41'})[family]})
for(const e of entries){
 const data=(await fs.readFile(new URL(e.file,root))).toString('base64')
 // SVG界面包装保留原图：紧凑取景、统一深色底、去除高亮近白背景。
 const content=`<image href="data:image/jpeg;base64,${data}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet"/>`
 // 取景图片使用其原始尺寸，避免裁切坐标随外框改变。
 const raw=await fs.readFile(new URL(e.file,root));let i=2,width=0,height=0
 while(i<raw.length){if(raw[i]!==255){i++;continue}const marker=raw[i+1],len=raw.readUInt16BE(i+2);if([192,193,194].includes(marker)){height=raw.readUInt16BE(i+5);width=raw.readUInt16BE(i+7);break}i+=2+len}
 if(!width||!height)throw Error('JPEG尺寸读取失败 '+e.file)
 const crop=e.crop??`0 0 ${width} ${height}`
 const picture=`<svg x="7" y="7" width="114" height="114" viewBox="${crop}" preserveAspectRatio="xMidYMid meet" overflow="hidden"><image href="data:image/jpeg;base64,${data}" width="${width}" height="${height}" filter="url(#paper)"/></svg>`
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><defs><radialGradient id="ground"><stop stop-color="#41432b"/><stop offset="1" stop-color="#121b13"/></radialGradient><filter id="paper" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values=".88 0 0 0 0 0 .88 0 0 0 0 0 .88 0 0 -3 -3 -3 0 8"/></filter></defs><rect width="128" height="128" rx="3" fill="url(#ground)"/>${picture}</svg>`
 await fs.writeFile(new URL(e.name+'.svg',root),svg)
}
console.log('已生成 '+entries.length+' 个统一深色底原图包装图标')
