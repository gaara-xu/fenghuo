// Copy only public, explicitly identified original-game assets; never execute remote scripts.
import ts from 'typescript'
import {writeFile} from 'node:fs/promises'
const origin='https://game.zg.qq.com'
const response=await fetch(origin+'/js/itemConfig.js?v=1.39.2.10',{signal:AbortSignal.timeout(15000)})
if(!response.ok)throw Error('物品资料读取失败')
const source=await response.text(),ast=ts.createSourceFile('items.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)
let literal
for(const statement of ast.statements)if(ts.isVariableStatement(statement))for(const d of statement.declarationList.declarations)if(d.name.getText(ast)==='itemConfig')literal=d.initializer?.getText(ast)
if(!literal)throw Error('物品配置格式变化')
const rows=JSON.parse(literal.replace(/\\x([\da-f]{2})/gi,'\\u00$1')).configs
const gems=rows.filter(i=>/^[1-8]级(修罗|奔雷|金刚|疾风|巨象)宝石$/.test(i.name)).map(i=>({id:i.itemID,name:i.name,amount:Number(i.note.match(/装备(\d+)的/)?.[1])}))
if(gems.length<35||gems.some(g=>!g.amount))throw Error('宝石资料不完整')
await writeFile('shared/original-gems.json',JSON.stringify({source:origin+'/js/itemConfig.js?v=1.39.2.10',gems},null,2)+'\n')
// 534/535 are explicitly present in main_r.js's getTreaStone() mapping; the 2012 table supplies values.
const ids=[...gems.map(g=>g.id),534,535,63,88]
for(let start=0;start<ids.length;start+=5)await Promise.all(ids.slice(start,start+5).map(async id=>{
 const url=origin+'/images/item/item'+id+'.gif',r=await fetch(url,{signal:AbortSignal.timeout(15000)})
 if(!r.ok||!r.headers.get('content-type')?.startsWith('image/'))throw Error('原图不可用：'+id)
 const bytes=new Uint8Array(await r.arrayBuffer())
 if(new TextDecoder().decode(bytes.subarray(0,3))!=='GIF')throw Error('图像格式异常：'+id)
 await writeFile('public/art/official/item'+id+'.gif',bytes)
}))
console.log('已核实 '+gems.length+' 种宝石资料；已保存 '+ids.length+' 张原图。')
