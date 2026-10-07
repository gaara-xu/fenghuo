import type { PoolConnection,ResultSetHeader,RowDataPacket } from 'mysql2/promise'
import type { MapNode,WorldStatus } from '../shared/contracts.js'
import { config } from './config.js'
import { getPool,inTransaction } from './db.js'
import { gameNow,type ClockRow } from './domain/clock.js'
import { heroPower } from './domain/battle.js'
import { mapSkillRow } from './game-service.js'
import { learnedSkill,unlockedSkillSlots } from './domain/skills.js'
import {getGrowthRules,statsFromRow} from './growth-service.js'
import {isWorldBoss,worldBossDefenses,worldBossArmy,worldBossExpired,worldBossAfterBattle} from '../shared/world-boss.js'
import {maintainWorldBosses} from './world-boss-service.js'
import {getEquipment,getInventory,awardDrops} from './item-service.js'
import {equipmentBonuses,equipmentFlatBonuses} from '../shared/items.js'
import {lockReportWriter,pruneReports,maintainReports,mapReport,incomingReports,pruneFinishedMarches} from './report-service.js'
import {carriedRewards} from './domain/rewards.js'
import { travelSeconds } from './domain/travel.js'
import {marchRoute,routeDistance} from '../shared/map-routes.js'
import {MAX_OUTPOST_LEVEL,outpostDefense,targetAfterAttack} from '../shared/world-rules.js'

import {armyStats,npcArmy,type ArmyStack,type TroopSelection} from '../shared/military.js'
import {armyBattleOutcome} from './domain/army-battle.js'
import {enqueueMilitary,listMilitary,reserveTroops,returnTroops,readArmy,processMilitaryWork,settleMilitary,settleMilitaryBeforeAction} from './military-service.js'
import {nextMilitaryEvent} from './upkeep-service.js'
import {randomUUID} from 'node:crypto'
import {readFarmConfig,farmReturnProgress} from '../shared/auto-farm.js'
import {listIncomingRaids,settleIncomingRaid} from './incoming-raid-service.js'

const PLAYER_ID=config.PLAYER_ID
const rewardColumns=new Set(['food','wood','stone','iron','gold','coupon'])
function json(value:unknown):Record<string,number>{ if(!value)return {};return typeof value==='string'?JSON.parse(value):value as Record<string,number> }

async function currentGameTime(connection:PoolConnection):Promise<Date>{const [rows]=await connection.query<RowDataPacket[]>('SELECT * FROM game_clock WHERE id=1');if(!rows[0])throw new Error('游戏时钟未初始化');return gameNow(rows[0] as ClockRow)}
async function assertHeroFree(connection:PoolConnection,heroId:number):Promise<void>{
  const [hero]=await connection.query<RowDataPacket[]>('SELECT id FROM owned_heroes WHERE id=? AND player_id=? AND retired_at IS NULL FOR UPDATE',[heroId,PLAYER_ID]);if(!hero[0])throw new Error('英雄不存在')
  const [busy]=await connection.query<RowDataPacket[]>(`SELECT id FROM march_orders WHERE owned_hero_id=? AND status IN ('MARCHING','FIGHTING','RETURNING') UNION ALL SELECT id FROM auto_farm_jobs WHERE owned_hero_id=? AND status='ACTIVE' LIMIT 1`,[heroId,heroId])
  if(busy[0])throw new Error('该英雄正在执行其他任务')
}

export async function getWorldStatus():Promise<WorldStatus>{
  const pool=getPool()
  const [[heroes],[marches],[jobs],[reports],[defenses],[heroSkills],[books]]=await Promise.all([
    pool.query<RowDataPacket[]>(`SELECT o.id,o.hero_definition_id,o.experience,h.portrait_key,COALESCE(o.custom_name,h.name) name,h.name original_name,h.star,h.quality_tier,h.speed,h.load_capacity,o.level,o.talent_grade,o.stamina,h.melee_attack,h.ranged_attack,h.melee_defense,h.ranged_defense FROM owned_heroes o JOIN hero_definitions h ON h.id=o.hero_definition_id WHERE o.player_id=? AND o.retired_at IS NULL ORDER BY h.star DESC,o.id`,[PLAYER_ID]),
    pool.query<RowDataPacket[]>(`SELECT m.id,m.owned_hero_id,m.auto_farm_job_id,m.depart_game_at,m.return_game_at,m.troop_config,n.x,n.y,h.portrait_key,n.name target_name,COALESCE(o.custom_name,h.name) hero_name,m.status,m.arrive_game_at,JSON_UNQUOTE(JSON_EXTRACT(m.result_config,'$.result')) result FROM march_orders m JOIN map_nodes n ON n.id=m.map_node_id LEFT JOIN owned_heroes o ON o.id=m.owned_hero_id LEFT JOIN hero_definitions h ON h.id=o.hero_definition_id WHERE m.player_id=? AND m.status IN ('MARCHING','FIGHTING','RETURNING') ORDER BY m.id DESC LIMIT 100`,[PLAYER_ID]),
    pool.query<RowDataPacket[]>(`SELECT j.*,COALESCE(o.custom_name,h.name) hero_name FROM auto_farm_jobs j LEFT JOIN owned_heroes o ON o.id=j.owned_hero_id LEFT JOIN hero_definitions h ON h.id=o.hero_definition_id WHERE j.player_id=? ORDER BY (j.status='ACTIVE') DESC,j.id DESC LIMIT 100`,[PLAYER_ID]),
    pool.query<RowDataPacket[]>("SELECT * FROM battle_reports WHERE player_id=? AND direction='OUTGOING' ORDER BY id DESC LIMIT 50",[PLAYER_ID]),
    pool.query<RowDataPacket[]>('SELECT * FROM city_defenses WHERE player_id=? ORDER BY id',[PLAYER_ID]),
    pool.query<RowDataPacket[]>(`SELECT s.*,k.owned_hero_id,k.slot_no,k.skill_level,l.effect_value,next.upgrade_exp,next.same_book_cost,next.effect_value next_effect_value FROM owned_hero_skills k JOIN owned_heroes o ON o.id=k.owned_hero_id JOIN skill_definitions s ON s.id=k.skill_definition_id LEFT JOIN skill_levels l ON l.skill_definition_id=s.id AND l.level=k.skill_level LEFT JOIN skill_levels next ON next.skill_definition_id=s.id AND next.level=k.skill_level+1 WHERE o.player_id=? AND s.enabled=1`,[PLAYER_ID]),
    pool.query<RowDataPacket[]>('SELECT b.skill_definition_id,b.quantity FROM player_skill_books b JOIN skill_definitions s ON s.id=b.skill_definition_id AND s.enabled=1 WHERE b.player_id=? AND b.quantity>0',[PLAYER_ID]),
  ])
  const [growth,equipment,inventory,incoming,incomingArmies]=await Promise.all([getGrowthRules(),getEquipment(),getInventory(),incomingReports(),listIncomingRaids()])
  return {
    inventory,incoming,incomingArmies,
    ownedHeroes:heroes.map(h=>{
      const id=Number(h.id),equipped=equipment.filter(e=>e.heroId===id),bonus=equipmentBonuses(equipped),stats=statsFromRow(h,growth,Number(h.level),bonus,equipmentFlatBonuses(equipped))
      return {id,heroDefinitionId:Number(h.hero_definition_id),portraitKey:h.portrait_key,experience:Number(h.experience),unlockedSlots:unlockedSkillSlots(Number(h.star),Number(h.level)),skills:heroSkills.filter(s=>Number(s.owned_hero_id)===id).map(mapLearnedRow),name:h.name,originalName:h.original_name,star:Number(h.star),qualityTier:Number(h.quality_tier),level:Number(h.level),talentGrade:h.talent_grade,stamina:Number(h.stamina),stats,nextStats:Number(h.level)<20?statsFromRow(h,growth,Number(h.level)+1,bonus,equipmentFlatBonuses(equipped)):null,upgradeExp:Number(h.level)*100,equipment:equipped,busy:marches.some(m=>Number(m.owned_hero_id)===id&&['MARCHING','FIGHTING','RETURNING'].includes(m.status))||jobs.some(j=>Number(j.owned_hero_id)===id&&j.status==='ACTIVE'),power:heroPower({...stats,level:Number(h.level)})}
    }),
    marches:marches.map(m=>({id:Number(m.id),heroId:Number(m.owned_hero_id),portraitKey:m.portrait_key,targetX:Number(m.x),targetY:Number(m.y),departGameAt:new Date(m.depart_game_at).toISOString(),returnGameAt:m.return_game_at?new Date(m.return_game_at).toISOString():undefined,targetName:m.target_name,heroName:m.hero_name??'部队',troops:readArmy(m.troop_config).map(s=>({name:s.name,quantity:s.quantity})),status:m.status,arriveGameAt:new Date(m.arrive_game_at).toISOString(),result:m.result??undefined})),
    autoFarmJobs:jobs.map(j=>{const cfg=readFarmConfig(j.troop_config),active=marches.find(m=>Number(m.auto_farm_job_id)===Number(j.id));return {id:Number(j.id),heroId:Number(j.owned_hero_id),heroName:j.hero_name??'部队',nodeType:j.node_type,minLevel:Number(j.min_level),maxLevel:Number(j.max_level),runsRemaining:j.runs_remaining===null?null:Number(j.runs_remaining)+(active&&(typeof active.troop_config==='string'?JSON.parse(active.troop_config):active.troop_config)?.autoFarmCycleVersion!==2?1:0),status:j.status,nextRunGameAt:new Date(j.next_run_game_at).toISOString(),lastError:j.last_error??undefined,targetName:cfg.targetName,totalRuns:cfg.totalRuns,completedRuns:cfg.completedRuns,phase:active?.status??'WAITING',roundTripSeconds:active?Math.round((new Date(active.return_game_at).getTime()-new Date(active.depart_game_at).getTime())/1000):undefined}}),
    reports:reports.map(mapReport),
    skillBooks:books.map(b=>({skillDefinitionId:Number(b.skill_definition_id),quantity:Number(b.quantity)})),
    defenses:defenses.map(d=>({id:Number(d.id),defenseType:d.defense_type,level:Number(d.level),quantity:Number(d.quantity),damagedQuantity:Number(d.damaged_quantity),unitCost:defenseCost(d.defense_type)})),
  }
}

function mapLearnedRow(s:RowDataPacket){const result=learnedSkill(mapSkillRow(s),Number(s.skill_level),Number(s.slot_no));if(s.effect_value!=null)result.effectValue=Number(s.effect_value);if(s.upgrade_exp!=null)result.upgradeExp=Number(s.upgrade_exp);if(s.same_book_cost!=null)result.sameBookCost=Number(s.same_book_cost);if(s.next_effect_value!=null)result.nextEffectValue=Number(s.next_effect_value);return result}

const defenseCosts:Record<string,{wood:number;stone:number;iron:number}>={城墙:{wood:80,stone:160,iron:25},箭塔:{wood:140,stone:90,iron:60},陷阱:{wood:100,stone:40,iron:80}}
function defenseCost(type:string){return defenseCosts[type]??{wood:0,stone:0,iron:0}}
export async function buildDefense(type:string,quantity:number,requestId:string=randomUUID()){
  const d=(await listMilitary()).find(d=>d.kind==='DEFENSE'&&(d.code===type||d.name===type));if(!d)throw Error('未知城防类型')
  return enqueueMilitary(d.code,quantity,requestId)
}
async function heroArmy(c:PoolConnection,heroId:number|null):Promise<{army:ArmyStack[];skills:ReturnType<typeof mapLearnedRow>[];name:string}>{
  if(!heroId)return {army:[],skills:[],name:'部队'}
  const [rows]=await c.query<RowDataPacket[]>('SELECT h.*,o.level,o.talent_grade,COALESCE(o.custom_name,h.name) hero_name FROM owned_heroes o JOIN hero_definitions h ON h.id=o.hero_definition_id WHERE o.id=? AND o.player_id=? AND o.retired_at IS NULL',[heroId,PLAYER_ID])
  const h=rows[0];if(!h)throw Error('英雄不存在')
  const equipped=(await getEquipment(c)).filter(e=>e.heroId===heroId),stats=statsFromRow(h,await getGrowthRules(c),Number(h.level),equipmentBonuses(equipped),equipmentFlatBonuses(equipped))
  const [skills]=await c.query<RowDataPacket[]>(`SELECT s.*,k.slot_no,k.skill_level,l.effect_value FROM owned_hero_skills k JOIN skill_definitions s ON s.id=k.skill_definition_id LEFT JOIN skill_levels l ON l.skill_definition_id=s.id AND l.level=k.skill_level WHERE k.owned_hero_id=? AND s.enabled=1`,[heroId])
  return {army:[{code:'hero_'+heroId,name:h.hero_name,kind:'HERO',quantity:1,stats}],skills:skills.map(mapLearnedRow),name:h.hero_name}
}
async function launchArmy(c:PoolConnection,heroId:number|null,nodeId:number,troops:ArmyStack[],now:Date,requestId?:string,jobId?:number,requested?:TroopSelection[]){
  await maintainWorldBosses(c,now)
  const [nodes]=await c.query<RowDataPacket[]>("SELECT * FROM map_nodes WHERE id=? AND status='ACTIVE' AND level>0 FOR UPDATE",[nodeId]),node=nodes[0];if(!node)throw Error('目标不存在或暂不可攻击')
  if(isWorldBoss(node.garrison_config)&&worldBossExpired(node.garrison_config,now))throw Error('世界首领已消失')
  const hero=await heroArmy(c,heroId),stats=armyStats([...hero.army,...troops])
  if(stats.speed<=0||!heroId&&!troops.some(s=>s.quantity>0))throw Error('请选择英雄或至少一种士兵')
  const distance=routeDistance(marchRoute({x:Number(node.x),y:Number(node.y)})),arrive=new Date(now.getTime()+Math.ceil(travelSeconds(distance,stats.speed))*1000),back=new Date(now.getTime()+2*(arrive.getTime()-now.getTime()))
  const [r]=await c.execute<ResultSetHeader>(`INSERT INTO march_orders (player_id,map_node_id,owned_hero_id,order_type,status,depart_game_at,arrive_game_at,return_game_at,troop_config,client_action_id,auto_farm_job_id) VALUES (?,?,?,?,'MARCHING',?,?,?,?,?,?)`,[PLAYER_ID,nodeId,heroId,jobId?'AUTO_FARM':'ATTACK',now,arrive,back,JSON.stringify({units:troops,requested,...(jobId?{autoFarmCycleVersion:2}:{})}),requestId??null,jobId??null])
  return {id:r.insertId,arriveGameAt:arrive.toISOString(),returnGameAt:back.toISOString()}
}
export async function startMarch(heroId:number|null,nodeId:number,selection:TroopSelection[]=[],requestId?:string){
  return inTransaction(async c=>{
    await lockReportWriter(c)
    if(requestId){const [done]=await c.query<RowDataPacket[]>('SELECT * FROM march_orders WHERE player_id=? AND client_action_id=?',[PLAYER_ID,requestId]);if(done[0]){const m=done[0],snap=typeof m.troop_config==='string'?JSON.parse(m.troop_config):m.troop_config;if(Number(m.map_node_id)!==nodeId||(m.owned_hero_id?Number(m.owned_hero_id):null)!==heroId||JSON.stringify(snap?.requested??[])!==JSON.stringify(selection))throw Error('重复请求标识不匹配');return {id:Number(m.id),arriveGameAt:new Date(m.arrive_game_at).toISOString(),returnGameAt:new Date(m.return_game_at).toISOString()}}}
    if(!heroId&&!selection.length)throw Error('请选择英雄或至少一种士兵')
    const now=await currentGameTime(c)
    await settleMilitaryBeforeAction(c,now)
    if(heroId)await assertHeroFree(c,heroId)
    const troops=await reserveTroops(c,selection)
    return launchArmy(c,heroId,nodeId,troops,now,requestId,undefined,selection)
  })
}
export async function startAutoFarm(heroId:number|null,nodeType:MapNode['nodeType'],minLevel:number,maxLevel:number,runs:number,selection:TroopSelection[]=[],nodeId?:number):Promise<{id:number}>{
  if(nodeType==='OUTPOST'&&(minLevel>MAX_OUTPOST_LEVEL||maxLevel>MAX_OUTPOST_LEVEL))throw Error('据点等级范围为1至20级')
  return inTransaction(async c=>{
    await lockReportWriter(c)
    if(!heroId&&!selection.length)throw Error('请选择英雄或至少一种士兵')
    const now=await currentGameTime(c)
    await settleMilitaryBeforeAction(c,now)
    if(heroId)await assertHeroFree(c,heroId)
    let targetName:string|undefined
    if(nodeId){const [nodes]=await c.query<RowDataPacket[]>("SELECT name,garrison_config FROM map_nodes WHERE id=? AND node_type=? AND status='ACTIVE' AND level>0 FOR UPDATE",[nodeId,nodeType]);if(!nodes[0])throw Error('目标不存在或暂不可攻击');if(isWorldBoss(nodes[0].garrison_config))throw Error('世界首领只可单次挑战，不能自动刷野');targetName=nodes[0].name}
    const troops=await reserveTroops(c,selection)
    const [r]=await c.execute<ResultSetHeader>(`INSERT INTO auto_farm_jobs (player_id,owned_hero_id,node_type,min_level,max_level,runs_remaining,status,next_run_game_at,troop_config) VALUES (?,?,?,?,?,?,'ACTIVE',?,?)`,[PLAYER_ID,heroId,nodeType,minLevel,maxLevel,runs,now,JSON.stringify({units:troops,cycleVersion:2,totalRuns:runs,completedRuns:0,targetNodeId:nodeId,targetName})])
    return {id:r.insertId}
  })
}
export async function pauseAutoFarm(id:number):Promise<void>{await inTransaction(async c=>{
  await lockReportWriter(c)
  const [jobs]=await c.query<RowDataPacket[]>("SELECT * FROM auto_farm_jobs WHERE id=? AND player_id=? AND status='ACTIVE' FOR UPDATE",[id,PLAYER_ID]);const j=jobs[0];if(!j)return
  const [marches]=await c.query<RowDataPacket[]>("SELECT id FROM march_orders WHERE auto_farm_job_id=? AND status IN ('MARCHING','RETURNING')",[id])
  if(!marches.length){await returnTroops(c,readArmy(j.troop_config));await c.execute('UPDATE auto_farm_jobs SET troop_config=? WHERE id=?',[JSON.stringify({...readFarmConfig(j.troop_config),units:[]}),id])}
  await c.execute("UPDATE auto_farm_jobs SET status='PAUSED',last_error=? WHERE id=?",[marches.length?'已停止后续出征，当前部队正常战斗并返城':'已暂停，留城部队已归还',id])
})}

async function award(connection:PoolConnection,rewards:Record<string,number>):Promise<void>{
  for(const [currency,amount] of Object.entries(rewards)){if(rewardColumns.has(currency)&&Number.isFinite(amount)&&amount>0)await connection.query(`UPDATE resource_wallet SET \`${currency}\`=\`${currency}\`+? WHERE player_id=?`,[Math.floor(amount),PLAYER_ID])}
}

async function encounter(c:PoolConnection,heroId:number|null,nodeId:number,seed:string,troops:ArmyStack[]=[],arrivedAt:Date){
  const [rows]=await c.query<RowDataPacket[]>('SELECT * FROM map_nodes WHERE id=? FOR UPDATE',[nodeId]),row=rows[0]
  if(!row||row.status!=='ACTIVE'||Number(row.level)<=0)return null
  const boss=isWorldBoss(row.garrison_config)
  if(boss&&worldBossExpired(row.garrison_config,arrivedAt))return null
  const hero=await heroArmy(c,heroId),enemyPower=boss?Math.max(...Object.values(worldBossDefenses(row.garrison_config))):row.node_type==='OUTPOST'?outpostDefense(Number(row.level)):Number(json(row.garrison_config).power??row.level*120)
  const enemy=boss?worldBossArmy(row.garrison_config):npcArmy(enemyPower,row.defense_bias,['SYSTEM_CITY','RANDOM_CITY'].includes(row.node_type))
  const outcome=armyBattleOutcome([...hero.army,...troops],enemy,seed,{attackerSkills:hero.skills,nodeType:row.node_type})
  const victory=outcome.victory,rewards=victory?carriedRewards(json(row.reward_config),outcome.loadCapacity):{}
  const experience=heroId?Math.round((victory?Number(row.level)*100:Math.max(10,Number(row.level)*20))*(1+outcome.experienceBonus)):0
  const loot=victory?await awardDrops(c,row.node_type,Number(row.level),seed+':loot',boss):[]
  if(heroId)await c.execute('UPDATE owned_heroes SET experience=experience+? WHERE id=? AND player_id=?',[experience,heroId,PLAYER_ID])
  const target=boss?worldBossAfterBattle(victory,Number(row.level),row.garrison_config):targetAfterAttack(row.node_type,Number(row.level),enemyPower)
  await c.execute('UPDATE map_nodes SET level=?,status=?,garrison_config=? WHERE id=?',[target.level,target.status,JSON.stringify({...json(row.garrison_config),power:target.power}),nodeId])
  return {result:victory?'VICTORY':'DEFEAT',rewards,survivors:outcome.survivors,details:{...outcome,worldBoss:boss,nodeId,heroId,heroName:hero.name,loot,experience,targetLevelBefore:Number(row.level),targetLevelAfter:target.level,...(row.node_type==='OUTPOST'?{outpostLevelBefore:Number(row.level),outpostLevelAfter:target.level}:{})},title:`${hero.name} ${victory?'攻克':'败于'} ${row.name}（${row.level}级）`}
}
async function finishArmyReturn(c:PoolConnection,m:RowDataPacket,units:ArmyStack[],back:Date){
  if(m.auto_farm_job_id){
    const [jobs]=await c.query<RowDataPacket[]>('SELECT * FROM auto_farm_jobs WHERE id=? AND player_id=? FOR UPDATE',[m.auto_farm_job_id,PLAYER_ID]),j=jobs[0]
    const snapshot=typeof m.troop_config==='string'?JSON.parse(m.troop_config):m.troop_config
    const progress=j?farmReturnProgress(j.troop_config,j.runs_remaining===null?null:Number(j.runs_remaining),snapshot?.autoFarmCycleVersion===2):null
    if(progress&&!progress.config.targetNodeId){
      const [targets]=await c.query<RowDataPacket[]>('SELECT name FROM map_nodes WHERE id=?',[m.map_node_id])
      progress.config.targetNodeId=Number(m.map_node_id);progress.config.targetName=targets[0]?.name
    }
    if(j?.status==='ACTIVE'&&progress&&(progress.remaining===null||progress.remaining>0)&&(m.owned_hero_id||units.some(s=>s.quantity>0))){
      await c.execute('UPDATE auto_farm_jobs SET troop_config=?,runs_remaining=?,next_run_game_at=? WHERE id=?',[JSON.stringify({...progress.config,units}),progress.remaining,back,j.id])
    }else{
      await returnTroops(c,units)
      if(j&&progress)await c.execute("UPDATE auto_farm_jobs SET status=IF(status='ACTIVE','COMPLETED',status),troop_config=?,runs_remaining=?,next_run_game_at=?,last_error=? WHERE id=?",[JSON.stringify({...progress.config,units:[]}),progress.remaining,back,!m.owned_hero_id&&!units.some(s=>s.quantity>0)?'部队已全部阵亡':j.last_error,j.id])
    }
  }else await returnTroops(c,units)
  await c.execute("UPDATE march_orders SET status='COMPLETED' WHERE id=?",[m.id])
}
export async function processMarch(id:number,now:Date):Promise<void>{await inTransaction(async c=>{
  await lockReportWriter(c)
  await processMarchInTransaction(c,id,now)
  await maintainWorldBosses(c,now)
})}
async function processMarchInTransaction(c:PoolConnection,id:number,now:Date):Promise<void>{
  const [rows]=await c.query<RowDataPacket[]>("SELECT * FROM march_orders WHERE id=? AND player_id=? AND status IN ('MARCHING','RETURNING') FOR UPDATE",[id,PLAYER_ID]),m=rows[0];if(!m)return
  const back=new Date(m.return_game_at??new Date(m.arrive_game_at).getTime()*2-new Date(m.depart_game_at).getTime())
  let units=readArmy(m.troop_config)
  if(m.status==='RETURNING'){if(back<=now){await settleMilitary(c,back);await finishArmyReturn(c,m,units,back);await pruneFinishedMarches(c)}return}
  if(new Date(m.arrive_game_at)>now)return
  await settleMilitary(c,new Date(m.arrive_game_at))
  const result=await encounter(c,m.owned_hero_id?Number(m.owned_hero_id):null,Number(m.map_node_id),`march:${id}`,units,new Date(m.arrive_game_at))
  if(result){units=result.survivors;await award(c,result.rewards);await c.execute('INSERT INTO battle_reports (player_id,march_order_id,title,result,battle_config,reward_config,occurred_game_at) VALUES (?,?,?,?,?,?,?)',[PLAYER_ID,id,result.title,result.result,JSON.stringify({...result.details,...(m.auto_farm_job_id?{autoFarmJobId:Number(m.auto_farm_job_id)}:{})}),JSON.stringify(result.rewards),m.arrive_game_at]);await pruneReports(c)}
  const snapshot=typeof m.troop_config==='string'?JSON.parse(m.troop_config):m.troop_config??{}
  await c.execute("UPDATE march_orders SET status='RETURNING',return_game_at=?,troop_config=?,result_config=? WHERE id=?",[back,JSON.stringify({...snapshot,units}),JSON.stringify({result:result?.result??'TARGET_GONE',rewards:result?.rewards??{}}),id])
  if(back<=now){await settleMilitary(c,back);await finishArmyReturn(c,m,units,back)}
  await pruneFinishedMarches(c)
}

export async function processFarm(id:number,now:Date):Promise<void>{await inTransaction(async connection=>{
  await lockReportWriter(connection)
  await processFarmInTransaction(connection,id,now)
})}
async function processFarmInTransaction(connection:PoolConnection,id:number,now:Date):Promise<void>{
  const [jobs]=await connection.query<RowDataPacket[]>("SELECT * FROM auto_farm_jobs WHERE id=? AND player_id=? AND status='ACTIVE' AND next_run_game_at<=? FOR UPDATE",[id,PLAYER_ID,now]);const job=jobs[0];if(!job)return
  const [active]=await connection.query<RowDataPacket[]>("SELECT id FROM march_orders WHERE auto_farm_job_id=? AND status IN ('MARCHING','FIGHTING','RETURNING')",[id]);if(active.length)return
  await settleMilitary(connection,new Date(job.next_run_game_at))
  const cfg=readFarmConfig(job.troop_config),remaining=job.runs_remaining===null?null:Number(job.runs_remaining)
  const progress={...cfg,cycleVersion:2 as const,totalRuns:cfg.totalRuns??remaining,completedRuns:cfg.completedRuns??0}
  // Once selected, keep attacking this exact target even as its level falls outside
  // the original search range. Old jobs without a target are pinned on first launch.
  const [targets]=cfg.targetNodeId
    ?await connection.query<RowDataPacket[]>("SELECT id,name FROM map_nodes WHERE id=? AND node_type=? AND level>0 AND status='ACTIVE' AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(garrison_config,'$.worldBoss')),'false')<>'true' FOR UPDATE",[cfg.targetNodeId,job.node_type])
    :await connection.query<RowDataPacket[]>("SELECT id,name FROM map_nodes WHERE node_type=? AND level BETWEEN ? AND ? AND level>0 AND status='ACTIVE' AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(garrison_config,'$.worldBoss')),'false')<>'true' ORDER BY level,id LIMIT 1 FOR UPDATE",[job.node_type,job.min_level,Math.min(Number(job.max_level),job.node_type==='OUTPOST'?20:100)])
  if(!targets.length||remaining!==null&&remaining<=0||!job.owned_hero_id&&!cfg.units.some(s=>s.quantity>0)){
    const reason=remaining===0?null:!targets.length?(cfg.targetNodeId?'目标已耗尽或消失':'范围内已无可攻击目标'):'部队已全部阵亡'
    await returnTroops(connection,cfg.units)
    await connection.execute("UPDATE auto_farm_jobs SET status='COMPLETED',troop_config=?,last_error=? WHERE id=?",[JSON.stringify({...progress,units:[]}),reason,id]);return
  }
  const target=targets[0],march=await launchArmy(connection,job.owned_hero_id?Number(job.owned_hero_id):null,Number(target.id),cfg.units,new Date(job.next_run_game_at),undefined,id)
  // A run is consumed only after its actual return, never on departure or a timer.
  await connection.execute('UPDATE auto_farm_jobs SET troop_config=?,next_run_game_at=?,last_error=NULL WHERE id=?',[JSON.stringify({...progress,units:[],targetNodeId:Number(target.id),targetName:target.name}),new Date(march.returnGameAt),id])
}

// The caller holds lockReportWriter in its transaction. Reuse that connection:
// opening another transaction here would deadlock against the player's own lock.
export async function settleDueWorldEvents(c:PoolConnection,now:Date):Promise<void>{
  for(let i=0;i<200;i++){
    const event=await nextMilitaryEvent(c,now)
    if(!event){await maintainWorldBosses(c,now);return}
    if(event.kind==='MARCH')await processMarchInTransaction(c,event.id,event.at)
    else if(event.kind==='INCOMING')await settleIncomingRaid(c,event.id,event.at)
    else await processFarmInTransaction(c,event.id,event.at)
  }
  // Large offline backlogs are still drained by the bounded background worker.
  // Never bill upkeep past unresolved casualties or duplicate reserved troops.
  if(await nextMilitaryEvent(c,now))throw Error('离线积压较多，正在补结算，请稍后重试')
}

let processing=false
export async function processDueWorldWork():Promise<void>{
  if(processing)return;processing=true
  try{
    const pool=getPool(),[clocks]=await pool.query<RowDataPacket[]>('SELECT * FROM game_clock WHERE id=1');if(!clocks[0])return;const now=gameNow(clocks[0] as ClockRow)
    // Resolve departures, battles and returns chronologically, including offline catch-up.
    // Bound each tick; upkeep never jumps past an unresolved event and bills dead troops.
    for(let i=0;i<200;i++){const event=await nextMilitaryEvent(pool,now);if(!event)break;if(event.kind==='MARCH')await processMarch(event.id,event.at);else if(event.kind==='INCOMING')await inTransaction(async c=>{await lockReportWriter(c);await settleIncomingRaid(c,event.id,event.at)});else await processFarm(event.id,event.at)}
    await processMilitaryWork(now)
    await inTransaction(async c=>{await lockReportWriter(c);await maintainWorldBosses(c,now)})
    await maintainReports()
  }finally{processing=false}
}
