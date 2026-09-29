import {afterEach,describe,it,expect,vi} from 'vitest'
import {mkdir,mkdtemp,rm,readFile} from 'node:fs/promises'
import path from 'node:path'
import http from 'node:http'
import type {AddressInfo} from 'node:net'
import {setTimeout as delay} from 'node:timers/promises'
import {UpdateStorage} from '../scripts/updater/storage'
import {CommandError,runCommand} from '../scripts/updater/commands'
import {GitReleaseSource,retryableGitError} from '../scripts/updater/git-release'
import {UpdateManager} from '../scripts/updater/manager'
import {updateServer} from '../scripts/updater/http'

const a='a'.repeat(40),b='b'.repeat(40),dirs:string[]=[]
async function fixture(){
 await mkdir('.runtime',{recursive:true});const root=await mkdtemp(path.resolve('.runtime/update-recovery-'));dirs.push(root)
 const store=new UpdateStorage(path.join(root,'state'),{key:null,revision:a,dir:root});await store.init()
 const prepare=vi.fn(async()=>store.publish(b,await mkdtemp(path.join(store.file('work'),'build-'))))
 const game={start:vi.fn(async()=>{}),stop:vi.fn(async()=>{})}
 return {root,store,prepare,game}
}
afterEach(async()=>{for(const dir of dirs.splice(0))await rm(dir,{recursive:true,force:true})})
const gitErrors=['GnuTLS recv error (-110): The TLS connection was non-properly terminated.','error: RPC failed; curl 16 Error in the HTTP2 framing layer\nfatal: expected packfile','curl 92 HTTP/2 stream was not closed cleanly','fatal: early EOF',new CommandError('命令执行超时：git','timeout')]
describe('Git HTTPS恢复',()=>{
 it.each(gitErrors)('临时错误 %s 后按原HTTPS地址重试，强制HTTP/1.1且不关闭证书校验',async error=>{
  const f=await fixture(),run=vi.fn().mockRejectedValueOnce(typeof error==='string'?Error(error):error).mockResolvedValue(b+'\trefs/heads/main\n'),wait=vi.fn(async()=>{}),retry=vi.fn(async()=>{})
  const source=new GitReleaseSource(f.store,run,undefined,wait)
  expect(await source.latest(undefined,retry)).toBe(b);expect(run).toHaveBeenCalledTimes(2);expect(wait).toHaveBeenCalledExactlyOnceWith(2000,undefined);expect(retry).toHaveBeenCalledOnce()
  for(const [command,args,options] of run.mock.calls){expect(command).toBe('git');expect(args).toContain('http.version=HTTP/1.1');expect(args).toContain('https://github.com/gaara-xu/fenghuo.git');expect(args).not.toContain('http.sslVerify=false');expect(options.env.GIT_SSL_NO_VERIFY).toBeUndefined();expect(options.timeoutMs).toBe(30000)}
 })
 it.each(['Authentication failed','Repository not found','SSL certificate problem','fatal: shallow.lock already exists'])('永久错误 %s 不反复重试',async message=>{
  const f=await fixture(),run=vi.fn().mockRejectedValue(Error(message)),wait=vi.fn(async()=>{})
  await expect(new GitReleaseSource(f.store,run,undefined,wait).latest()).rejects.toThrow(message);expect(run).toHaveBeenCalledOnce();expect(wait).not.toHaveBeenCalled()
 })
 it('三次失败后释放忙碌标志，不停止旧游戏；新请求可以成功',async()=>{
  const f=await fixture(),run=vi.fn().mockRejectedValue(Error('curl 16 Error in the HTTP2 framing layer')),wait=vi.fn(async()=>{}),source=new GitReleaseSource(f.store,run,undefined,wait)
  const manager=new UpdateManager(f.store,{latest:source.latest.bind(source),prepare:f.prepare},f.game);await manager.init();f.game.start.mockClear()
  manager.request('run','network-fail-1');await manager.idle()
  expect(run).toHaveBeenCalledTimes(3);expect(wait.mock.calls.map(c=>c[0])).toEqual([2000,4000]);expect(manager.status).toMatchObject({busy:false,phase:'failed',currentRevision:a});expect(manager.status.message).toContain('连续3次失败')
  expect(f.game.stop).not.toHaveBeenCalled();expect(f.prepare).not.toHaveBeenCalled();expect(manager.status.events.some(e=>e.message.includes('2/3'))).toBe(true)
  run.mockResolvedValue(b+'\trefs/heads/main\n');manager.request('run','network-retry-2');await manager.idle();expect(manager.status).toMatchObject({busy:false,phase:'succeeded',currentRevision:b})
 })
 it('下载包中断只重试同一个提交，重试耗尽不读旧FETCH_HEAD或进入构建',async()=>{
  const f=await fixture(),run=vi.fn(async(_cmd:string,args:string[])=>{if(args.includes('init'))return '';throw Error('curl 16 Error in the HTTP2 framing layer')}),wait=vi.fn(async()=>{}),progress=vi.fn(async()=>{})
  await expect(new GitReleaseSource(f.store,run,undefined,wait).prepare(b,progress)).rejects.toThrow('连续3次失败')
  const fetches=run.mock.calls.filter(([,args])=>args.includes('fetch'));expect(fetches).toHaveLength(3);expect(fetches.every(([,args])=>args.at(-1)===b)).toBe(true)
  expect(run.mock.calls.some(([,args])=>args.includes('rev-parse'))).toBe(false);expect(progress.mock.calls.every(c=>c[0]==='fetching')).toBe(true)
 })
 it('服务关闭取消正在执行的命令，不等待完整网络超时；锁解除但不启动候选版',async()=>{
  const f=await fixture();let started!:()=>void;const running=new Promise<void>(r=>{started=r})
  const run=vi.fn(async(_cmd:string,_args:string[],options:any)=>{started();return runCommand(process.execPath,['-e','setInterval(()=>{},1000)'],{signal:options.signal,timeoutMs:120000})})
  const source=new GitReleaseSource(f.store,run),manager=new UpdateManager(f.store,{latest:source.latest.bind(source),prepare:f.prepare},f.game);await manager.init();f.game.start.mockClear()
  manager.request('run','shutdown-1');await running;await manager.close()
  expect(manager.status).toMatchObject({busy:false,phase:'failed',currentRevision:a});expect(f.prepare).not.toHaveBeenCalled();expect(f.game.stop).toHaveBeenCalledOnce();expect(f.game.start).not.toHaveBeenCalled();expect(run).toHaveBeenCalledOnce()
 })
 it('服务关闭打断重试退避，不会再发起第二次Git请求',async()=>{
  const f=await fixture(),controller=new AbortController(),run=vi.fn().mockRejectedValue(Error('GnuTLS recv error (-110)'))
  await expect(new GitReleaseSource(f.store,run).latest(controller.signal,async()=>{controller.abort(Error('停止更新'))})).rejects.toThrow();expect(run).toHaveBeenCalledOnce()
  expect(retryableGitError(new CommandError('取消','aborted'))).toBe(false)
 })
 it('超时清理忽略SIGTERM的子进程组，不留下持续写入的后台进程',async()=>{
  const f=await fixture(),file=path.join(f.root,'heartbeat'),controller=new AbortController()
  const child=`const fs=require('node:fs');process.on('SIGTERM',()=>{});fs.writeFileSync(process.argv[1],'x');setInterval(()=>fs.appendFileSync(process.argv[1],'x'),30)`
  const parent=`require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(child)},process.argv[1]],{stdio:'ignore'});setInterval(()=>{},1000)`
  const task=runCommand(process.execPath,['-e',parent,file],{signal:controller.signal,timeoutMs:5000})
  const rejected=expect(task).rejects.toThrow('取消')
  try{const deadline=Date.now()+3000;while(Date.now()<deadline){try{await readFile(file);break}catch{await delay(25)}}controller.abort();await rejected
   const before=await readFile(file,'utf8');await delay(150);expect(await readFile(file,'utf8')).toBe(before)
  }finally{controller.abort();await task.catch(()=>{})}
 })
})
describe('关闭页面不取消服务器更新',()=>{
 it.each(['success','failure'])('请求已受理后断开客户端，服务器独立结束为%s并可重新读取',async result=>{
  const f=await fixture();let complete!:(s:string)=>void,fail!:(e:Error)=>void,started!:()=>void
  const running=new Promise<void>(resolve=>{started=resolve})
  const latest=vi.fn((signal?:AbortSignal)=>new Promise<string>((resolve,reject)=>{complete=resolve;fail=reject;signal?.addEventListener('abort',()=>reject(signal.reason),{once:true});started()})),manager=new UpdateManager(f.store,{latest,prepare:f.prepare},f.game)
  await manager.init();const server=updateServer(manager,1,()=>false);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const port=(server.address() as AddressInfo).port
  try{
   await new Promise<void>((resolve,reject)=>{
    const req=http.request({hostname:'127.0.0.1',port,path:'/api/admin/game-update/run',method:'POST',agent:false,headers:{'Content-Type':'application/json','X-Fenghuo-Update':'1'}},res=>{expect(res.statusCode).toBe(202);res.destroy();req.destroy();resolve()})
    req.on('error',reject);req.end(JSON.stringify({requestId:'closed-page-1'}))
   })
   await running;expect(manager.status.busy).toBe(true)
   if(result==='success')complete(b);else fail(Error('Git 网络中断'))
   await manager.idle()
   const status=await (await fetch(`http://127.0.0.1:${port}/api/admin/game-update/status`)).json() as any
   expect(status).toMatchObject({busy:false,phase:result==='success'?'succeeded':'failed',currentRevision:result==='success'?b:a})
   if(result==='failure')expect(f.game.stop).not.toHaveBeenCalled()
  }finally{await manager.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))}
 })
})
