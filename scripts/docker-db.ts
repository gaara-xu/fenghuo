import mysql,{type RowDataPacket} from 'mysql2/promise'
import {readFileSync,existsSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {parseConfig} from '../server/config.js'

// Keep the Docker update sequence identical to the established, versioned update command.
export function dockerUpdateScripts(command:string){
  return command.split(/\s*&&\s*/).map(part=>{
    const m=part.match(/^(?:tsx|node --import tsx) scripts\/(update-[a-z-]+)\.ts$/)
    if(!m)throw Error('数据库更新命令格式不受支持，拒绝执行：'+part)
    return m[1]+'.js'
  })
}
export async function checkExistingDatabase(){
  const cfg=parseConfig(),c=await mysql.createConnection({host:cfg.DB_HOST,port:cfg.DB_PORT,user:cfg.DB_USER,password:cfg.DB_PASSWORD,database:'fenghuo',connectTimeout:10000,charset:'utf8mb4'})
  try{
    const [scope]=await c.query<RowDataPacket[]>('SELECT DATABASE() db');if(scope[0]?.db!=='fenghuo')throw Error('数据库越界')
    const [players]=await c.query<RowDataPacket[]>('SELECT id FROM player_profile WHERE id=?',[cfg.PLAYER_ID]);if(!players.length)throw Error('现有存档不存在；Docker部署不会自动初始化或重置玩家')
    await c.query('SELECT version FROM schema_migrations LIMIT 1')
  }finally{await c.end()}
}
async function main(){
  if(!['--check','--update'].includes(process.argv[2]??''))throw Error('仅支持 --check 或 --update')
  const pkg=JSON.parse(readFileSync('package.json','utf8')),scripts=dockerUpdateScripts(pkg.scripts['db:update'])
  const dir=path.dirname(fileURLToPath(import.meta.url))
  for(const script of scripts)if(!existsSync(path.join(dir,script)))throw Error('缺少已编译更新脚本：'+script)
  await checkExistingDatabase();console.log('已连接现有 fenghuo 存档，不创建数据库，不运行初始种子。')
  if(process.argv[2]==='--check')return
  for(const script of scripts){const r=spawnSync(process.execPath,[path.join(dir,script)],{stdio:'inherit'});if(r.error||r.status!==0)throw Error('增量更新失败：'+script+'；未启动新服务，请检查日志')}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exitCode=1})
