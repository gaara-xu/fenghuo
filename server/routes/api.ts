import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getPool, assertDatabaseScope } from '../db.js'
import { getBootstrap, listHeroes, listPoolEntries, listSkills, recruitCandidate, refreshMap, refreshTavern, saveHero, savePoolEntry, savePoolSettings, saveSkill, setClock } from '../game-service.js'
import { buildDefense,getWorldStatus,pauseAutoFarm,startAutoFarm,startMarch } from '../world-service.js'
import { learnHeroSkill,upgradeHeroSkill,trainHero,renameHero } from '../hero-service.js'

import {listItems,listDropPools,saveItem,saveDropPool,equipItem,useItem,retireHero,setItemArchived} from '../item-service.js'
import {visibleInTreasury} from '../../shared/treasury.js'
import {getGrowthRules,saveGrowthRules} from '../growth-service.js'
import {clearReports,incomingReports} from '../report-service.js'
import {equipmentSlots,itemTypes} from '../../shared/items.js'
import {statLabels} from '../../shared/hero-growth.js'
import {registerScheduledTasks} from './scheduled-tasks.js'
import {itemSchema} from './item-schema.js'
import {combineGems,listGems} from '../gem-service.js'
import {forgeItem,forgeEquipment,getForgeRules,saveForgeRules} from '../forge-service.js'
import {registerMilitary,troopSelectionSchema} from './military.js'
import {registerResources} from './resources.js'
import {getTavernRecording,setTavernRecording} from '../game-service.js'
import {MAX_DROP_QUANTITY} from '../../shared/drop-rules.js'
import {getWorldBossRules,saveWorldBossRules} from '../world-boss-service.js'
import {salvageEquipment} from '../salvage-service.js'
import {getIncomingRaidRules,saveIncomingRaidRules} from '../incoming-raid-service.js'
import {unsupportedUpdate} from '../../shared/game-update.js'

const sourceStatus = z.enum(['VERIFIED','ESTIMATED','DIY'])
const artKey=z.string().regex(/^[a-z0-9_-]+$/).max(64).nullish()
const heroSchema = z.object({
  code:z.string().min(1).max(64),name:z.string().min(1).max(64),star:z.number().int().min(1).max(6),attackType:z.enum(['MELEE','RANGED','BALANCED','DEFENSE']),
  meleeAttack:z.number().int().min(0),rangedAttack:z.number().int().min(0),meleeDefense:z.number().int().min(0),rangedDefense:z.number().int().min(0),
  speed:z.number().int().min(0),loadCapacity:z.number().int().min(0),staminaMax:z.number().int().positive(),enabled:z.boolean(),sourceStatus,description:z.string().max(4000),
  portraitKey:artKey,qualityTier:z.number().int().min(1).max(7).optional(),
})
const skillSchema = z.object({
  code:z.string().min(1).max(64),name:z.string().min(1).max(64),rarity:z.number().int().min(1).max(6),effectType:z.string().min(1).max(64),targetScope:z.string().min(1).max(64),
  triggerRate:z.number().min(0).max(1),maxLevel:z.number().int().min(1).max(10),enabled:z.boolean(),sourceStatus,description:z.string().max(4000),
  iconKey:artKey,qualityTier:z.number().int().min(1).max(7).optional(),effectConfig:z.object({base:z.number().min(0).max(1000),perLevel:z.number().min(0).max(100),ratePerLevel:z.number().min(0).max(1),mode:z.enum(['ATTACK','DEFENSE','BOTH'])}),
})
const entrySchema=z.object({ poolId:z.number().int().positive(),rewardType:z.enum(['HERO','SKILL_BOOK','ITEM']),heroDefinitionId:z.number().int().positive().nullish(),skillDefinitionId:z.number().int().positive().nullish(),itemDefinitionId:z.number().int().positive().nullish(),weight:z.number().int().min(1).max(1000000),enabled:z.boolean() })
const equipmentSlotSchema=z.enum(Object.keys(equipmentSlots) as (keyof typeof equipmentSlots)[])
const forgeCommandSchema=z.discriminatedUnion('operation',[
  z.object({operation:z.enum(['REFINE','DRILL','SOCKET']),materialId:z.number().int().positive(),clientActionId:z.string().uuid()}),
  z.object({operation:z.literal('UNSOCKET'),gemIndex:z.number().int().min(0).max(2),gemItemId:z.number().int().positive(),clientActionId:z.string().uuid()}),
])
const forgeTargetSchema=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('EQUIPPED'),heroId:z.number().int().positive(),slot:equipmentSlotSchema,instanceId:z.number().int().positive()}),
  z.object({kind:z.literal('INSTANCE'),instanceId:z.number().int().positive()}),
  z.object({kind:z.literal('STACK'),itemId:z.number().int().positive()}),
])

export async function registerApi(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/game-update/status',()=>unsupportedUpdate())
  for(const action of ['check','run'])app.post('/api/admin/game-update/'+action,async(_r,reply)=>reply.code(409).send({error:unsupportedUpdate().message}))
  await registerScheduledTasks(app)
  app.get('/api/admin/world-boss',()=>getWorldBossRules())
  app.put('/api/admin/world-boss',r=>saveWorldBossRules(r.body))
  app.get('/api/admin/incoming-army',()=>getIncomingRaidRules())
  app.put('/api/admin/incoming-army',r=>saveIncomingRaidRules(r.body))
  await registerMilitary(app)
  await registerResources(app)
  app.get('/api/catalog/heroes',listHeroes)
  app.get('/api/catalog/skills',async()=> (await listSkills()).filter(s=>s.enabled))
  app.get('/api/catalog/items',async (_r,reply)=>{reply.header('Cache-Control','no-store');return (await listItems()).filter(visibleInTreasury)})
  const heroId=(r:any)=>z.coerce.number().int().positive().parse(r.params.id)
  const talent=z.enum(['MEDIOCRE','COMMON','GOOD','EXCELLENT','PERFECT'])
  const dropSchema=z.object({id:z.number().int().positive(),name:z.string().min(1).max(64),nodeType:z.enum(['OUTPOST','WILD','DUNGEON','SYSTEM_CITY','RANDOM_CITY']),minLevel:z.number().int().min(1).max(100),maxLevel:z.number().int().min(1).max(100),chance:z.number().min(0).max(1),rolls:z.number().int().min(1).max(10),enabled:z.boolean(),entries:z.array(z.object({itemId:z.number().int().positive(),weight:z.number().int().min(1).max(1000000),minQuantity:z.number().int().min(1).max(MAX_DROP_QUANTITY),maxQuantity:z.number().int().min(1).max(MAX_DROP_QUANTITY),enabled:z.boolean()}).refine(e=>e.minQuantity<=e.maxQuantity)).max(1000)}).refine(p=>p.minLevel<=p.maxLevel)
  app.get('/api/admin/items',listItems)
  app.get('/api/catalog/gems',()=>listGems())
  app.post('/api/gems/combine',async r=>{const q=z.object({itemId:z.number().int().positive(),quantity:z.number().int().min(1).max(9999),clientActionId:z.string().uuid()}).parse(r.body);return combineGems(q.itemId,q.quantity,q.clientActionId)})
  app.get('/api/forge/rules',()=>getForgeRules())
  app.get('/api/admin/forge-rules',()=>getForgeRules())
  app.put('/api/admin/forge-rules',async r=>{const rate=z.number().min(0).max(1);const rules=z.object({refineRates:z.array(rate).length(9),divineBonus:rate,downgradeChance:rate,drillRates:z.array(rate).length(3),drillCost:z.number().int().min(1).max(100),sourceStatus:z.enum(['ESTIMATED','DIY'])}).parse(r.body);await saveForgeRules(rules);return {ok:true}})
  app.post('/api/heroes/:id/forge',async r=>{const q=z.intersection(z.object({slot:equipmentSlotSchema}),forgeCommandSchema).parse(r.body);return forgeItem(heroId(r),q)})
  app.post('/api/forge/equipment',async r=>{const {target,...command}=z.intersection(z.object({target:forgeTargetSchema}),forgeCommandSchema).parse(r.body);return forgeEquipment(target,command)})
  app.post('/api/forge/salvage',async r=>salvageEquipment(r.body))
  app.post('/api/admin/items',async r=>({id:await saveItem(itemSchema.parse(r.body))}))
  app.put('/api/admin/items/:id',async r=>({id:await saveItem(itemSchema.parse(r.body),heroId(r))}))
  app.delete('/api/admin/items/:id',async r=>setItemArchived(heroId(r),true))
  app.post('/api/admin/items/:id/restore',async r=>setItemArchived(heroId(r),false))
  app.get('/api/admin/drop-pools',()=>listDropPools())
  app.put('/api/admin/drop-pools/:id',async r=>{const p=dropSchema.parse(r.body);if(p.id!==heroId(r))throw Error('掉落池编号不一致');await saveDropPool(p);return {ok:true}})
  app.get('/api/admin/growth',()=>getGrowthRules())
  app.put('/api/admin/growth',async r=>{const rules=z.object({combatRate:z.number().min(0.001).max(10),loadRate:z.number().min(0).max(10),speedRate:z.number().min(0).max(1),starFactors:z.array(z.number().min(0.01).max(10)).length(6),talentFactors:z.record(talent,z.number().min(0.01).max(10)),sourceStatus:z.enum(['ESTIMATED','DIY'])}).parse(r.body);await saveGrowthRules(rules);return {ok:true}})
  app.post('/api/heroes/:id/equipment',async r=>{const q=z.object({slot:z.enum(Object.keys(equipmentSlots) as (keyof typeof equipmentSlots)[]),itemId:z.number().int().positive().nullable(),instanceId:z.number().int().positive().optional()}).parse(r.body);await equipItem(heroId(r),q.slot,q.itemId,q.instanceId);return {ok:true}})
  app.post('/api/heroes/:id/items/use',async r=>{const q=z.object({itemId:z.number().int().positive(),clientActionId:z.string().uuid()}).parse(r.body);return useItem(heroId(r),q.itemId,q.clientActionId)})
  app.post('/api/heroes/:id/retire',async r=>{const q=z.object({reason:z.enum(['EXILE','EXECUTE']),confirmName:z.string().min(1).max(64)}).parse(r.body);await retireHero(heroId(r),q.reason,q.confirmName);return {ok:true}})
  app.delete('/api/world/reports',async()=>{await clearReports();return {ok:true}})
  app.get('/api/world/reports/incoming',async r=>{const q=z.object({beforeId:z.coerce.number().int().positive().optional()}).parse(r.query);return incomingReports(q.beforeId)})
  app.get('/api/health', async () => { await assertDatabaseScope(getPool()); return { ok:true,database:'fenghuo',revision:process.env.FENGHUO_APP_REVISION??'development' } })
  app.get('/api/bootstrap', getBootstrap)
  app.get('/api/admin/tavern-recording',getTavernRecording)
  app.put('/api/admin/tavern-recording',async request=>setTavernRecording(z.object({enabled:z.boolean()}).strict().parse(request.body).enabled))
  app.post('/api/tavern/refresh',{logLevel:'silent'}, async request => { const body=z.object({poolId:z.number().int().positive(),clientActionId:z.string().uuid()}).parse(request.body); return refreshTavern(body.poolId,body.clientActionId) })
  app.post('/api/tavern/candidates/:id/recruit',{logLevel:'silent'}, async request => recruitCandidate(z.coerce.number().int().positive().parse((request.params as {id:string}).id)))
  app.get('/api/world/status',getWorldStatus)
  app.post('/api/heroes/:id/rename',async request=>{const b=z.object({name:z.string().trim().min(1).max(32),clientActionId:z.string().uuid()}).parse(request.body);await renameHero(z.coerce.number().int().positive().parse((request.params as {id:string}).id),b.name,b.clientActionId);return {ok:true}})
  app.post('/api/heroes/:id/skills/learn',async request=>{const b=z.object({slot:z.number().int().min(1).max(4),skillId:z.number().int().positive()}).parse(request.body);await learnHeroSkill(z.coerce.number().int().positive().parse((request.params as {id:string}).id),b.slot,b.skillId);return {ok:true}})
  app.post('/api/heroes/:id/skills/upgrade',async request=>{const b=z.object({slot:z.number().int().min(1).max(4)}).parse(request.body);await upgradeHeroSkill(z.coerce.number().int().positive().parse((request.params as {id:string}).id),b.slot);return {ok:true}})
  app.post('/api/heroes/:id/train',async request=>{await trainHero(z.coerce.number().int().positive().parse((request.params as {id:string}).id));return {ok:true}})
  app.post('/api/world/marches',async request=>{const body=z.object({heroId:z.number().int().positive().nullable().default(null),nodeId:z.number().int().positive(),troops:troopSelectionSchema,clientActionId:z.string().uuid().optional()}).parse(request.body);return startMarch(body.heroId,body.nodeId,body.troops,body.clientActionId)})
  app.post('/api/world/auto-farm',async request=>{const body=z.object({heroId:z.number().int().positive().nullable().default(null),nodeId:z.number().int().positive().optional(),troops:troopSelectionSchema,nodeType:z.enum(['OUTPOST','WILD','DUNGEON','SYSTEM_CITY','RANDOM_CITY']),minLevel:z.number().int().min(1),maxLevel:z.number().int().max(100),runs:z.number().int().min(1).max(999)}).refine(v=>v.minLevel<=v.maxLevel).parse(request.body);return startAutoFarm(body.heroId,body.nodeType,body.minLevel,body.maxLevel,body.runs,body.troops,body.nodeId)})
  app.post('/api/world/auto-farm/:id/pause',async request=>{await pauseAutoFarm(z.coerce.number().int().positive().parse((request.params as {id:string}).id));return {ok:true}})
  app.post('/api/city/defenses/build',async request=>{const body=z.object({defenseType:z.string().min(1).max(64),quantity:z.number().int().min(1).max(100000),clientActionId:z.string().uuid().optional()}).parse(request.body);return buildDefense(body.defenseType,body.quantity,body.clientActionId)})
  app.get('/api/admin/heroes', listHeroes)
  app.post('/api/admin/heroes', async request => ({id:await saveHero(heroSchema.parse(request.body))}))
  app.put('/api/admin/heroes/:id', async request => ({id:await saveHero(heroSchema.parse(request.body),z.coerce.number().int().positive().parse((request.params as {id:string}).id))}))
  app.get('/api/admin/skills', listSkills)
  app.post('/api/admin/skills', async request => ({id:await saveSkill(skillSchema.parse(request.body))}))
  app.put('/api/admin/skills/:id', async request => ({id:await saveSkill(skillSchema.parse(request.body),z.coerce.number().int().positive().parse((request.params as {id:string}).id))}))
  app.get('/api/admin/pool-entries', listPoolEntries)
  app.put('/api/admin/tavern-pools/:id',async r=>{const body=z.object({refreshCost:z.number().int().min(0).max(1000000000),candidateCount:z.number().int().min(1).max(6),selectLimit:z.number().int().min(1).max(6)}).parse(r.body);await savePoolSettings(heroId(r),body);return {ok:true}})
  app.post('/api/admin/pool-entries', async request => ({id:await savePoolEntry(entrySchema.parse(request.body))}))
  app.put('/api/admin/pool-entries/:id', async request => ({id:await savePoolEntry(entrySchema.parse(request.body),z.coerce.number().int().positive().parse((request.params as {id:string}).id))}))
  app.post('/api/admin/clock', async request => { const body=z.object({multiplier:z.number().min(0.1).max(1000),jumpSeconds:z.number().int().min(0).max(315360000).default(0)}).parse(request.body); await setClock(body.multiplier,body.jumpSeconds); return {ok:true} })
  app.post('/api/admin/map/refresh', async () => ({generation:await refreshMap()}))
}
