import { randomUUID } from 'node:crypto'
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import type { BootstrapPayload, HeroDefinition, MapNode, SkillDefinition, TavernCandidate, TavernPool, TavernRefreshResult } from '../shared/contracts.js'
import { config } from './config.js'
import { getPool, inTransaction } from './db.js'
import { gameNow, type ClockRow } from './domain/clock.js'
import { pickTalent, SeededRandom } from './domain/random.js'
import { skillConfig } from './domain/skills.js'
import {MAX_OWNED_HEROES,rollOutpostLevel,outpostDefense,outpostDropFactor} from '../shared/world-rules.js'
import {cleanSkillDescription} from '../shared/skill-copy.js'
import {chooseMapPosition} from '../shared/map-placement.js'
import {isWorldBoss,worldBossDefenses,worldBossArmy,worldBossGarrison,worldBossExpired,worldBossExpiresAt} from '../shared/world-boss.js'
import {getWorldBossRules,maintainWorldBosses} from './world-boss-service.js'
import {dynamicNodeTypes,type DynamicNodeType} from '../shared/scheduled-tasks.js'
import {armyStats,npcArmy} from '../shared/military.js'
import {mapItem,inventoryDelta} from './item-service.js'
import type {ItemDefinition} from '../shared/items.js'
import type {RewardType} from '../shared/contracts.js'
import {eligibleTreasureItem} from '../shared/tavern.js'
import {isObsoleteItem,obsoleteItemCodes} from '../shared/obsolete-items.js'
import {tavernMemory} from './tavern-memory.js'
import {readTavernRecording,type TavernRecording} from './tavern-recording.js'

const PLAYER_ID = config.PLAYER_ID
const currencies = new Set(['food', 'wood', 'stone', 'iron', 'gold', 'coupon'])
interface TavernEntryRow extends RowDataPacket { weight:number;reward_type:RewardType;talent_weights:string|Record<string,number>|null;hero_definition_id:number|null;skill_definition_id:number|null;item_definition_id:number|null;hero_name:string|null;skill_name:string|null;hero_star:number|null;skill_rarity:number|null }

function bool(value: unknown): boolean { return Boolean(value) }
function iso(value: Date | string): string { return new Date(value).toISOString() }

function mapPool(row: RowDataPacket): TavernPool {
  return { id: Number(row.pool_id ?? row.id), code: row.code, name: row.name, poolType: row.pool_type, currencyCode: row.currency_code, refreshCost: Number(row.refresh_cost), candidateCount: Number(row.candidate_count), selectLimit: Number(row.select_limit), enabled: bool(row.enabled) }
}

function mapCandidate(row: RowDataPacket): TavernCandidate {
  const item:ItemDefinition|undefined=typeof row.item_snapshot==='string'?JSON.parse(row.item_snapshot):row.item_snapshot??undefined
  return { id: Number(row.id), slotNo: Number(row.slot_no), rewardType: row.reward_type, heroDefinitionId: row.hero_definition_id ? Number(row.hero_definition_id) : undefined, skillDefinitionId: row.skill_definition_id ? Number(row.skill_definition_id) : undefined, itemDefinitionId:row.item_definition_id?Number(row.item_definition_id):undefined,item,name: row.name_snapshot, rarity: Number(row.rarity_snapshot), talentGrade: row.talent_grade ?? undefined, recruited: Boolean(row.recruited_at) }
}

async function loadRefresh(connection: PoolConnection | ReturnType<typeof getPool>, refreshId: number): Promise<TavernRefreshResult> {
  const [refreshRows] = await connection.query<RowDataPacket[]>(`SELECT r.*, p.code,p.name,p.pool_type,p.currency_code,p.refresh_cost,p.candidate_count,p.select_limit,p.enabled,
    w.food,w.wood,w.stone,w.iron,w.gold,w.coupon
    FROM tavern_refreshes r JOIN tavern_pools p ON p.id=r.pool_id JOIN resource_wallet w ON w.player_id=r.player_id
    WHERE r.id=? AND r.player_id=?`, [refreshId, PLAYER_ID])
  if (!refreshRows[0]) throw new Error('刷新记录不存在')
  const row = refreshRows[0]
  const [candidateRows] = await connection.query<RowDataPacket[]>("SELECT * FROM tavern_candidates WHERE refresh_id=? ORDER BY slot_no", [refreshId])
  return { refreshId, pool: {...mapPool(row),selectLimit:Number(row.select_limit_snapshot??row.select_limit)}, candidates: candidateRows.map(mapCandidate), remainingCurrency: Number(row[row.currency_code]), createdAt: iso(row.created_at) }
}


async function visibleRefresh(c:PoolConnection|ReturnType<typeof getPool>,result:TavernRefreshResult):Promise<TavernRefreshResult>{
 const copy=structuredClone(result)
 const [skills]=await c.query<RowDataPacket[]>('SELECT id FROM skill_definitions WHERE enabled=1')
 const enabled=new Set(skills.map(s=>Number(s.id)))
 copy.candidates=copy.candidates.filter(c=>c.rewardType!=='SKILL_BOOK'||enabled.has(c.skillDefinitionId!))
 if(copy.candidates.some(c=>c.rewardType==='ITEM')){
  const [items]=await c.query<RowDataPacket[]>(`SELECT * FROM item_definitions WHERE enabled=0 AND code IN (${obsoleteItemCodes.map(()=>'?').join(',')})`,obsoleteItemCodes)
  const obsolete=new Set(items.filter(i=>isObsoleteItem(mapItem(i))).map(i=>Number(i.id)))
  copy.candidates=copy.candidates.filter(c=>c.rewardType!=='ITEM'||!obsolete.has(c.itemDefinitionId!))
 }
 return copy
}
async function latestTavernRounds(c:PoolConnection|ReturnType<typeof getPool>,mode:TavernRecording){
 const memory=tavernMemory.all(),results=[...memory],poolIds=new Set(memory.map(r=>r.pool.id))
 if(mode.enabled){
  const [rows]=await c.query<RowDataPacket[]>('SELECT MAX(id) id FROM tavern_refreshes WHERE player_id=? AND id>? GROUP BY pool_id',[PLAYER_ID,mode.afterRefreshId])
  for(const r of rows){const round=await loadRefresh(c,Number(r.id));if(!poolIds.has(round.pool.id))results.push(round)}
 }
 return results.sort((a,b)=>b.createdAt.localeCompare(a.createdAt))
}
export async function getTavernRecording(){return {enabled:(await readTavernRecording()).enabled}}
export async function setTavernRecording(enabled:boolean){
 return tavernMemory.serial(async()=>{
  let adopted:TavernRefreshResult[]=[]
  const result=await inTransaction(async c=>{
   await c.query('SELECT id FROM player_profile WHERE id=? FOR UPDATE',[PLAYER_ID])
   const previous=await readTavernRecording(c)
   const [exists]=await c.query<RowDataPacket[]>("SELECT setting_key FROM game_settings WHERE setting_key='tavern_recording'")
   if(previous.enabled===enabled&&exists.length)return {enabled}
   if(previous.enabled!==enabled){
    const memoryIds=new Set(tavernMemory.all().map(r=>r.refreshId))
    adopted=(await latestTavernRounds(c,previous)).filter(r=>!memoryIds.has(r.refreshId))
    // Old database rounds remain untouched as history, but can never be claimed again after a switch.
   }
   const [rows]=await c.query<RowDataPacket[]>('SELECT COALESCE(MAX(id),0) id FROM tavern_refreshes WHERE player_id=?',[PLAYER_ID])
   const value={enabled,afterRefreshId:previous.enabled===enabled?previous.afterRefreshId:Number(rows[0].id)}
   await c.execute("INSERT INTO game_settings (setting_key,setting_value,value_type,description) VALUES ('tavern_recording',?,'JSON','三类酒馆刷新是否入库；关闭时仅保留进程内当前候选，旧历史不删除') ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)",[JSON.stringify(value)])
   return {enabled}
  })
  // Publish only after the settings transaction commits. Retain paid candidates across toggles.
  for(const round of adopted){round.refreshId=tavernMemory.nextId();round.candidates=round.candidates.map(c=>({...c,id:tavernMemory.nextId()}));tavernMemory.remember(round)}
  return result
 })
}
export async function refreshTavern(poolId:number,clientActionId:string):Promise<TavernRefreshResult>{
 return tavernMemory.serial(async()=>{
  let fresh=false,recorded=false
  const result=await inTransaction(async connection=>{
   await connection.query('SELECT id FROM player_profile WHERE id=? FOR UPDATE',[PLAYER_ID])
   const mode=await readTavernRecording(connection);recorded=mode.enabled
   const retry=tavernMemory.retry(poolId,clientActionId);if(retry)return retry
   if(mode.enabled){
    const [oldRows]=await connection.query<RowDataPacket[]>('SELECT id,pool_id FROM tavern_refreshes WHERE player_id=? AND client_action_id=? AND id>?',[PLAYER_ID,clientActionId,mode.afterRefreshId])
    if(oldRows[0]){
     if(Number(oldRows[0].pool_id)!==poolId)throw Error('重复请求与原卡池不一致')
     const [latest]=await connection.query<RowDataPacket[]>('SELECT MAX(id) id FROM tavern_refreshes WHERE player_id=? AND pool_id=?',[PLAYER_ID,poolId])
     if(Number(latest[0].id)!==Number(oldRows[0].id))throw Error('该刷新已过期，请使用当前候选')
     return loadRefresh(connection,Number(oldRows[0].id))
    }
   }
   const [poolRows]=await connection.query<RowDataPacket[]>('SELECT * FROM tavern_pools WHERE id=? AND enabled=1 FOR UPDATE',[poolId])
   const poolRow=poolRows[0];if(!poolRow)throw Error('酒馆卡池不存在或已停用')
   if(!currencies.has(poolRow.currency_code))throw Error('卡池货币配置无效')
   const currency=String(poolRow.currency_code)
   const [walletRows]=await connection.query<RowDataPacket[]>('SELECT * FROM resource_wallet WHERE player_id=? FOR UPDATE',[PLAYER_ID])
   const wallet=walletRows[0];if(!wallet||Number(wallet[currency])<Number(poolRow.refresh_cost))throw Error('资源不足，无法刷新')
    const [entryRows] = await connection.query<TavernEntryRow[]>(`SELECT e.*, h.name hero_name,h.star hero_star,s.name skill_name,s.rarity skill_rarity,
      i.code,i.name,i.item_type,i.rarity,i.quality_tier,i.effect_config,i.description,i.deleted_at
      FROM tavern_pool_entries e
      LEFT JOIN hero_definitions h ON h.id=e.hero_definition_id AND h.enabled=1
      LEFT JOIN skill_definitions s ON s.id=e.skill_definition_id AND s.enabled=1
      LEFT JOIN item_definitions i ON i.id=e.item_definition_id AND i.enabled=1 AND i.deleted_at IS NULL
      WHERE e.pool_id=? AND e.enabled=1 AND e.weight>0
        AND ((e.reward_type='HERO' AND h.id IS NOT NULL) OR (e.reward_type='SKILL_BOOK' AND s.id IS NOT NULL)
          OR (e.reward_type='ITEM' AND i.id IS NOT NULL AND i.item_type IN ('EQUIPMENT','TREASURE','CONSUMABLE','MATERIAL')))`, [poolId])

   if(!entryRows.length)throw Error('酒馆卡池尚未配置条目')
   await connection.query(`UPDATE resource_wallet SET \`${currency}\`=\`${currency}\`-? WHERE player_id=?`,[poolRow.refresh_cost,PLAYER_ID])
   const seed=randomUUID().replaceAll('-',''),random=new SeededRandom(seed)
   let refreshId=tavernMemory.nextId()
   if(mode.enabled){
    const [row]=await connection.execute<ResultSetHeader>('INSERT INTO tavern_refreshes (player_id,pool_id,pool_version,rng_seed,currency_code,currency_cost,client_action_id,select_limit_snapshot) VALUES (?,?,?,?,?,?,?,?)',[PLAYER_ID,poolId,poolRow.version,seed,currency,poolRow.refresh_cost,clientActionId,poolRow.select_limit])
    refreshId=row.insertId
   }
   const candidates:TavernCandidate[]=[]
   for(let slot=1;slot<=Number(poolRow.candidate_count);slot++){
    const entry=random.pickWeighted(entryRows),isHero=entry.reward_type==='HERO',item=entry.reward_type==='ITEM'?mapItem({...entry,id:entry.item_definition_id}):undefined
    const weights=typeof entry.talent_weights==='string'?JSON.parse(entry.talent_weights):entry.talent_weights
    const candidate:TavernCandidate={id:tavernMemory.nextId(),slotNo:slot,rewardType:entry.reward_type,heroDefinitionId:entry.hero_definition_id?Number(entry.hero_definition_id):undefined,skillDefinitionId:entry.skill_definition_id?Number(entry.skill_definition_id):undefined,itemDefinitionId:entry.item_definition_id?Number(entry.item_definition_id):undefined,item,name:item?.name??String(isHero?entry.hero_name:entry.skill_name),rarity:item?.rarity??Number(isHero?entry.hero_star:entry.skill_rarity),talentGrade:isHero?pickTalent(random,weights) as TavernCandidate['talentGrade']:undefined,recruited:false}
    if(mode.enabled){
     const [row]=await connection.execute<ResultSetHeader>('INSERT INTO tavern_candidates (refresh_id,slot_no,reward_type,hero_definition_id,skill_definition_id,item_definition_id,item_snapshot,name_snapshot,rarity_snapshot,talent_grade) VALUES (?,?,?,?,?,?,?,?,?,?)',[refreshId,slot,candidate.rewardType,candidate.heroDefinitionId??null,candidate.skillDefinitionId??null,candidate.itemDefinitionId??null,item?JSON.stringify(item):null,candidate.name,candidate.rarity,candidate.talentGrade??null])
     candidate.id=row.insertId
    }
    candidates.push(candidate)
   }
   fresh=true
   if(mode.enabled)return loadRefresh(connection,refreshId)
   return {refreshId,pool:mapPool(poolRow),candidates,remainingCurrency:Number(wallet[currency])-Number(poolRow.refresh_cost),createdAt:new Date().toISOString()}
  })
  if(fresh){if(recorded)tavernMemory.remove(poolId);else tavernMemory.remember(result,clientActionId)}
  return visibleRefresh(getPool(),result)
 })
}
async function awardTavernCandidate(c:PoolConnection,candidate:TavernCandidate){
 if(candidate.rewardType==='HERO'){
  const [owned]=await c.query<RowDataPacket[]>('SELECT COUNT(*) total FROM owned_heroes WHERE player_id=? AND retired_at IS NULL',[PLAYER_ID])
  if(Number(owned[0].total)>=MAX_OWNED_HEROES)throw Error('英雄上限为6位，请先流放或斩首一位英雄')
  await c.execute('INSERT INTO owned_heroes (player_id,hero_definition_id,talent_grade,stamina) SELECT ?,id,?,stamina_max FROM hero_definitions WHERE id=?',[PLAYER_ID,candidate.talentGrade!,candidate.heroDefinitionId!])
 }else if(candidate.rewardType==='ITEM'){
  const [items]=await c.query<RowDataPacket[]>('SELECT * FROM item_definitions WHERE id=? FOR UPDATE',[candidate.itemDefinitionId!])
  if(!items[0]||!items[0].enabled&&isObsoleteItem(mapItem(items[0])))throw Error('该无效道具已清理，请刷新藏宝阁')
  await inventoryDelta(c,candidate.itemDefinitionId!,1)
 }
 else{
  const [skills]=await c.query<RowDataPacket[]>('SELECT id FROM skill_definitions WHERE id=? AND enabled=1 FOR UPDATE',[candidate.skillDefinitionId!])
  if(!skills.length)throw Error('该技能暂时下架，请刷新藏书阁')
  await c.execute('INSERT INTO player_skill_books (player_id,skill_definition_id,quantity) VALUES (?,?,1) ON DUPLICATE KEY UPDATE quantity=quantity+1',[PLAYER_ID,candidate.skillDefinitionId!])
 }
}
export async function recruitCandidate(candidateId:number):Promise<{rewardType:string;name:string}>{
 return tavernMemory.serial(async()=>{
  const memory=tavernMemory.candidate(candidateId)
  const result=await inTransaction(async c=>{
   await c.query('SELECT id FROM player_profile WHERE id=? FOR UPDATE',[PLAYER_ID])
   if(memory){
    const {round,candidate}=memory
    if(!candidate.recruited){
     if(round.candidates.filter(c=>c.recruited).length>=round.pool.selectLimit)throw Error('本次刷新已达到选取上限')
     await awardTavernCandidate(c,candidate)
    }
    return {rewardType:candidate.rewardType,name:candidate.name}
   }
   const mode=await readTavernRecording(c)
   if(!mode.enabled)throw Error('候选已过期或游戏服务已重启，请重新刷新')
   const [rows]=await c.query<RowDataPacket[]>(`SELECT c.*,COALESCE(r.select_limit_snapshot,p.select_limit) select_limit,
    (SELECT COUNT(*) FROM tavern_candidates chosen WHERE chosen.refresh_id=c.refresh_id AND chosen.recruited_at IS NOT NULL) chosen_count
    FROM tavern_candidates c JOIN tavern_refreshes r ON r.id=c.refresh_id JOIN tavern_pools p ON p.id=r.pool_id
    WHERE c.id=? AND r.player_id=? AND r.id>? AND r.id=(SELECT MAX(latest.id) FROM tavern_refreshes latest WHERE latest.player_id=r.player_id AND latest.pool_id=r.pool_id) FOR UPDATE`,[candidateId,PLAYER_ID,mode.afterRefreshId])
   const row=rows[0];if(!row)throw Error('候选项不存在或已过期')
   const candidate=mapCandidate(row)
   if(!candidate.recruited){
    if(Number(row.chosen_count)>=Number(row.select_limit))throw Error('本次刷新已达到选取上限')
    await awardTavernCandidate(c,candidate)
    await c.execute('UPDATE tavern_candidates SET recruited_at=NOW() WHERE id=?',[candidateId])
   }
   return {rewardType:candidate.rewardType,name:candidate.name}
  })
  // Failed awards leave the memory candidate claimable; successful retries cannot award twice.
  if(memory)memory.candidate.recruited=true
  return result
 })
}
async function currentTavernState(){
 return tavernMemory.serial(async()=>{
  const c=getPool(),mode=await readTavernRecording(c),rounds=await latestTavernRounds(c,mode)
  const [wallet]=await c.query<RowDataPacket[]>('SELECT * FROM resource_wallet WHERE player_id=?',[PLAYER_ID])
  return {enabled:mode.enabled,rounds:await Promise.all(rounds.map(r=>visibleRefresh(c,{...r,remainingCurrency:Number(wallet[0]?.[r.pool.currencyCode]??0)})))}
 })
}

export async function getBootstrap(): Promise<BootstrapPayload> {
  const pool = getPool()
  const [[player], [poolRows], [nodeRows], [clockRows]] = await Promise.all([
    pool.query<RowDataPacket[]>(`SELECT p.*,w.food,w.wood,w.stone,w.iron,w.gold,w.coupon FROM player_profile p JOIN resource_wallet w ON w.player_id=p.id WHERE p.id=?`, [PLAYER_ID]),
    pool.query<RowDataPacket[]>('SELECT * FROM tavern_pools WHERE enabled=1 ORDER BY id'),
    pool.query<RowDataPacket[]>('SELECT * FROM map_nodes WHERE status=\'ACTIVE\' AND level>0 ORDER BY node_type,level'),
    pool.query<RowDataPacket[]>('SELECT * FROM game_clock WHERE id=1'),
  ])
  if (!player[0] || !clockRows[0]) throw new Error('尚未初始化，请先执行数据库种子')
  const clock = clockRows[0]
  const calculated = gameNow(clock as ClockRow)
  const clockOffsetSeconds = Math.round((calculated.getTime() - Date.now()) / 1000)
  const tavernState=await currentTavernState(),latestRefreshes=tavernState.rounds
  const latestRefresh = latestRefreshes[0]??null
  return {
    player: { id: Number(player[0].id), displayName: player[0].display_name, cityName: player[0].city_name, nationCode: player[0].nation_code,
      wallet: { food: Number(player[0].food), wood: Number(player[0].wood), stone: Number(player[0].stone), iron: Number(player[0].iron), gold: Number(player[0].gold), coupon: Number(player[0].coupon) } },
    pools: poolRows.map(mapPool), latestRefresh,latestRefreshes,tavernRecordingEnabled:tavernState.enabled,
    clock: { multiplier: Number(clock.multiplier), offsetSeconds: clockOffsetSeconds, gameNow: calculated.toISOString() },
    mapNodes: nodeRows.filter(row=>!isWorldBoss(row.garrison_config)||!worldBossExpired(row.garrison_config,calculated)).map(row => {const boss=isWorldBoss(row.garrison_config),power=boss?Math.max(...Object.values(worldBossDefenses(row.garrison_config))):row.node_type==='OUTPOST'?outpostDefense(Number(row.level)):Number((typeof row.garrison_config==='string'?JSON.parse(row.garrison_config):row.garrison_config)?.power??Number(row.level)*120),stats=armyStats(boss?worldBossArmy(row.garrison_config):npcArmy(power,row.defense_bias,['SYSTEM_CITY','RANDOM_CITY'].includes(row.node_type)));return { id:Number(row.id), worldBoss:boss,expiresGameAt:boss?worldBossExpiresAt(row.garrison_config):undefined,nodeType:row.node_type, name:row.name, level:Number(row.level), x:Number(row.x), y:Number(row.y), defenseBias:row.defense_bias, status:row.status, rewardHint:row.reward_hint,defensePower:power,meleeDefense:stats.meleeDefense,rangedDefense:stats.rangedDefense,dropFactor:row.node_type==='OUTPOST'?outpostDropFactor(Number(row.level)):1 } as MapNode}),
  }
}

export async function listHeroes(): Promise<HeroDefinition[]> {
  const [rows] = await getPool().query<RowDataPacket[]>('SELECT * FROM hero_definitions ORDER BY star DESC,id')
  return rows.map(row => ({ id:Number(row.id),code:row.code,name:row.name,star:Number(row.star),qualityTier:Number(row.quality_tier??row.star),attackType:row.attack_type,meleeAttack:Number(row.melee_attack),rangedAttack:Number(row.ranged_attack),meleeDefense:Number(row.melee_defense),rangedDefense:Number(row.ranged_defense),speed:Number(row.speed),loadCapacity:Number(row.load_capacity),staminaMax:Number(row.stamina_max),enabled:bool(row.enabled),sourceStatus:row.source_status,description:row.description,portraitKey:row.portrait_key }))
}

export function mapSkillRow(row:RowDataPacket):SkillDefinition {
  return {id:Number(row.id),code:row.code,name:row.name,rarity:Number(row.rarity),qualityTier:Number(row.quality_tier??row.rarity),effectType:row.effect_type,targetScope:row.target_scope,triggerRate:Number(row.trigger_rate),maxLevel:Number(row.max_level),enabled:bool(row.enabled),sourceStatus:row.source_status,description:cleanSkillDescription(row.description),iconKey:row.icon_key,effectConfig:skillConfig(row.effect_config)}
}

export async function listSkills(): Promise<SkillDefinition[]> {
  const [rows] = await getPool().query<RowDataPacket[]>('SELECT * FROM skill_definitions ORDER BY rarity DESC,id')
  const [levels]=await getPool().query<RowDataPacket[]>('SELECT * FROM skill_levels ORDER BY level')
  return rows.map(row=>({...mapSkillRow(row),levels:levels.filter(x=>Number(x.skill_definition_id)===Number(row.id)).map(x=>({level:Number(x.level),effectValue:Number(x.effect_value),upgradeExp:Number(x.upgrade_exp),sameBookCost:Number(x.same_book_cost)}))}))
}

export async function saveHero(input: Omit<HeroDefinition,'id'>, id?: number): Promise<number> {
  const values = [input.code,input.name,input.star,input.attackType,input.meleeAttack,input.rangedAttack,input.meleeDefense,input.rangedDefense,input.speed,input.loadCapacity,input.staminaMax,input.sourceStatus,input.description,input.enabled]
  return inTransaction(async connection => {
    let entityId = id
    if (id) {
      await connection.execute(`UPDATE hero_definitions SET code=?,name=?,star=?,attack_type=?,melee_attack=?,ranged_attack=?,melee_defense=?,ranged_defense=?,speed=?,load_capacity=?,stamina_max=?,source_status=?,description=?,enabled=? WHERE id=?`, [...values,id])
    } else {
      const [result] = await connection.execute<ResultSetHeader>(`INSERT INTO hero_definitions (code,name,star,attack_type,melee_attack,ranged_attack,melee_defense,ranged_defense,speed,load_capacity,stamina_max,source_status,description,enabled) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, values)
      entityId = result.insertId
    }
    await connection.execute('UPDATE hero_definitions SET portrait_key=COALESCE(?,portrait_key),quality_tier=? WHERE id=?',[input.portraitKey??null,input.qualityTier??input.star,entityId!])
    await connection.execute('INSERT INTO admin_audit_logs (action,entity_type,entity_id,after_json) VALUES (?,?,?,?)', [id?'UPDATE':'CREATE','HERO',String(entityId),JSON.stringify(input)])
    return entityId!
  })
}

export async function saveSkill(input: Omit<SkillDefinition,'id'>, id?: number): Promise<number> {
  input={...input,description:cleanSkillDescription(input.description)}
  const values = [input.code,input.name,input.rarity,input.effectType,input.targetScope,input.triggerRate,input.maxLevel,input.sourceStatus,input.description,input.enabled]
  return inTransaction(async connection => {
    let entityId = id
    if (id) await connection.execute(`UPDATE skill_definitions SET code=?,name=?,rarity=?,effect_type=?,target_scope=?,trigger_rate=?,max_level=?,source_status=?,description=?,enabled=? WHERE id=?`, [...values,id])
    else { const [result] = await connection.execute<ResultSetHeader>(`INSERT INTO skill_definitions (code,name,rarity,effect_type,target_scope,trigger_rate,max_level,source_status,description,enabled) VALUES (?,?,?,?,?,?,?,?,?,?)`, values); entityId=result.insertId }
    const cfg=skillConfig(input.effectConfig)
    await connection.execute('UPDATE skill_definitions SET icon_key=COALESCE(?,icon_key),effect_config=?,quality_tier=? WHERE id=?',[input.iconKey??null,JSON.stringify(cfg),input.qualityTier??input.rarity,entityId!])
    await connection.execute("INSERT INTO item_definitions (code,name,item_type,rarity,quality_tier,effect_config,description,enabled) VALUES (?,?,'SKILL_BOOK',?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name),rarity=VALUES(rarity),quality_tier=VALUES(quality_tier),description=VALUES(description),enabled=VALUES(enabled)",['skill_book_'+input.code,input.name,input.rarity,input.qualityTier??input.rarity,JSON.stringify({skillId:entityId}),input.description,input.enabled])
    for(let level=0;level<=input.maxLevel;level++){
      await connection.execute('INSERT INTO skill_levels (skill_definition_id,level,effect_value,upgrade_exp,same_book_cost) VALUES (?,?,?,?,1) ON DUPLICATE KEY UPDATE effect_value=VALUES(effect_value)',[entityId!,level,cfg.base+level*cfg.perLevel,level*100])
    }
    await connection.execute('INSERT INTO admin_audit_logs (action,entity_type,entity_id,after_json) VALUES (?,?,?,?)', [id?'UPDATE':'CREATE','SKILL',String(entityId),JSON.stringify(input)])
    return entityId!
  })
}

export async function setClock(multiplier: number, jumpSeconds: number): Promise<void> {
  await inTransaction(async connection => {
    const [rows] = await connection.query<RowDataPacket[]>('SELECT * FROM game_clock WHERE id=1 FOR UPDATE')
    if(!rows[0]) throw new Error('游戏时钟尚未初始化')
    const now = new Date(); const current = gameNow(rows[0] as ClockRow, now); current.setSeconds(current.getSeconds()+jumpSeconds)
    await connection.execute('UPDATE game_clock SET real_anchor_at=?,game_anchor_at=?,multiplier=? WHERE id=1',[now,current,multiplier])
    await connection.execute('INSERT INTO admin_audit_logs (action,entity_type,entity_id,after_json) VALUES (?,?,?,?)',['SET_CLOCK','GAME_CLOCK','1',JSON.stringify({multiplier,jumpSeconds})])
  })
}

export async function refreshMap(): Promise<number> {
  return inTransaction(c=>refreshMapInTransaction(c))
}

export async function refreshMapInTransaction(c:PoolConnection,types:readonly DynamicNodeType[]=dynamicNodeTypes,audit=true):Promise<number>{
    await c.query('SELECT id FROM player_profile WHERE id=? FOR UPDATE',[PLAYER_ID])
    const now=await maintainWorldBosses(c)
    const [rows]=await c.query<RowDataPacket[]>('SELECT * FROM map_nodes ORDER BY id'),generation=Math.max(0,...rows.map(r=>Number(r.generation)))+1
    const [busy]=await c.query<RowDataPacket[]>("SELECT map_node_id FROM march_orders WHERE status IN ('MARCHING','FIGHTING','RETURNING')")
    const activeIds=new Set(busy.map(r=>Number(r.map_node_id)))
    const movable=new Set(rows.filter(r=>types.includes(r.node_type)&&!activeIds.has(Number(r.id))&&!isWorldBoss(r.garrison_config)).map(r=>Number(r.id)))
    const occupied=rows.filter(r=>!movable.has(Number(r.id))).map(r=>({x:Number(r.x),y:Number(r.y)})),names={OUTPOST:'山贼据点',WILD:'河谷野地',RANDOM_CITY:'无主小城'}
    // Reserve a complete layout first. MySQL coordinates are unique, so move editable rows to
    // temporary, transaction-local coordinates before applying it (no intermediate map is visible).
    const layout=new Map<number,{x:number;y:number}>()
    for(const row of rows.filter(r=>movable.has(Number(r.id)))){
      const point=chooseMapPosition(occupied);if(!point)throw Error('地图已满，暂时没有足够的安全间距')
      occupied.push(point);layout.set(Number(row.id),point)
    }
    const temporaryX=Math.max(1000,...rows.map(r=>Number(r.x)))+1
    let temporaryIndex=0
    for(const id of movable)await c.execute('UPDATE map_nodes SET x=?,y=-1000 WHERE id=?',[temporaryX+temporaryIndex++,id])
    for(const type of new Set(types)){
      const sameType=rows.filter(r=>r.node_type===type&&!isWorldBoss(r.garrison_config)),editable=sameType.filter(r=>!activeIds.has(Number(r.id)))
      // Count in-flight targets too, so frequent calls cannot grow the map indefinitely.
      for(let i=0;i<editable.length+Math.max(0,4-sameType.length);i++){
      const row=editable[i],level=type==='OUTPOST'?rollOutpostLevel():1+Math.floor(Math.random()*5),rewards={food:level*800,gold:level*120},power=type==='OUTPOST'?outpostDefense(level):level*130
      if(row){const point=layout.get(Number(row.id))!;await c.execute("UPDATE map_nodes SET name=?,level=?,x=?,y=?,garrison_config=?,reward_config=?,reward_hint=?,generation=?,status='ACTIVE' WHERE id=?",[names[type],level,point.x,point.y,JSON.stringify({power}),JSON.stringify(rewards),'资源与随机战利品',generation,row.id])}
      else{
        const position=chooseMapPosition(occupied)
        if(!position)throw Error('地图已满，暂时没有足够的安全间距')
        const {x,y}=position;occupied.push(position)
        await c.execute('INSERT INTO map_nodes (node_type,name,level,x,y,defense_bias,garrison_config,reward_config,reward_hint,generation) VALUES (?,?,?,?,?,?,?,?,?,?)',[type,names[type],level,x,y,i%2?'MELEE':'RANGED',JSON.stringify({power}),JSON.stringify(rewards),'资源与随机战利品',generation])
      }
    }
    }
    // Both monster refresh entries (including GET refresh-outposts) must roll once.
    // A combined refresh still shares this single roll, not one roll per node type.
    if((types.includes('OUTPOST')||types.includes('WILD'))&&!rows.some(r=>isWorldBoss(r.garrison_config)&&r.status==='ACTIVE'&&Number(r.level)>0&&!worldBossExpired(r.garrison_config,now))){
      const rules=await getWorldBossRules(c)
      if(rules.enabled&&Math.random()<rules.spawnChance){
        const spot=chooseMapPosition(occupied)
        if(spot)await c.execute("INSERT INTO map_nodes (node_type,name,level,x,y,defense_bias,garrison_config,reward_config,reward_hint,generation) VALUES ('WILD','世界首领·乱世魔将',?,?,?,'BALANCED',?,?,?,?)",[rules.level,spot.x,spot.y,JSON.stringify(worldBossGarrison(rules,now)),JSON.stringify({food:10000000,gold:2000000,wood:5000000,stone:5000000,iron:5000000}),'全目录豪华掉落 · 限时5分钟 · 首次击败即消失',generation])
      }
    }
    if(audit)await c.execute("INSERT INTO admin_audit_logs (action,entity_type,entity_id,after_json) VALUES ('REFRESH','MAP',?,?)",[String(generation),JSON.stringify({generation,nodeTypes:types,keptActiveTargets:activeIds.size})])
    return generation
}

export async function listPoolEntries(): Promise<RowDataPacket[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(`SELECT e.id,e.pool_id,e.reward_type,e.hero_definition_id,e.skill_definition_id,e.item_definition_id,e.weight,e.enabled,
    COALESCE(h.name,s.name,i.name) reward_name,COALESCE(h.star,s.rarity,i.rarity) rarity,p.name pool_name,
    CASE e.reward_type WHEN 'HERO' THEN h.enabled WHEN 'SKILL_BOOK' THEN s.enabled
      ELSE (i.enabled=1 AND i.deleted_at IS NULL AND i.item_type IN ('EQUIPMENT','TREASURE','CONSUMABLE','MATERIAL')) END reward_enabled
    FROM tavern_pool_entries e JOIN tavern_pools p ON p.id=e.pool_id
    LEFT JOIN hero_definitions h ON h.id=e.hero_definition_id LEFT JOIN skill_definitions s ON s.id=e.skill_definition_id
    LEFT JOIN item_definitions i ON i.id=e.item_definition_id
    ORDER BY e.pool_id,rarity DESC,e.id`)
  return rows
}

export async function savePoolEntry(input: { poolId:number; rewardType:RewardType; heroDefinitionId?:number|null; skillDefinitionId?:number|null; itemDefinitionId?:number|null; weight:number; enabled:boolean }, id?:number): Promise<number> {
  return inTransaction(async connection => {
    const expectedId={HERO:input.heroDefinitionId,SKILL_BOOK:input.skillDefinitionId,ITEM:input.itemDefinitionId}[input.rewardType]
    if(!expectedId||[input.heroDefinitionId,input.skillDefinitionId,input.itemDefinitionId].filter(Boolean).length!==1)throw Error('卡池条目类型与奖励不匹配')
    const [pools]=await connection.query<RowDataPacket[]>('SELECT * FROM tavern_pools WHERE id=? FOR UPDATE',[input.poolId])
    if(!pools[0])throw Error('酒馆卡池不存在')
    const accepted:Record<string,string[]>= {HERO:['HERO'],SKILL:['SKILL_BOOK'],ITEM:['ITEM'],MIXED:['HERO','SKILL_BOOK','ITEM']}
    if(!accepted[pools[0].pool_type]?.includes(input.rewardType))throw Error('奖励类型不适用于此卡池')
    if(input.rewardType==='ITEM'){
      const [items]=await connection.query<RowDataPacket[]>('SELECT * FROM item_definitions WHERE id=?',[input.itemDefinitionId])
      if(!items[0]||(input.enabled&&!eligibleTreasureItem(mapItem(items[0]))))throw Error('请选择已启用的装备、宝物或道具')
    }
    const heroId:number|null=input.rewardType==='HERO'?(input.heroDefinitionId??null):null
    const skillId:number|null=input.rewardType==='SKILL_BOOK'?(input.skillDefinitionId??null):null
    const itemId:number|null=input.rewardType==='ITEM'?(input.itemDefinitionId??null):null
    const [existing]=await connection.query<RowDataPacket[]>('SELECT id FROM tavern_pool_entries WHERE pool_id=? AND reward_type=? AND (hero_definition_id=? OR skill_definition_id=? OR item_definition_id=?)',[input.poolId,input.rewardType,heroId,skillId,itemId])
    if(existing.some(e=>Number(e.id)!==id))throw Error('该奖励已在卡池中，请直接修改原有权重')
    let entityId=id
    if(id){
      const [result]=await connection.execute<ResultSetHeader>('UPDATE tavern_pool_entries SET pool_id=?,reward_type=?,hero_definition_id=?,skill_definition_id=?,item_definition_id=?,weight=?,enabled=? WHERE id=?',[input.poolId,input.rewardType,heroId,skillId,itemId,input.weight,input.enabled,id])
      if(!result.affectedRows)throw Error('卡池条目不存在')
    }else { const [result]=await connection.execute<ResultSetHeader>('INSERT INTO tavern_pool_entries (pool_id,reward_type,hero_definition_id,skill_definition_id,item_definition_id,weight,enabled) VALUES (?,?,?,?,?,?,?)',[input.poolId,input.rewardType,heroId,skillId,itemId,input.weight,input.enabled]); entityId=result.insertId }
    await connection.execute('UPDATE tavern_pools SET version=version+1 WHERE id=?',[input.poolId])
    await connection.execute('INSERT INTO admin_audit_logs (action,entity_type,entity_id,after_json) VALUES (?,?,?,?)',[id?'UPDATE':'CREATE','TAVERN_POOL_ENTRY',String(entityId),JSON.stringify(input)])
    return entityId!
  })
}

export async function savePoolSettings(id:number,input:Pick<TavernPool,'refreshCost'|'candidateCount'|'selectLimit'>){
  if(input.selectLimit>input.candidateCount)throw Error('可选数量不能超过候选数量')
  await inTransaction(async c=>{
    const [r]=await c.execute<ResultSetHeader>('UPDATE tavern_pools SET refresh_cost=?,candidate_count=?,select_limit=?,version=version+1 WHERE id=?',[input.refreshCost,input.candidateCount,input.selectLimit,id])
    if(!r.affectedRows)throw Error('酒馆卡池不存在')
    await c.execute("INSERT INTO admin_audit_logs (action,entity_type,entity_id,after_json) VALUES ('UPDATE','TAVERN_POOL',?,?)",[String(id),JSON.stringify(input)])
  })
}
