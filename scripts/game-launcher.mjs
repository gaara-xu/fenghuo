import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawn,execFileSync} from 'node:child_process'
import {randomBytes} from 'node:crypto'
import net from 'node:net'

const file=fileURLToPath(import.meta.url)
export const project=path.resolve(path.dirname(file),'..')
const runtime=path.join(project,'.runtime'),stateFile=path.join(runtime,'launcher-state.json'),lockFile=path.join(runtime,'launcher-lock.json'),logFile=path.join(runtime,'game.log')
const ports=[5173,18770]
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const addresses='游戏：http://localhost:5173/\n后台：http://localhost:5173/admin\n任务清单：http://localhost:5173/admin#tasks'

function safeRuntime(){
  const stat=fs.lstatSync(runtime,{throwIfNoEntry:false})
  if(stat){if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('.runtime必须为游戏目录内的普通文件夹')}
  else fs.mkdirSync(runtime,{mode:0o700})
}
function assertPlain(target){const stat=fs.lstatSync(target,{throwIfNoEntry:false});if(stat&&(!stat.isFile()||stat.isSymbolicLink()))throw Error('启动器运行文件类型异常：'+path.basename(target))}
function readState(){assertPlain(stateFile);if(!fs.existsSync(stateFile))return null;try{const s=JSON.parse(fs.readFileSync(stateFile,'utf8'));if(s.project!==project||!Number.isSafeInteger(s.pid)||s.pid<2||!/^[a-f0-9]{32}$/.test(s.token??'')||typeof s.born!=='string'||!s.born)throw Error();return s}catch{throw Error('启动器状态文件损坏，请保留.runtime/launcher-state.json后检查，未停止任何进程')}}
function inspect(pid){
  if(!Number.isSafeInteger(pid)||pid<2)return null
  try{
    const raw=execFileSync('ps',['-p',String(pid),'-o','ppid=,pgid=,lstart=,command='],{encoding:'utf8',stdio:['ignore','pipe','ignore'],env:{...process.env,LC_ALL:'C'}}).trim()
    const m=raw.match(/^(\d+)\s+(\d+)\s+(\w+\s+\w+\s+\d+\s+[\d:]+\s+\d+)\s+(.+)$/)
    return m?{pid,ppid:Number(m[1]),pgid:Number(m[2]),born:m[3].replace(/\s+/g,' '),command:m[4]}:null
  }catch{return null}
}
function cwdOf(pid){try{return execFileSync('lsof',['-a','-p',String(pid),'-d','cwd','-Fn'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).split('\n').find(l=>l.startsWith('n'))?.slice(1)}catch{return null}}
export function isProjectCommand(command){
  return /(?:^|[ /])(?:vite(?:\.js)?|tsx(?:\.mjs)?)(?:\s|$)/.test(command)||/node_modules\/(?:\.bin\/(?:vite|tsx|concurrently)|(?:vite|tsx|concurrently)\/)/.test(command)||/\bserver\/index\.(?:ts|js)\b/.test(command)||/^npm (?:run dev|start)(?:\s|$)/.test(command)||/^(?:\S*\/)?(?:sh|bash|zsh) -c (?:concurrently|tsx watch server\/index\.ts|vite --host)/.test(command)
}
function sameProcess(record){const current=inspect(record.pid);return current&&current.born===record.born&&current.command===record.command?current:null}
function managed(s){if(!s)return null;const p=inspect(s.pid);return p&&p.pgid===s.pid&&p.born===s.born&&p.command.includes(file)&&p.command.includes('--supervise '+s.token)?p:null}
function listeners(port){try{return [...new Set(execFileSync('lsof',['-nP','-t',`-iTCP:${port}`,'-sTCP:LISTEN'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim().split(/\s+/).filter(Boolean).map(Number))]}catch{return []}}
function ownedChain(pid){
  const records=[],seen=new Set()
  for(let current=inspect(pid);current&&!seen.has(current.pid);current=inspect(current.ppid)){
    seen.add(current.pid)
    if(cwdOf(current.pid)!==project||!isProjectCommand(current.command))break
    records.push(current)
  }
  if(!records.length)throw Error('端口被其他程序占用（进程 '+pid+'），启动器不会停止它')
  return records
}
function scopedListeners(){const records=new Map();for(const port of ports)for(const pid of listeners(port))for(const r of ownedChain(pid))records.set(r.pid,r);return [...records.values()]}
async function portFree(port){return new Promise(resolve=>{const s=net.createServer();s.once('error',()=>resolve(false));s.listen({host:'0.0.0.0',port},()=>s.close(()=>resolve(true)))})}
async function health(){
  const request=async(url,check)=>{try{const r=await fetch(url,{signal:AbortSignal.timeout(1500)});return r.ok&&await check(r)}catch{return false}}
  const [web,api]=await Promise.all([request('http://127.0.0.1:5173/',async r=>(await r.text()).includes('id="app"')),request('http://127.0.0.1:18770/api/health',async r=>{const j=await r.json();return j.ok===true&&j.database==='fenghuo'})])
  return {web,api,ready:web&&api}
}
async function status(){
  safeRuntime();const s=readState(),owner=managed(s),h=await health()
  const foreign=ports.flatMap(port=>listeners(port).filter(pid=>{try{ownedChain(pid);return false}catch{return true}}))
  return (foreign.length?'端口被其他程序占用，请检查，未操作该程序。':h.ready?'游戏正在运行。':h.web||h.api||owner?'游戏服务不完整或数据库尚未就绪，请尝试重启并检查日志。':'游戏已关闭。')+'\n前端：'+(h.web?'正常':'未就绪')+'\n后端及数据库：'+(h.api?'正常':'未就绪')+'\n'+addresses+'\n日志：'+logFile
}
async function stop(){
  const s=readState(),owner=managed(s)
  // Resolve every occupied port before signalling anything. Foreign processes always veto the operation.
  const targets=scopedListeners()
  if(owner){try{process.kill(-owner.pid,'SIGTERM')}catch(e){if(e.code!=='ESRCH')throw e}}
  else for(const r of targets.reverse())if(sameProcess(r)&&cwdOf(r.pid)===project)try{process.kill(r.pid,'SIGTERM')}catch(e){if(e.code!=='ESRCH')throw e}
  for(let i=0;i<32;i++){
    if(!managed(s)&&!(ports.some(p=>listeners(p).length)))break
    await pause(150)
  }
  if(managed(s))process.kill(-s.pid,'SIGKILL')
  // For older terminal-started instances, only escalate exact pre-validated identities.
  for(const r of targets)if(sameProcess(r)&&cwdOf(r.pid)===project)try{process.kill(r.pid,'SIGKILL')}catch(e){if(e.code!=='ESRCH')throw e}
  await pause(200)
  if(managed(s)||ports.some(p=>listeners(p).length))throw Error('仍有进程占用游戏端口，未强制停止无法确认归属的程序')
  if(s&&fs.existsSync(stateFile))fs.unlinkSync(stateFile)
  return '游戏已关闭，存档未删除，MySQL未停止。\n行军和自动出征将在下次启动时补结算。'
}
async function start(){
  const [major,minor]=process.versions.node.split('.').map(Number)
  if(major<22||(major===22&&minor<12))throw Error('请使用 Node.js 22.12 或更新版本启动游戏')
  const s=readState(),owner=managed(s),h=await health()
  scopedListeners()
  if(h.ready)return '游戏已经运行，无需重复启动。\n'+addresses
  if(owner||ports.some(p=>listeners(p).length))await stop()
  for(const port of ports)if(!await portFree(port))throw Error('端口 '+port+' 已被占用，未启动或停止其他程序')
  if(!fs.existsSync(path.join(project,'.env')))throw Error('缺少游戏目录内的.env配置；不会自动创建数据库或重置存档')
  for(const dependency of ['vite/bin/vite.js','tsx/dist/cli.mjs'])if(!fs.existsSync(path.join(project,'node_modules',dependency)))throw Error('依赖不完整，请先在游戏文件夹执行 npm install')
  assertPlain(logFile)
  if(fs.existsSync(logFile)&&fs.statSync(logFile).size>2*1024*1024){const old=path.join(runtime,'game.previous.log');assertPlain(old);fs.renameSync(logFile,old)}
  const token=randomBytes(16).toString('hex'),fd=fs.openSync(logFile,'a',0o600)
  const child=spawn(process.execPath,[file,'--supervise',token],{cwd:project,detached:true,stdio:['ignore',fd,fd],env:{...process.env,PATH:path.dirname(process.execPath)+':'+process.env.PATH}})
  let spawnError;child.on('error',e=>{spawnError=e})
  child.unref();fs.closeSync(fd)
  let record
  for(let i=0;i<20&&!record&&!spawnError;i++){record=inspect(child.pid);if(!record)await pause(50)}
  if(!record)throw Error('启动进程未能创建，请查看 '+logFile)
  const state={project,pid:child.pid,born:record.born,token,startedAt:new Date().toISOString()}
  try{assertPlain(stateFile);fs.writeFileSync(stateFile,JSON.stringify(state,null,2)+'\n',{mode:0o600})}
  catch(e){if(managed(state))process.kill(-state.pid,'SIGTERM');throw e}
  const deadline=Date.now()+25_000
  while(Date.now()<deadline){
    if((await health()).ready)return '游戏已启动，可在已有浏览器中访问：\n'+addresses+'\n关闭菜单或终端不会关闭游戏。'
    if(!managed(state))break
    await pause(300)
  }
  await stop()
  throw Error('游戏未能就绪，已停止本次启动的服务。\n请检查数据库连接、Node.js版本或端口设置。\n详细日志：'+logFile)
}
async function withLock(work){
  safeRuntime();assertPlain(lockFile)
  if(fs.existsSync(lockFile)){
    let old;try{old=JSON.parse(fs.readFileSync(lockFile,'utf8'))}catch{throw Error('启停锁文件损坏，请检查 '+lockFile)}
    const p=inspect(old.pid);if(p&&p.born===old.born&&p.command===old.command)throw Error('另一个启停操作正在进行，请稍后再试')
    fs.unlinkSync(lockFile)
  }
  const me=inspect(process.pid)
  if(!me)throw Error('无法确认本机进程信息，请检查 ps 命令权限；未执行启停操作')
  let fd;try{fd=fs.openSync(lockFile,'wx',0o600)}catch(e){if(e.code==='EEXIST')throw Error('另一个启停操作正在进行');throw e}
  fs.writeFileSync(fd,JSON.stringify(me));fs.closeSync(fd)
  try{return await work()}finally{fs.unlinkSync(lockFile)}
}
function supervise(token){
  if(!/^[a-f0-9]{32}$/.test(token??''))throw Error('无效的启动标识')
  if(inspect(process.pid)?.pgid!==process.pid)throw Error('内部监督进程必须由启动器创建，不能直接运行')
  let stopping=false
  const children=[
    spawn(process.execPath,[path.join(project,'node_modules/vite/bin/vite.js'),'--host','0.0.0.0','--port','5173','--strictPort'],{cwd:project,stdio:'inherit'}),
    spawn(process.execPath,[path.join(project,'node_modules/tsx/dist/cli.mjs'),'watch','server/index.ts'],{cwd:project,stdio:'inherit',env:{...process.env,PORT:'18770'}}),
  ]
  const shutdown=()=>{if(stopping)return;stopping=true;process.kill(-process.pid,'SIGTERM');setTimeout(()=>process.kill(-process.pid,'SIGKILL'),3500).unref()}
  process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown)
  const ended=new Set()
  for(const child of children){child.on('error',e=>{console.error('启动失败：'+e.message);shutdown()});child.on('exit',()=>{ended.add(child.pid);if(!stopping)shutdown();if(ended.size===children.length)process.exit(0)})}
}

if(process.argv[1]&&path.resolve(process.argv[1])===file){
  const action=process.argv[2]??'status'
  if(action==='--supervise')supervise(process.argv[3])
  else if(!['start','stop','restart','status'].includes(action)){console.error('仅支持 start、stop、restart、status');process.exitCode=2}
  else try{console.log(action==='status'?await status():await withLock(async()=>action==='start'?start():action==='stop'?stop():(await stop(),await start())))}catch(e){console.error(e.message);process.exitCode=1}
}
