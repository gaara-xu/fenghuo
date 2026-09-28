import type {FastifyInstance} from 'fastify'
import {z} from 'zod'
import {MAX_RESOURCE_GRANT} from '../../shared/resources.js'
import {grantResources,resourceAdminState} from '../resource-service.js'
const amount=z.number().int().min(0).max(MAX_RESOURCE_GRANT).default(0)
export const grantSchema=z.object({clientActionId:z.string().uuid(),amounts:z.object({food:amount,wood:amount,stone:amount,iron:amount,gold:amount,coupon:amount}).strict().refine(a=>Object.values(a).some(n=>n>0),'至少添加一种资源')}).strict()
export async function registerResources(app:FastifyInstance){
 app.get('/api/admin/resources',async (_r,reply)=>{reply.header('Cache-Control','no-store');return resourceAdminState()})
 app.post('/api/admin/resources/grant',async r=>{const b=grantSchema.parse(r.body);return grantResources(b.amounts,b.clientActionId)})
}
