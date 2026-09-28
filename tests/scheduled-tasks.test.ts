import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest'
import Fastify,{type FastifyInstance} from 'fastify'
import {readFileSync} from 'node:fs'
import {isAdminPath} from '../shared/app-context'
import {scheduledTasks,taskPath} from '../shared/scheduled-tasks'
import {parseConfig,config} from '../server/config'
const handlers=vi.hoisted(()=>({list:vi.fn(),run:vi.fn()}))
vi.mock('../server/scheduled-task-service.js',()=>({listScheduledTasks:handlers.list,runScheduledTask:handlers.run}))
import {registerScheduledTasks,schedulerTokenMatches} from '../server/routes/scheduled-tasks'
describe('管理入口分离',()=>{
  it('/admin与子路径独立，/administrator不会误入后台',()=>{expect(isAdminPath('/admin')).toBe(true);expect(isAdminPath('/admin/')).toBe(true);expect(isAdminPath('/admin/tasks')).toBe(true);expect(isAdminPath('/')).toBe(false);expect(isAdminPath('/administrator')).toBe(false)})
  it('游戏不再调用管理API或携带编辑表单，后台保留管理功能',()=>{const game=readFileSync('web/App.vue','utf8'),admin=readFileSync('web/AdminApp.vue','utf8');expect(game).not.toContain('/api/admin/');expect(game).not.toContain('heroForm');expect(game).not.toContain('ItemManager');expect(game).toContain('/api/catalog/');for(const content of ['saveHero','saveSkill','saveEntry','changeClock','ItemManager','ScheduledTasks'])expect(admin).toContain(content)})
  it('任务只有白名单、每项明确路径与说明，结构基线包含去重表',()=>{expect(scheduledTasks).toHaveLength(5);expect(new Set(scheduledTasks.map(t=>t.id)).size).toBe(5);for(const t of scheduledTasks){expect(taskPath(t.id)).toMatch(/^\/api\/admin\/tasks\/[a-z-]+\/run$/);expect(t.description.length).toBeGreaterThan(15)}expect(readFileSync('database/schema.sql','utf8')).toContain('CREATE TABLE IF NOT EXISTS `scheduled_task_runs`')})
  it('可选调度令牌至少24位，不改变原有无登录方式',()=>{expect(parseConfig({}).SCHEDULER_TOKEN).toBe('');expect(()=>parseConfig({SCHEDULER_TOKEN:'too-short'})).toThrow();expect(schedulerTokenMatches('Bearer '+ 'x'.repeat(24),'x'.repeat(24))).toBe(true);expect(schedulerTokenMatches(undefined,'x'.repeat(24))).toBe(false)})
})
describe('外部调度HTTP接口',()=>{
  let app:FastifyInstance
  const tokenBefore=config.SCHEDULER_TOKEN
  beforeEach(async()=>{vi.clearAllMocks();config.SCHEDULER_TOKEN='';handlers.list.mockResolvedValue({tasks:scheduledTasks,authRequired:false});handlers.run.mockResolvedValue({ok:true,replayed:false});app=Fastify();await registerScheduledTasks(app)})
  afterEach(async()=>{await app.close();config.SCHEDULER_TOKEN=tokenBefore})
  it('GET列清单；HEAD/POST任务不执行；未知任务404',async()=>{expect((await app.inject('/api/admin/tasks')).statusCode).toBe(200);for(const method of ['POST','HEAD'] as const){const r=await app.inject({method,url:taskPath('refresh-outposts')});expect(r.statusCode).toBe(405);expect(r.headers.allow).toBe('GET')}expect((await app.inject({method:'GET',url:'/api/admin/tasks/unknown/run'})).statusCode).toBe(404);expect(handlers.run).not.toHaveBeenCalled()})
  it('五个任务全部GET执行并禁止缓存，支持纯URL传递幂等标识',async()=>{for(const task of scheduledTasks){const r=await app.inject({method:'GET',url:taskPath(task.id)+'?requestId=scheduler:20260915-1'});expect(r.statusCode).toBe(200);expect(r.headers['cache-control']).toContain('no-store');expect(r.headers['x-robots-tag']).toContain('noindex');expect(handlers.run).toHaveBeenLastCalledWith(task.id,'scheduler:20260915-1')}expect(handlers.run).toHaveBeenCalledTimes(5)})
  it('支持无参数GET以及Idempotency-Key请求头，不允许编号冲突',async()=>{const url=taskPath('refresh-outposts');expect((await app.inject(url)).statusCode).toBe(200);expect(handlers.run).toHaveBeenLastCalledWith('refresh-outposts',undefined);expect((await app.inject({url,headers:{'idempotency-key':'header-1'}})).statusCode).toBe(200);expect(handlers.run).toHaveBeenLastCalledWith('refresh-outposts','header-1');expect((await app.inject({url:url+'?requestId=query-2',headers:{'idempotency-key':'header-1'}})).statusCode).toBe(400);expect(handlers.run).toHaveBeenCalledTimes(2)})
  it('拒绝明确标识的预取/预览和跨站请求，不触发任何任务',async()=>{const url=taskPath('refresh-outposts');for(const headers of [{'sec-purpose':'prefetch'}, {purpose:'prefetch'}, {purpose:'preview'}, {'sec-purpose':'prefetch;prerender'}])expect((await app.inject({url,headers})).statusCode).toBe(409);expect((await app.inject({url,headers:{'sec-fetch-site':'cross-site'}})).statusCode).toBe(403);expect(handlers.run).not.toHaveBeenCalled()})
  it('拒绝其他网站来源、错误令牌及多余参数，均无数据库写入',async()=>{const url=taskPath('refresh-map');expect((await app.inject({method:'GET',url,headers:{origin:'https://untrusted.example'}})).statusCode).toBe(403);expect((await app.inject({method:'GET',url:url+'?sql=bad'})).statusCode).toBe(400);expect((await app.inject({method:'GET',url,headers:{'idempotency-key':'非法编号'}})).statusCode).toBe(400);config.SCHEDULER_TOKEN='a'.repeat(24);expect((await app.inject({method:'GET',url})).statusCode).toBe(401);expect(handlers.run).not.toHaveBeenCalled()})
  it('令牌正确允许调度，异常返回非200且不泄露错误详情',async()=>{config.SCHEDULER_TOKEN='a'.repeat(24);const options={method:'GET' as const,url:taskPath('cleanup-records'),headers:{authorization:'Bearer '+'a'.repeat(24)}};expect((await app.inject(options)).statusCode).toBe(200);handlers.run.mockRejectedValueOnce(Error('internal private failure'));const r=await app.inject(options);expect(r.statusCode).toBe(500);expect(r.json().ok).toBe(false);expect(r.body).not.toContain('private')})
})
