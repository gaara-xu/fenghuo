import {mkdir, lstat, chown, chmod} from 'node:fs/promises'
import path from 'node:path'
import {atomicJson,readJson} from './updater/storage.js'
// One-time container helper. Only the explicitly mounted state directory is made writable.
const root = '/state'
for (const name of ['', 'releases', 'work', 'npm-cache', 'tmp']) {
  const dir = path.join(root, name)
  await mkdir(dir, {recursive: true})
  const stat = await lstat(dir)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error('更新存储目录不能是符号链接')
  await chown(dir, 1000, 1000); await chmod(dir, 0o700)
}
if(process.argv[2]==='--activate-bundled'){
  const previous=await readJson<{current:string|null}>(path.join(root,'active.json'))
  await atomicJson(path.join(root,'active.json'),{current:null,previous:previous?.current??null})
  await atomicJson(path.join(root,'status.json'),{supported:true,busy:false,available:false,currentRevision:process.env.FENGHUO_IMAGE_REVISION||'bundled',phase:'idle',message:'部署完成，使用本次镜像版本',updatedAt:new Date().toISOString(),events:[]})
  for(const file of ['active.json','status.json'])await chown(path.join(root,file),1000,1000)
}
console.log('一键更新存储已就绪；未读取或修改数据库。')
