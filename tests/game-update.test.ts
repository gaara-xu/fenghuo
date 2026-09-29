import {afterEach,describe,expect,it,vi} from 'vitest'
import {mkdtemp,mkdir,readFile,writeFile,symlink,rm,access} from 'node:fs/promises'
import path from 'node:path'
import {createServer} from 'node:http'
import type {AddressInfo} from 'node:net'
import {UpdateStorage,atomicJson,readJson} from '../scripts/updater/storage'
import {UpdateManager} from '../scripts/updater/manager'
import {GitReleaseSource,validateTree,verifyDependencyLock} from '../scripts/updater/git-release'
import {buildEnvironment,runCommand} from '../scripts/updater/commands'
import {LocalGameProcess} from '../scripts/updater/game-process'
import {updateServer} from '../scripts/updater/http'

const a='a'.repeat(40),b='b'.repeat(40),c='c'.repeat(40),dirs:string[]=[]
async function temp(){await mkdir('.runtime',{recursive:true});const dir=await mkdtemp(path.resolve('.runtime/update-test-'));dirs.push(dir);return dir}
afterEach(async()=>{vi.unstubAllEnvs();for(const dir of dirs.splice(0))await rm(dir,{recursive:true,force:true})})
async function fixture(){
  const root=await temp(),bundle=path.join(root,'bundled');await mkdir(bundle)
  const store=new UpdateStorage(path.join(root,'state'),{key:null,revision:a,dir:bundle});await store.init()
  const game={start:vi.fn(async()=>{}),stop:vi.fn(async()=>{})},source={latest:vi.fn(async()=>b),prepare:vi.fn(async(sha:string,progress:any)=>{
    await progress('fetching','拉取');await progress('dependencies','依赖');await progress('building','编译')
    const dir=await mkdtemp(path.join(store.file('work'),'build-'));return store.publish(sha,dir)
  })}
  const manager=new UpdateManager(store,source,game);await manager.init();game.start.mockClear()
  return {root,store,game,source,manager}
}
describe('一键更新状态机',()=>{
  it('只检查不编译不停止；更新按钮自行检查、构建、切换，重复点击不并发',async()=>{
    const f=await fixture();f.manager.request('check','check-0001');await f.manager.idle()
    expect(f.manager.snapshot()).toMatchObject({available:true,currentRevision:a,busy:false});expect(f.source.prepare).not.toHaveBeenCalled();expect(f.game.stop).not.toHaveBeenCalled()
    f.manager.request('run','update-0001');f.manager.request('run','update-0002');await f.manager.idle()
    expect(f.source.prepare).toHaveBeenCalledTimes(1);expect(f.game.stop).toHaveBeenCalledTimes(1);expect(f.game.start).toHaveBeenCalledTimes(1)
    expect(f.manager.snapshot()).toMatchObject({currentRevision:b,phase:'succeeded',busy:false,available:false})
    expect(await f.store.pointer()).toEqual({current:b,previous:null})
    f.manager.request('run','update-0001');await f.manager.idle();expect(f.source.prepare).toHaveBeenCalledTimes(1)
    f.manager.request('run','update-0003');await f.manager.idle();expect(f.game.stop).toHaveBeenCalledTimes(1)
  })
  it.each(['network','build'])('%s失败保留旧版，不调用停止、切换或数据库命令',async kind=>{
    const f=await fixture();if(kind==='network')f.source.latest.mockRejectedValueOnce(Error('网络不可用'));else f.source.prepare.mockRejectedValueOnce(Error('编译失败'))
    f.manager.request('run','failed-0001');await f.manager.idle()
    expect(f.manager.snapshot()).toMatchObject({currentRevision:a,phase:'failed',busy:false});expect(f.manager.status.message).toContain('原游戏未切换');expect(f.game.stop).not.toHaveBeenCalled();expect((await f.store.pointer()).current).toBeNull()
  })
  it('新版启动失败先停止失败进程再回原版；允许重新更新',async()=>{
    const f=await fixture();f.game.start.mockRejectedValueOnce(Error('健康检查失败'))
    f.manager.request('run','rollback-0001');await f.manager.idle()
    expect(f.game.stop).toHaveBeenCalledTimes(2);expect(f.game.start).toHaveBeenLastCalledWith(f.store.bundled);expect((await f.store.pointer()).current).toBeNull()
    expect(f.manager.status.message).toContain('已恢复原版本');expect(f.manager.status.phase).toBe('failed')
    f.manager.request('run','rollback-0002');await f.manager.idle();expect(f.manager.status.phase).toBe('succeeded')
  })
  it('切换时意外中断，重启选取已确认的原版本；构建中断不切换',async()=>{
    const f=await fixture();const target=await f.source.prepare(b,async()=>{})
    await f.store.activate(target.key,null);await atomicJson(f.store.file('status.json'),{...f.manager.status,busy:true,phase:'verifying',previousKey:null})
    const restarted=new UpdateManager(f.store,f.source,f.game);await restarted.init()
    expect(f.game.start).toHaveBeenLastCalledWith(f.store.bundled);expect(restarted.status.phase).toBe('failed');expect((await f.store.pointer()).current).toBeNull()
    await atomicJson(f.store.file('status.json'),{...restarted.status,busy:true,phase:'building'})
    await new UpdateManager(f.store,f.source,f.game).init();expect(f.game.start).toHaveBeenLastCalledWith(f.store.bundled)
  })
  it('只保留当前和上一版本，不删除未知文件或源码目录',async()=>{
    const f=await fixture();await f.source.prepare(a,async()=>{});await f.source.prepare(b,async()=>{});await f.source.prepare(c,async()=>{})
    await mkdir(f.store.file('releases/user-files'));await f.store.prune([b,c])
    await expect(access(f.store.releasePath(a))).rejects.toThrow();await access(f.store.releasePath(b));await access(f.store.file('releases/user-files'));await access(f.store.bundled.dir)
  })
  it('拒绝路径穿越和符号链接状态，状态文件写入完整可读',async()=>{
    const f=await fixture();await expect(f.store.release('../../escape')).rejects.toThrow('版本编号无效')
    await atomicJson(f.store.file('probe.json'),{ok:true});expect(await readJson(f.store.file('probe.json'))).toEqual({ok:true})
    await symlink(f.store.file('probe.json'),f.store.file('linked.json'));await expect(readJson(f.store.file('linked.json'))).rejects.toThrow('符号链接')
    await symlink(f.store.bundled.dir,f.store.releasePath(b));await expect(f.store.release(b)).rejects.toThrow()
  })
})

async function listen(server:ReturnType<typeof createServer>){await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));return (server.address() as AddressInfo).port}
async function close(server:ReturnType<typeof createServer>){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))}
describe('更新接口与维护页面',()=>{
  it('仅POST+同源标识执行，无分支/命令参数；服务停机时状态和后台仍可访问',async()=>{
    const f=await fixture();await mkdir(path.join(f.store.bundled.dir,'dist-web'));await writeFile(path.join(f.store.bundled.dir,'dist-web/index.html'),'<h1>维护后台</h1>')
    const server=updateServer(f.manager,1,()=>false),port=await listen(server),base=`http://127.0.0.1:${port}`,url=base+'/api/admin/game-update/run'
    const post=(body:any,headers:Record<string,string>={})=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Fenghuo-Update':'1',...headers},body:JSON.stringify(body)})
    try{
      for(const method of ['GET','HEAD','OPTIONS'])expect((await fetch(url,{method})).status).toBe(405)
      expect((await fetch(url,{method:'POST',body:'{}'})).status).toBe(403)
      expect((await post({requestId:'test-0001'},{Origin:'http://evil.example'})).status).toBe(403)
      expect((await post({requestId:'test-0001'},{'Sec-Purpose':'prefetch'})).status).toBe(403)
      expect((await post({requestId:'test-0001',command:'rm'})).status).toBe(400)
      expect((await fetch(url+'?branch=evil',{method:'POST'})).status).toBe(400)
      expect(f.source.latest).not.toHaveBeenCalled()
      expect((await fetch(base+'/api/admin/game-update/status')).status).toBe(200)
      expect(await (await fetch(base+'/admin')).text()).toContain('维护后台')
      expect((await fetch(base+'/api/world/status')).status).toBe(503)
      expect((await fetch(base+'/assets/..%2f..%2fpackage.json')).status).toBe(404)
      expect((await post({requestId:'real-0001'})).status).toBe(202);await f.manager.idle();expect(f.source.prepare).toHaveBeenCalledOnce()
    }finally{await close(server)}
  })
  it('非更新API透传方法、参数、正文和响应，不改变既有游戏路由',async()=>{
    const f=await fixture(),app=createServer((req,res)=>{let body='';req.on('data',d=>body+=d);req.on('end',()=>{res.writeHead(201,{'Content-Type':'application/json'});res.end(JSON.stringify({method:req.method,url:req.url,body}))})}),appPort=await listen(app),server=updateServer(f.manager,appPort,()=>true),port=await listen(server)
    try{const response=await fetch(`http://127.0.0.1:${port}/api/tavern?x=1`,{method:'POST',body:'example'});expect(response.status).toBe(201);expect(await response.json()).toEqual({method:'POST',url:'/api/tavern?x=1',body:'example'})}finally{await close(server);await close(app)}
  })
})

describe('源码安全与构建',()=>{
  const tree=['package.json','package-lock.json','game-runtime.json','server/index.ts'].map(file=>`100644 blob ${a}\t${file}\0`).join('')
  it('校验Git树拒绝软链接、子模块、穿越、环境文件和预置构建产物',()=>{
    expect(()=>validateTree(tree)).not.toThrow()
    expect(()=>validateTree(tree+`100644 blob ${a}\t.env.example\0`)).not.toThrow()
    for(const bad of [`120000 blob ${a}\tlink`,`160000 commit ${a}\tsub`,`100644 blob ${a}\t../bad`,`100644 blob ${a}\t.env`,`100644 blob ${a}\tnode_modules/bad`])expect(()=>validateTree(tree+bad+'\0')).toThrow()
  })
  it('依赖锁与声明必须一致，不能复用不匹配的依赖',()=>{
    expect(()=>verifyDependencyLock({dependencies:{a:'1'}},{packages:{'':{dependencies:{a:'1'}}}})).not.toThrow()
    expect(()=>verifyDependencyLock({dependencies:{a:'2'}},{packages:{'':{dependencies:{a:'1'}}}})).toThrow('不一致')
    expect(()=>verifyDependencyLock({},{})).toThrow('缺少')
  })
  it('构建不继承实库凭据或实库测试开关，命令超时终止进程组',async()=>{
    vi.stubEnv('DB_PASSWORD','secret');vi.stubEnv('RUN_DB_TESTS','1');vi.stubEnv('NODE_OPTIONS','--inspect')
    const env=buildEnvironment('/cache','/temp');expect(env.DB_PASSWORD).toBeUndefined();expect(env.RUN_DB_TESTS).toBe('0');expect(env.NODE_OPTIONS).toBeUndefined()
    await expect(runCommand(process.execPath,['-e','setInterval(()=>{},1000)'],{timeoutMs:50})).rejects.toThrow('超时')
  })
  it('真实Git固定提交拉取、独立编译目录、依赖复用和失败清理（不运行游戏或接触数据库）',async()=>{
    const f=await fixture(),repo=path.join(f.root,'source');await mkdir(repo);await mkdir(path.join(repo,'server'))
    await writeFile(path.join(repo,'server/index.ts'),'//fixture');await writeFile(path.join(repo,'package.json'),'{}');await writeFile(path.join(repo,'package-lock.json'),'{"packages":{"":{}}}')
    await writeFile(path.join(repo,'game-runtime.json'),JSON.stringify({protocol:1,nodeMajor:Number(process.versions.node.split('.')[0])}))
    await writeFile(path.join(f.store.bundled.dir,'package-lock.json'),'{"packages":{"":{}}}');await mkdir(path.join(f.store.bundled.dir,'node_modules/typescript'),{recursive:true})
    await runCommand('git',['init','-b','main',repo]);await runCommand('git',['-C',repo,'add','.']);await runCommand('git',['-C',repo,'-c','user.name=Test','-c','user.email=test@example.invalid','commit','-m','fixture'])
    const command=vi.fn(async(cmd:string,args:string[],options:any)=>{
      if(cmd!=='npm')return runCommand(cmd,args,options)
      expect(args).toEqual(['run','check']);expect(options.env.RUN_DB_TESTS).toBe('0')
      await mkdir(path.join(options.cwd,'dist-server/server'),{recursive:true});await mkdir(path.join(options.cwd,'dist-web'))
      await writeFile(path.join(options.cwd,'dist-server/server/index.js'),'//fixture');await writeFile(path.join(options.cwd,'dist-web/index.html'),'fixture');return ''
    })
    const source=new GitReleaseSource(f.store,command,repo),sha=await source.latest(),release=await source.prepare(sha,async()=>{})
    expect(release.revision).toBe(sha);expect(await readFile(path.join(release.dir,'server/index.ts'),'utf8')).toBe('//fixture');expect(await source.prepare(sha,async()=>{})).toEqual(release)
    expect(command.mock.calls.filter(([cmd])=>cmd==='npm')).toHaveLength(1)
    expect(command.mock.calls.some(([,args])=>args.includes('db:update'))).toBe(false)
  })
})

describe('游戏子进程切换',()=>{
  it('版本匹配才视为启动成功，不允许双实例；停止后可启动新版',async()=>{
    const root=await temp(),server=createServer(),port=await listen(server);await close(server)
    await mkdir(path.join(root,'dist-server/server'),{recursive:true})
    await writeFile(path.join(root,'dist-server/server/index.js'),`import http from 'node:http';const s=http.createServer((q,r)=>{r.end(JSON.stringify({ok:true,revision:process.env.FENGHUO_APP_REVISION}))});s.listen(Number(process.env.PORT),'127.0.0.1');process.on('SIGTERM',()=>s.close());`)
    const game=new LocalGameProcess(port,{},3000,1000)
    try{await game.start({key:null,revision:a,dir:root});await expect(game.start({key:b,revision:b,dir:root})).rejects.toThrow('两个');await game.stop();expect(game.isRunning()).toBe(false);await game.start({key:b,revision:b,dir:root});expect(game.isRunning()).toBe(true)}finally{await game.stop()}
  })
})
