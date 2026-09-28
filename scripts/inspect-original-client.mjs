// Read-only research of public static data. Never evaluate downloaded JavaScript.
import ts from 'typescript'
import {writeFile} from 'node:fs/promises'
const mode=process.argv[2]==='main'?'main':'combine'
const url='https://game.zg.qq.com/js/'+mode+'_r.js'
const response=await fetch(url,{signal:AbortSignal.timeout(15000)})
if(!response.ok)throw Error('公开资料读取失败')
const text=await response.text(),ast=ts.createSourceFile('remote.js',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS)
const call=ast.statements.find(ts.isExpressionStatement)?.expression
if(!ts.isCallExpression(call)||call.expression.getText(ast)!=='eval')throw Error('非预期资料格式')
const packed=call.arguments[0]
if(!ts.isCallExpression(packed)||!ts.isStringLiteral(packed.arguments[0]))throw Error('缺少资料文本')
const dictionary=packed.arguments[1]
if(!ts.isCallExpression(dictionary)||!ts.isPropertyAccessExpression(dictionary.expression)||!ts.isStringLiteral(dictionary.expression.expression)||dictionary.expression.name.text!=='split')throw Error('缺少词典')
const words=dictionary.expression.expression.text.split('|'),alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_$'
function encode(n){return n<64?alphabet[n]:encode(n>>6)+alphabet[n&63]}
const count=Number(packed.arguments[2].getText(ast)),last=Number(packed.arguments[3].getText(ast))
if(count!==words.length||!Number.isInteger(last)||last<count-1)throw Error('词典索引无效')
const map=new Map(words.map((word,index)=>[encode(index+last-count+1),word]))
const decoded=packed.arguments[0].text.replace(/[\w$]+/g,key=>map.get(key)??key)
await writeFile('.runtime/original-'+mode+'-decoded.txt',decoded)
const readable=decoded.replace(/\\u([\da-f]{4})/gi,(_,h)=>String.fromCharCode(parseInt(h,16)))
const matches=[...readable.matchAll(/.{0,140}(?:宝石合成|合成宝石|\/images\/item\/|trea_d_stone|GemCfg|StoneCfg|stoneConfig).{0,260}/g)]
for(const match of matches.slice(0,40))console.log(match[0])
