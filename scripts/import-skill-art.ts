import {copyFileSync,existsSync,mkdirSync,readFileSync,writeFileSync,constants} from 'node:fs'
import {resolve,join} from 'node:path'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {officialSkills} from '../shared/skill-catalog.js'

// Only the 37 exact source files in this manifest have been authorized for import.
// Never enumerate or change anything in the image generator's output directory.
const root=resolve(import.meta.dirname,'..'), manifestPath=join(root,'public/art/skills-generation-20260916.json')
const manifest=JSON.parse(readFileSync(manifestPath,'utf8'))
const assets=manifest.assets as {key:string;source:string;plannedLargePath:string;plannedSmallPath:string;imported:boolean;sha256?:string}[]
if(assets.length!==37||new Set(assets.map(a=>a.key)).size!==37)throw new Error('本轮导入清单必须恰好包含 37 张不同的图片')
const legacy=new Set(['rexue','jingzhun','kuangre','fushi','chuanci','jiaoxie','xueyuan'])
const hash=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex')
const dir=join(root,'public/art/skills')
mkdirSync(join(dir,'originals'),{recursive:true})
for(const asset of assets){
  if(!officialSkills.some(s=>s[0]===asset.key)||legacy.has(asset.key))throw new Error('未知或重复技能：'+asset.key)
  if(asset.plannedLargePath!==`public/art/skills/${asset.key}-large.png`||asset.plannedSmallPath!==`public/art/skills/${asset.key}-small.png`)throw new Error('目标路径不在技能目录')
  const original=join(dir,'originals',asset.key+'.png')
  if(!existsSync(original))copyFileSync(asset.source,original,constants.COPYFILE_EXCL)
  else if(hash(original)!==(asset.sha256??hash(asset.source)))throw new Error('已有原图不同，停止覆盖：'+asset.key)
  asset.sha256=hash(original)
}
for(const [key] of officialSkills){
  const original=legacy.has(key)?join(root,'public/art',key+'.png'):join(dir,'originals',key+'.png')
  for(const [size,pixels] of [['small',64],['large',256]] as const){
    const output=join(dir,`${key}-${size}.png`)
    if(!existsSync(output))execFileSync('sips',['-s','format','png','-z',String(pixels),String(pixels),original,'--out',output],{stdio:'pipe'})
    const dimensions=execFileSync('sips',['-g','pixelWidth','-g','pixelHeight',output],{encoding:'utf8'})
    if(!dimensions.includes('pixelWidth: '+pixels)||!dimensions.includes('pixelHeight: '+pixels))throw new Error('图标尺寸错误：'+key)
  }
}
for(const asset of assets)asset.imported=true
manifest.status='imported'
manifest.note='经用户授权，仅复制清单内 37 张生成图，保留源文件。合并已有 7 张，为全部 44 个技能制作 64px 小图和 256px 大图。'
manifest.sizes={small:64,large:256}
writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n')
console.log('完成：37 张原图已导入，44 个技能共 88 张大小图已验证。')
