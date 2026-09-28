import type {FastifyInstance} from 'fastify'
import {timingSafeEqual} from 'node:crypto'
import {z} from 'zod'
import {config} from '../config.js'
import {scheduledTasks,taskPath} from '../../shared/scheduled-tasks.js'
import {listScheduledTasks,runScheduledTask} from '../scheduled-task-service.js'
export function schedulerTokenMatches(header:string|undefined,token:string){
  if(!token)return true
  const provided=Buffer.from(header??''),expected=Buffer.from('Bearer '+token)
  return provided.length===expected.length&&timingSafeEqual(provided,expected)
}
export async function registerScheduledTasks(app:FastifyInstance){
  app.get('/api/admin/tasks',listScheduledTasks)
  const requestKey=z.string().regex(/^[a-zA-Z0-9._:-]{1,128}$/).optional()
  for(const task of scheduledTasks){
    const path=taskPath(task.id)
    // User's scheduler is GET-only. Explicit HEAD handling prevents Fastify from executing GET logic for probes.
    app.route({method:['HEAD','POST'],url:path,handler:async(_r,reply)=>reply.header('Allow','GET').header('Cache-Control','no-store').code(405).send({error:'此任务仅使用GET调用',method:'GET',path,description:task.description})})
    app.get(path,{exposeHeadRoute:false},async(r,reply)=>{
      reply.header('Cache-Control','no-store, no-cache, must-revalidate').header('Pragma','no-cache').header('Expires','0').header('X-Robots-Tag','noindex, nofollow, noarchive')
      if(/prefetch|prerender|preview/i.test(String(r.headers['sec-purpose']??r.headers.purpose??'')))return reply.code(409).send({error:'预取或预览请求不执行任务，请由调度器直接GET调用'})
      if(r.headers['sec-fetch-site']==='cross-site')return reply.code(403).send({error:'不允许从其他网站触发调度任务'})
      if(r.headers.origin){let sameHost=false;try{sameHost=new URL(r.headers.origin).host===r.headers.host}catch{}if(!sameHost)return reply.code(403).send({error:'不允许其他网站触发调度任务'})}
      if(!schedulerTokenMatches(r.headers.authorization,config.SCHEDULER_TOKEN))return reply.code(401).send({error:'调度令牌无效，请设置Authorization: Bearer请求头'})
      const header=requestKey.safeParse(r.headers['idempotency-key']),query=z.object({requestId:requestKey}).strict().safeParse(r.query)
      if(!header.success||!query.success)return reply.code(400).send({error:'仅支持可选requestId参数或Idempotency-Key头，编号需为1至128位字母、数字、点、短横线、下划线或冒号'})
      if(header.data&&query.data.requestId&&header.data!==query.data.requestId)return reply.code(400).send({error:'请求头与URL中的重试编号不一致'})
      if(r.body!=null)return reply.code(400).send({error:'GET任务不接受请求体'})
      try{return await runScheduledTask(task.id,query.data.requestId??header.data)}catch(e){r.log.error(e,'scheduler task failed');return reply.code(500).send({ok:false,taskId:task.id,error:'任务执行失败，变更已回滚；请检查服务日志，重试时复用同一requestId'})}
    })
  }
}
