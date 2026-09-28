import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import { ZodError } from 'zod'
import { config } from './config.js'
import { registerApi } from './routes/api.js'
import { processDueWorldWork } from './world-service.js'

const app=Fastify({logger:true})
app.setErrorHandler((error,request,reply)=>{
  const raw=error instanceof Error?error.message:''
  const message=/[\u4e00-\u9fff]/.test(raw)?raw:'服务暂时不可用，请稍后重试'
  request.log.error(error)
  const status=error instanceof ZodError?400:(message.includes('不足')||message.includes('上限')?409:500)
  void reply.status(status).send({error:error instanceof ZodError?'请求参数无效':message,details:error instanceof ZodError?error.issues:undefined})
})
await registerApi(app)
setInterval(()=>void processDueWorldWork().catch(error=>app.log.error(error,'background world tick failed')),2000).unref()

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../dist-web')
if(existsSync(root)){
  await app.register(fastifyStatic,{root,wildcard:false})
  app.setNotFoundHandler((request,reply)=> request.url.startsWith('/api/')?reply.status(404).send({error:'接口不存在'}):reply.sendFile('index.html'))
}

await app.listen({host:config.HOST,port:config.PORT})
