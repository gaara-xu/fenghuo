import type {FastifyInstance} from 'fastify'
import {z} from 'zod'
import {accelerateMilitary,enqueueMilitary,getMilitaryState,listMilitary,saveMilitary} from '../military-service.js'
export const troopSelectionSchema=z.array(z.object({code:z.string().regex(/^[a-z0-9_]+$/).max(64),quantity:z.number().int().min(1).max(1000000)})).max(30).default([])
const stat=z.number().int().min(0).max(100000000)
export const militarySchema=z.object({
 code:z.string().regex(/^[a-z0-9_]+$/).max(64),name:z.string().trim().min(1).max(64),kind:z.enum(['TROOP','DEFENSE']),role:z.string().trim().min(1).max(64),description:z.string().max(2000),
 meleeAttack:stat,rangedAttack:stat,meleeDefense:stat,rangedDefense:stat,speed:stat,loadCapacity:stat,foodPerHour:z.number().int().min(0).max(1000000),
 cost:z.object({food:stat.default(0),wood:stat.default(0),stone:stat.default(0),iron:stat.default(0),gold:stat.default(0)}),seconds:z.number().int().min(1).max(86400),enabled:z.boolean(),sourceStatus:z.enum(['VERIFIED','ESTIMATED','DIY']),sourceNote:z.string().max(4000),
}).refine(d=>d.kind!=='TROOP'||d.speed>0,{message:'兵种移动速度必须大于零'}).refine(d=>d.kind!=='DEFENSE'||(d.speed===0&&d.loadCapacity===0&&d.meleeAttack===0&&d.rangedAttack===0&&d.foodPerHour===0),{message:'城防只提供近防和远防，不可移动、出征或耗粮'})
export async function registerMilitary(app:FastifyInstance){
 app.get('/api/military',async (_r,reply)=>{reply.header('Cache-Control','no-store');return getMilitaryState()})
 app.post('/api/military/orders',async r=>{const b=z.object({code:z.string().max(64),quantity:z.number().int().min(1).max(100000),clientActionId:z.string().uuid()}).parse(r.body);return enqueueMilitary(b.code,b.quantity,b.clientActionId)})
 app.post('/api/military/orders/:id/accelerate',async r=>{const {id}=z.object({id:z.coerce.number().int().positive().safe()}).parse(r.params),b=z.object({clientActionId:z.string().uuid(),maxGold:z.number().int().min(0).max(100000000)}).strict().parse(r.body);return accelerateMilitary(id,b.clientActionId,b.maxGold)})
 app.get('/api/admin/military',()=>listMilitary())
 app.put('/api/admin/military/:code',async r=>{const d=militarySchema.parse(r.body);if(d.code!==(r.params as {code:string}).code)throw Error('兵种编号不一致');return saveMilitary(d)})
}
