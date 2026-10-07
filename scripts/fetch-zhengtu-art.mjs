import fs from 'node:fs/promises'
const root=new URL('../public/art/zhengtu/',import.meta.url),origin='https://zt.ztgame.com'
const pages={weapon:'00c-1329-00200-112476',shield:'000-1329-00205-112526',armor:'000-1329-0020c-112610',helmet:'000-1329-0020d-112620',belt:'006-1329-0020e-112630',bracelet:'000-1329-0020f-112638',boots:'000-1329-00210-112649',necklace:'006-1329-00211-112658',ring:'002-1329-00212-112667'}
const manifest=[]
await fs.mkdir(root,{recursive:true})
for(const [slot,page] of Object.entries(pages)){
  const source=origin+'/game/'+page+'.shtml',response=await fetch(source,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error(source)
  const html=await response.text(),entries=[...html.matchAll(/<img\b[^>]*src="([^"]+)"[^>]*>([\s\S]*?)(?=<img\b|$)/gi)].map(m=>({url:new URL(m[1],source).href,text:m[2].replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim()}))
  for(const [key,name] of [['tianmo','天魔'],['tianzun','天尊'],['yingxiong','英雄']]){
    const choices=entries.filter(e=>e.text.startsWith(name)||e.text.startsWith('名称 '+name)),chosen=choices.find(e=>e.text.slice(0,15).includes('（物）'))??choices[0]
    if(!chosen)throw Error('缺少官方素材 '+name+' '+slot)
    const r=await fetch(chosen.url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error(chosen.url)
    const data=Buffer.from(await r.arrayBuffer());if(!r.headers.get('content-type')?.startsWith('image/'))throw Error('不是图片 '+chosen.url)
    const extension=new URL(chosen.url).pathname.split('.').pop().toLowerCase(),file=key+'-'+slot+'.'+extension
    await fs.writeFile(new URL(file,root),data)
    manifest.push({key,slot,name:chosen.text.replace(/^名称 /,'').split(' ')[0],file,source,imageUrl:chosen.url})
    console.log(key,slot,chosen.text.slice(0,30),data.length)
  }
}
await fs.writeFile(new URL('manifest.json',root),JSON.stringify(manifest,null,2)+'\n')
