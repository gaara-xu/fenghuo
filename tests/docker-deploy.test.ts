import {afterEach,describe,it,expect} from 'vitest'
import {mkdtempSync,mkdirSync,copyFileSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import path from 'node:path'
import {dockerUpdateScripts} from '../scripts/docker-db'

const created:string[]=[]
function fixture(){
  mkdirSync('.runtime',{recursive:true});const dir=mkdtempSync(path.resolve('.runtime/deploy-test-'));created.push(dir)
  for(const file of ['deploy.sh','docker-compose.yml'])copyFileSync(file,path.join(dir,file))
  mkdirSync(path.join(dir,'bin'))
  writeFileSync(path.join(dir,'bin/docker'),`#!${process.execPath}
import fs from 'node:fs';const a=process.argv.slice(2);
fs.appendFileSync(process.env.FENGHUO_TEST_LOG,JSON.stringify(a)+'\\n');
if(process.env.FENGHUO_TEST_FAIL&&a.includes(process.env.FENGHUO_TEST_FAIL))process.exit(1);
`,{mode:0o755})
  return {dir,env:{...process.env,PATH:path.join(dir,'bin')+':'+process.env.PATH,DB_PASSWORD:'test-password',FENGHUO_TEST_LOG:path.join(dir,'calls')},calls:()=>readFileSync(path.join(dir,'calls'),'utf8').trim().split('\n').map(l=>JSON.parse(l) as string[])}
}
afterEach(()=>{for(const dir of created.splice(0))rmSync(dir,{recursive:true,force:true})})
describe('Docker 内网部署',()=>{
  it('更新序列只允许现有增量脚本，不执行建库、种子或背包清理',()=>{
    const pkg=JSON.parse(readFileSync('package.json','utf8')),scripts=dockerUpdateScripts(pkg.scripts['db:update'])
    expect(scripts).toContain('update-equipment-sets.js');expect(new Set(scripts).size).toBe(scripts.length)
    for(const file of scripts)expect(existsSync('scripts/'+file.replace('.js','.ts'))).toBe(true)
    for(const s of ['npm run db:seed','node --import tsx scripts/clear-backpack.ts','tsx scripts/apply-schema.ts','tsx scripts/update-game.ts; echo no'])expect(()=>dockerUpdateScripts(s)).toThrow()
  })
  it('脚本通过 Bash 语法检查；镜像非root运行，包含两种迁移SQL路径，构建排除敏感文件',()=>{
    for(const f of ['deploy.sh','scripts/install-docker.sh'])expect(spawnSync('bash',['-n',f]).status).toBe(0)
    const docker=readFileSync('Dockerfile','utf8'),ignore=readFileSync('.dockerignore','utf8'),compose=readFileSync('docker-compose.yml','utf8')
    expect(docker).toContain('RUN npm run check');expect(docker).toContain('USER node');expect(docker).toContain('./dist-server/database')
    for(const f of ['.git','.env','.env.*','.runtime','node_modules'])expect(ignore.split('\n')).toContain(f)
    expect(compose).toContain('${FENGHUO_PORT:-5173}:18770');expect(compose).toContain('DB_NAME: fenghuo');expect(compose).not.toMatch(/image:.*mysql/)
    expect(compose).toContain('DB_PASSWORD: ${DB_PASSWORD:-root}')
    const help=spawnSync('bash',['deploy.sh','--help'],{encoding:'utf8'})
    expect(help.status).toBe(0);expect(help.stdout).toContain('用法：bash deploy.sh');expect(help.stdout).toContain('密码 root')
  })
  it.each(['unset','empty'])('下载源码后不传任何数据库参数即可部署（密码变量 %s）',mode=>{
    const f=fixture(),env:{[key:string]:string|undefined}={...f.env}
    for(const key of ['DB_HOST','DB_PORT','DB_NAME','DB_USER','DB_PASSWORD','PLAYER_ID','SCHEDULER_TOKEN','FENGHUO_PORT','FENGHUO_BIND_IP'])delete env[key]
    if(mode==='empty')env.DB_PASSWORD=''
    const r=spawnSync('bash',['deploy.sh'],{cwd:f.dir,env,encoding:'utf8',input:''})
    expect(r.stderr).toBe('');expect(r.status).toBe(0)
    const config=readFileSync(path.join(f.dir,'.env.docker'),'utf8')
    for(const line of ["DB_HOST='192.168.3.110'","DB_PORT='3306'","DB_NAME='fenghuo'","DB_USER='root'","DB_PASSWORD='root'","FENGHUO_PORT='5173'"])expect(config.split('\n')).toContain(line)
    expect(existsSync(path.join(f.dir,'.git'))).toBe(false)
    expect(f.calls().some(a=>a.includes('build'))).toBe(true)
    expect(f.calls().some(a=>a.includes('--update'))).toBe(true)
    expect(f.calls().some(a=>a.includes('up')&&a.includes('--wait'))).toBe(true)
    expect(r.stdout).toContain('部署完成')
  })
  it('首次部署保存配置，按构建→只读检查→停止旧服务→增量更新→健康启动排序',()=>{
    const f=fixture(),r=spawnSync('bash',['deploy.sh'],{cwd:f.dir,env:f.env,encoding:'utf8'});expect(r.stderr).toBe('');expect(r.status).toBe(0)
    const calls=f.calls(),index=(arg:string)=>calls.findIndex(a=>a.includes(arg))
    expect(index('build')).toBeLessThan(index('--check'));expect(index('--check')).toBeLessThan(index('stop'));expect(index('stop')).toBeLessThan(index('--update'));expect(index('--update')).toBeLessThan(index('up'))
    expect(calls[index('up')]).toContain('--wait');expect(calls[index('up')]).toContain('--wait-timeout')
    const env=readFileSync(path.join(f.dir,'.env.docker'),'utf8');expect(env).toContain("DB_HOST='192.168.3.110'");expect(env).toContain("DB_PASSWORD='test-password'");expect(env).toContain("FENGHUO_PORT='5173'")
    expect(existsSync(path.join(f.dir,'.deploy/lock'))).toBe(false)
  })
  it.each(['build','--check'])('%s 失败不停止旧服务',stage=>{
    const f=fixture(),r=spawnSync('bash',['deploy.sh'],{cwd:f.dir,env:{...f.env,FENGHUO_TEST_FAIL:stage}})
    expect(r.status).not.toBe(0);expect(f.calls().some(a=>a.includes('stop')||a.includes('up'))).toBe(false)
  })
  it('数据库更新失败不启动不健康服务；check 不更新或启动；旧配置不被命令行覆盖',()=>{
    const f=fixture();expect(spawnSync('bash',['deploy.sh','check'],{cwd:f.dir,env:f.env}).status).toBe(0)
    expect(f.calls().some(a=>a.includes('stop')||a.includes('--update')||a.includes('up'))).toBe(false)
    const before=readFileSync(path.join(f.dir,'.env.docker'),'utf8')
    expect(spawnSync('bash',['deploy.sh'],{cwd:f.dir,env:{...f.env,DB_PASSWORD:'changed',FENGHUO_TEST_FAIL:'--update'}}).status).not.toBe(0)
    expect(readFileSync(path.join(f.dir,'.env.docker'),'utf8')).toBe(before);expect(f.calls().some(a=>a.includes('up'))).toBe(false)
  })
  it('拒绝换行配置，错误不留下正式环境文件',()=>{
    for(const password of ['bad\nDB_NAME=other', 'bad\rDB_NAME=other']){
      const f=fixture(),r=spawnSync('bash',['deploy.sh'],{cwd:f.dir,env:{...f.env,DB_PASSWORD:password}})
      expect(r.status).not.toBe(0);expect(existsSync(path.join(f.dir,'.env.docker'))).toBe(false)
    }
  })
  it('停止服务不删除卷、MySQL或存档；安装只快进更新，不覆盖脏工作目录',()=>{
    const f=fixture();spawnSync('bash',['deploy.sh','check'],{cwd:f.dir,env:f.env});expect(spawnSync('bash',['deploy.sh','stop'],{cwd:f.dir,env:f.env}).status).toBe(0)
    expect(f.calls().some(a=>a.includes('down')||a.includes('--volumes'))).toBe(false)
    const installer=readFileSync('scripts/install-docker.sh','utf8');expect(installer).toContain('pull --ff-only origin main');expect(installer).toContain('status --porcelain');expect(installer).not.toContain('reset --hard')
    const r=spawnSync('bash',[path.resolve('scripts/install-docker.sh')],{env:{...f.env,FENGHUO_DIR:f.dir}});expect(r.status).not.toBe(0)
  })
})
