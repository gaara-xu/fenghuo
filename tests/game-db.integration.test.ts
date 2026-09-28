import { beforeAll,afterAll,beforeEach,afterEach,describe,it,expect,vi } from 'vitest'
import mysql from 'mysql2/promise'
import { config } from '../server/config'
const db=vi.hoisted(()=>({c:null as any}))
vi.mock('../server/db.js',()=>({
  getPool:()=>db.c,
  assertDatabaseScope:async()=>{const [r]=await db.c.query('SELECT DATABASE() db');if(r[0].db!=='fenghuo')throw Error('数据库越界')},
  inTransaction:async(fn:any)=>{await db.c.query('SAVEPOINT test_service');try{return await fn(db.c)}catch(e){await db.c.query('ROLLBACK TO SAVEPOINT test_service');throw e}},
}))
import { learnHeroSkill,upgradeHeroSkill,trainHero } from '../server/hero-service'
import { getWorldStatus,startMarch,processMarch,startAutoFarm,processFarm,pauseAutoFarm,settleDueWorldEvents,processDueWorldWork } from '../server/world-service'
import {readFarmConfig} from '../shared/auto-farm'
import {travelSeconds} from '../server/domain/travel'
import {getMilitaryState,enqueueMilitary,settleMilitary,forceDelta,readArmy,saveMilitary,listMilitary} from '../server/military-service'
import {militaryDefaults,type MilitaryDefinition} from '../shared/military'
import {registerMilitary} from '../server/routes/military'
import {registerApi} from '../server/routes/api'
import {grantResources,resourceAdminState} from '../server/resource-service'
import {registerResources} from '../server/routes/resources'
import {emptyResources} from '../shared/resources'
import {getUpkeep,settleUpkeep} from '../server/upkeep-service'
import { refreshTavern,recruitCandidate,listHeroes,listSkills,listPoolEntries,savePoolEntry,savePoolSettings,getTavernRecording,setTavernRecording } from '../server/game-service'
import {tavernMemory} from '../server/tavern-memory'
import {equipItem,useItem,retireHero,awardDrops,listDropPools} from '../server/item-service'
import {applyWildGemUpdate,wildGemUpdateVersion} from '../scripts/wild-gem-update-data'
import {applyOutpostGemRateUpdate,outpostGemRateVersion,outpostGemPoolCodes,applyOutpostGemQuantityUpdate,outpostGemQuantityVersion} from '../scripts/outpost-gem-rate-data'
import {SeededRandom} from '../server/domain/random'
import {renameHero} from '../server/hero-service'
import {pruneReports,clearReports,incomingReports,pruneFinishedMarches} from '../server/report-service'
import {refreshMap,getBootstrap} from '../server/game-service'
import {readFileSync} from 'node:fs'
import { randomUUID } from 'node:crypto'
import {runScheduledTask,listScheduledTasks} from '../server/scheduled-task-service'
import Fastify from 'fastify'
import {registerScheduledTasks} from '../server/routes/scheduled-tasks'
import {scheduledTasks,taskPath} from '../shared/scheduled-tasks'
import {forgeItem,forgeEquipment,saveForgeRules} from '../server/forge-service'
import {combineGems,listGems} from '../server/gem-service'
import {applyHeroUpdate} from '../scripts/hero-update-data'
import {getInventory} from '../server/item-service'
import {defaultForgeRules} from '../shared/forge'
import {salvageEquipment} from '../server/salvage-service'
import {applyEquipmentCalibration,equipmentCalibrationVersion} from '../scripts/equipment-calibration-data'
import {applyEquipmentSetUpdate,equipmentSetUpdateVersion} from '../scripts/equipment-set-update-data'
import {equipmentSetStates,equipmentBonuses,equipmentFlatBonuses} from '../shared/items'
import {statsFromRow,getGrowthRules} from '../server/growth-service'
import {isWorldBoss,WORLD_BOSS_LEVEL,WORLD_BOSS_POWER,defaultWorldBossRules} from '../shared/world-boss'
import {getWorldBossRules,saveWorldBossRules,maintainWorldBosses} from '../server/world-boss-service'
import {applyWorldBossUpdate,worldBossUpdateVersion} from '../scripts/world-boss-update-data'
import {mapClearance} from '../shared/map-placement'
import {cleanupObsoleteItems} from '../scripts/obsolete-item-cleanup-data'
import {obsoleteItemCodes} from '../shared/obsolete-items'
import {forgeMaterials} from '../shared/official-catalog'
import {originalGems} from '../shared/gems'

// 显式开启。测试仅 fenghuo，全部写入留在同一个外层事务中并回滚，不清理或重置用户记录。
describe.skipIf(process.env.RUN_DB_TESTS!=='1')('fenghuo 实库事务回滚联调',()=>{
  let heroId:number,skillId:number
  beforeAll(async()=>{db.c=await mysql.createConnection({host:config.DB_HOST,port:config.DB_PORT,user:config.DB_USER,password:config.DB_PASSWORD,database:'fenghuo',charset:'utf8mb4',timezone:'Z'});const [r]=await db.c.query('SELECT DATABASE() db');expect(r[0].db).toBe('fenghuo')})
  afterAll(async()=>{await db.c?.end()})
  beforeEach(async()=>{
    tavernMemory.clear()
    await db.c.beginTransaction()
    // Isolate time-sensitive services from the user's real in-flight work; outer rollback restores it.
    await db.c.query('SELECT id FROM player_profile WHERE id=? FOR UPDATE',[config.PLAYER_ID])
    // The live player may already have all 50 queue slots occupied. Hide existing
    // production inside this rollback-only fixture without granting troops or changing the save.
    await db.c.execute('UPDATE military_orders SET completed=quantity WHERE player_id=? AND completed<quantity',[config.PLAYER_ID])
    await db.c.execute("INSERT INTO game_settings (setting_key,setting_value,value_type) VALUES ('world_boss_rules',?,'JSON') ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)",[JSON.stringify({...defaultWorldBossRules,enabled:false})])
    await db.c.execute("INSERT INTO game_settings (setting_key,setting_value,value_type) VALUES ('tavern_recording','{\"enabled\":true,\"afterRefreshId\":0}','JSON') ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)")
    await db.c.execute("UPDATE march_orders SET arrive_game_at='3026-01-01',return_game_at='3026-01-02' WHERE player_id=? AND status IN ('MARCHING','RETURNING')",[config.PLAYER_ID])
    await db.c.execute("UPDATE auto_farm_jobs SET next_run_game_at='3026-01-01' WHERE player_id=? AND status='ACTIVE'",[config.PLAYER_ID])
    const [h]=await db.c.query("SELECT id FROM hero_definitions WHERE code='zhang_han'")
    const [s]=await db.c.query("SELECT id FROM skill_definitions WHERE code='kuangre'");skillId=Number(s[0].id)
    const [r]=await db.c.execute("INSERT INTO owned_heroes (player_id,hero_definition_id,level,experience,talent_grade,stamina) VALUES (?,?,5,10000,'COMMON',120)",[config.PLAYER_ID,h[0].id]);heroId=r.insertId
    await db.c.execute('INSERT INTO player_skill_books (player_id,skill_definition_id,quantity) VALUES (?,?,3) ON DUPLICATE KEY UPDATE quantity=quantity+3',[config.PLAYER_ID,skillId])
  })
  afterEach(async()=>{await db.c.rollback();tavernMemory.clear()})
  it('四位新英雄、完整头像、最低权重与技能曲线已入库',async()=>{
    const heroes=await listHeroes(),skills=await listSkills(),entries=await listPoolEntries()
    for(const name of ['章邯','神珊珊','蒙恬','王贲'])expect(heroes.some(h=>h.name===name&&h.portraitKey)).toBe(true)
    expect(heroes.every(h=>Boolean(h.portraitKey))).toBe(true)
    expect(skills.every(s=>s.levels?.length===11&&s.iconKey&&s.description)).toBe(true)
    const shan=entries.find(e=>e.reward_name==='神珊珊')!;expect(Number(shan.weight)).toBe(1)
    expect(entries.filter(e=>e.pool_id===shan.pool_id&&e.id!==shan.id).every(e=>Number(e.weight)>1)).toBe(true)
  })
  it('学习消耗一本、升级消耗经验与同名书、重复学习不扣书',async()=>{
    const before=await getWorldStatus(),qty=before.skillBooks.find(b=>b.skillDefinitionId===skillId)!.quantity
    await learnHeroSkill(heroId,1,skillId)
    let w=await getWorldStatus();expect(w.ownedHeroes.find(h=>h.id===heroId)!.skills[0].level).toBe(0)
    expect(w.skillBooks.find(b=>b.skillDefinitionId===skillId)!.quantity).toBe(qty-1)
    await expect(learnHeroSkill(heroId,2,skillId)).rejects.toThrow('已学习')
    await upgradeHeroSkill(heroId,1)
    w=await getWorldStatus();const h=w.ownedHeroes.find(h=>h.id===heroId)!
    expect(h.skills[0].level).toBe(1);expect(h.skills[0].effectValue).toBe(25);expect(h.experience).toBe(9900)
    expect(w.skillBooks.find(b=>b.skillDefinitionId===skillId)!.quantity).toBe(qty-2)
  })
  it('锁定技能槽、缺书、缺经验均拒绝且不消耗资源',async()=>{
    await expect(learnHeroSkill(heroId,3,skillId)).rejects.toThrow('尚未解锁')
    await db.c.execute('UPDATE player_skill_books SET quantity=0 WHERE player_id=? AND skill_definition_id=?',[config.PLAYER_ID,skillId])
    await expect(learnHeroSkill(heroId,1,skillId)).rejects.toThrow('缺少')
    await db.c.execute('UPDATE owned_heroes SET experience=0 WHERE id=?',[heroId])
    await expect(trainHero(heroId)).rejects.toThrow('升级需要')
  })
  it('普通出征实际触发满级狂热并写入战报，未完成时不可改技能',async()=>{
    await learnHeroSkill(heroId,1,skillId)
    await db.c.execute('UPDATE owned_hero_skills SET skill_level=10 WHERE owned_hero_id=?',[heroId])
    const march=await startMarch(heroId,await makeOutpost(1))
    await expect(upgradeHeroSkill(heroId,1)).rejects.toThrow('正在出征')
    await processMarch(march.id,new Date(new Date(march.arriveGameAt).getTime()+1))
    const w=await getWorldStatus(),report=w.reports[0]
    expect(report.skillEvents.some(s=>s.name==='狂热'&&s.triggered)).toBe(true)
    expect(report.finalPower).toBeGreaterThan(report.basePower!)
    expect(w.ownedHeroes.find(h=>h.id===heroId)!.experience).toBeGreaterThan(10000)
    expect(w.marches.find(m=>m.id===march.id)!.status).toBe('RETURNING')
    await processMarch(march.id,new Date(w.marches.find(m=>m.id===march.id)!.returnGameAt!))
    expect((await getWorldStatus()).marches.find(m=>m.id===march.id)).toBeUndefined()
    const [deleted]=await db.c.query('SELECT id FROM march_orders WHERE id=?',[march.id]);expect(deleted).toHaveLength(0)
  })
  async function secondDispatchHero(){const [r]=await db.c.execute('INSERT INTO owned_heroes (player_id,hero_definition_id) SELECT player_id,hero_definition_id FROM owned_heroes WHERE id=?',[heroId]);return Number(r.insertId)}
  async function freezeDispatchTime(at:Date){await db.c.execute('UPDATE game_clock SET game_anchor_at=?,real_anchor_at=UTC_TIMESTAMP(3),multiplier=0 WHERE id=1',[at])}
  it('派遣回归：第一位自动刷野刚启动，第二位仍可立即普通出征且重试不重复',async()=>{
    await freezeDispatchTime(new Date('2027-01-01T00:00:00Z'))
    const second=await secondDispatchHero(),node=await makeOutpost(20),job=await startAutoFarm(heroId,'OUTPOST',20,20,2)
    const key=randomUUID(),march=await startMarch(second,node,[],key)
    expect(await startMarch(second,node,[],key)).toEqual(march)
    const w=await getWorldStatus()
    expect(w.marches.some(m=>m.heroId===heroId&&m.status==='MARCHING')).toBe(true)
    expect(w.marches.filter(m=>m.heroId===second)).toHaveLength(1)
    expect(w.autoFarmJobs.find(j=>j.id===job.id)?.runsRemaining).toBe(2)
    await expect(startMarch(heroId,node)).rejects.toThrow('该英雄正在执行其他任务')
  })
  it('派遣回归：两位武将可连续开启自动刷野，不被待出发事件互相阻塞',async()=>{
    await freezeDispatchTime(new Date('2027-01-01T00:00:00Z'))
    const second=await secondDispatchHero();await makeOutpost(20)
    const first=await startAutoFarm(heroId,'OUTPOST',20,20,2),next=await startAutoFarm(second,'OUTPOST',20,20,2)
    const w=await getWorldStatus()
    expect(w.autoFarmJobs.filter(j=>[first.id,next.id].includes(j.id)).every(j=>j.status==='ACTIVE')).toBe(true)
    expect(w.marches.filter(m=>m.heroId===heroId)).toHaveLength(1)
    await processFarm(next.id,new Date('2027-01-01T00:00:00Z'))
    expect((await getWorldStatus()).marches.some(m=>m.heroId===second)).toBe(true)
  })
  it('派遣回归：其他武将到点战斗先结算一次，不阻止新出征，也不提前返城',async()=>{
    await freezeDispatchTime(new Date('2027-01-01T00:00:00Z'))
    const second=await secondDispatchHero(),node=await makeOutpost(20),first=await startMarch(heroId,node)
    await freezeDispatchTime(new Date(first.arriveGameAt))
    const next=await startMarch(second,node),w=await getWorldStatus()
    expect(w.marches.find(m=>m.id===first.id)?.status).toBe('RETURNING')
    expect(w.marches.find(m=>m.id===next.id)?.status).toBe('MARCHING')
    const [reports]=await db.c.query('SELECT id FROM battle_reports WHERE march_order_id=?',[first.id]);expect(reports).toHaveLength(1)
    await processMarch(first.id,new Date(first.arriveGameAt))
    const [again]=await db.c.query('SELECT id FROM battle_reports WHERE march_order_id=?',[first.id]);expect(again).toHaveLength(1)
    const [target]=await db.c.query('SELECT level FROM map_nodes WHERE id=?',[node]);expect(Number(target[0].level)).toBe(19)
  })
  it('派遣回归：已经到点返城的武将先释放忙碌状态，可以再次派遣',async()=>{
    await freezeDispatchTime(new Date('2027-01-01T00:00:00Z'))
    const node=await makeOutpost(20),first=await startMarch(heroId,node)
    await freezeDispatchTime(new Date(first.returnGameAt))
    const next=await startMarch(heroId,node),w=await getWorldStatus()
    expect(w.marches.some(m=>m.id===first.id)).toBe(false)
    expect(w.marches.find(m=>m.id===next.id)?.heroId).toBe(heroId)
  })
  it('派遣回归：混编连续派遣扣兵守恒，第二队失败不会推进或吞掉第一队',async()=>{
    await freezeDispatchTime(new Date('2027-01-01T00:00:00Z'))
    const second=await secondDispatchHero(),d=await testUnit(),node=await makeOutpost(20);await forceDelta(db.c,d.code,10)
    const job=await startAutoFarm(heroId,'OUTPOST',20,20,2,[{code:d.code,quantity:6}])
    await expect(startMarch(second,node,[{code:d.code,quantity:5}])).rejects.toThrow('可用兵力不足')
    expect(await unitQuantity(d.code)).toBe(4);expect(await farmMarch(job.id)).toBeUndefined()
    const [pending]=await db.c.query('SELECT troop_config,runs_remaining FROM auto_farm_jobs WHERE id=?',[job.id]);expect(readArmy(pending[0].troop_config)[0].quantity).toBe(6);expect(Number(pending[0].runs_remaining)).toBe(2)
    const key=randomUUID(),march=await startMarch(second,node,[{code:d.code,quantity:4}],key)
    expect(await unitQuantity(d.code)).toBe(0);expect(readArmy((await farmMarch(job.id)).troop_config)[0].quantity).toBe(6)
    expect(await startMarch(second,node,[{code:d.code,quantity:4}],key)).toEqual(march);expect(await unitQuantity(d.code)).toBe(0)
  })
  it('派遣回归：新派遣结算离线战斗按时间顺序扣粮，不继续向阵亡士兵收费',async()=>{
    const start=new Date('2027-01-01T00:00:00Z');await freezeDispatchTime(start);await isolateFood()
    const d=await testUnit();await saveMilitary({...d,foodPerHour:3600});await forceDelta(db.c,d.code,2)
    await db.c.execute('UPDATE military_upkeep SET last_game_at=?,fraction=0 WHERE player_id=?',[start,config.PLAYER_ID]);await db.c.execute('UPDATE resource_wallet SET food=1000 WHERE player_id=?',[config.PLAYER_ID])
    const node=await makeOutpost(20),first=await startMarch(null,node,[{code:d.code,quantity:1}])
    await db.c.execute('UPDATE march_orders SET arrive_game_at=?,return_game_at=? WHERE id=?',[new Date(start.getTime()+10000),new Date(start.getTime()+20000),first.id])
    await freezeDispatchTime(new Date(start.getTime()+60000));await startMarch(heroId,node)
    // Two troops for ten seconds, then one surviving home troop for fifty seconds.
    expect(Number((await wallet()).food)).toBe(930);expect(await unitQuantity(d.code)).toBe(1)
    // Completed marches are pruned and their report FK becomes null; the report itself remains.
    const [reports]=await db.c.query("SELECT result FROM battle_reports WHERE player_id=? AND JSON_EXTRACT(battle_config,'$.nodeId')=?",[config.PLAYER_ID,node]);expect(reports).toEqual([expect.objectContaining({result:'DEFEAT'})])
  })
  it('派遣回归：待出发自动任务也不阻止正常招兵',async()=>{
    await freezeDispatchTime(new Date('2027-01-01T00:00:00Z'))
    await isolateFood()
    const d=await testUnit();await makeOutpost(20);const job=await startAutoFarm(heroId,'OUTPOST',20,20,2)
    const order=await enqueueMilitary(d.code,1,randomUUID());expect(await queueRow(order.id)).toBeDefined();expect((await farmMarch(job.id)).status).toBe('MARCHING')
  })
  it('英雄与技能均可刷新及招募，重复请求不重复扣费',async()=>{
    const [pools]=await db.c.query("SELECT id,pool_type FROM tavern_pools WHERE code IN ('hero_standard','skill_standard')")
    for(const p of pools){
      const action=randomUUID(),result=await refreshTavern(Number(p.id),action),again=await refreshTavern(Number(p.id),action)
      expect(result.candidates).toHaveLength(3);expect(again.refreshId).toBe(result.refreshId);expect(again.remainingCurrency).toBe(result.remainingCurrency)
      const candidate=result.candidates[0];expect(candidate.name).toBeTruthy();expect(candidate.rarity).toBeGreaterThan(0)
      if(candidate.rewardType==='HERO'&&(await getWorldStatus()).ownedHeroes.length>=6){await expect(recruitCandidate(candidate.id)).rejects.toThrow('英雄上限');continue}
      const recruit=await recruitCandidate(candidate.id);expect(recruit.name).toBe(candidate.name)
      const before=await getWorldStatus();await recruitCandidate(candidate.id);expect(await getWorldStatus()).toEqual(before)
    }
  })
  async function give(code:string,quantity=1){const [r]=await db.c.query('SELECT id FROM item_definitions WHERE code=?',[code]);const id=Number(r[0].id);await db.c.execute('INSERT INTO player_inventory (player_id,item_definition_id,quantity) VALUES (?,?,?) ON DUPLICATE KEY UPDATE quantity=quantity+VALUES(quantity)',[config.PLAYER_ID,id,quantity]);return id}
  async function obsoleteFixture(){
    const ids:number[]=[]
    for(const code of obsoleteItemCodes){
      await db.c.execute('UPDATE item_definitions SET enabled=1,effect_config=? WHERE code=?',[JSON.stringify(forgeMaterials.find(i=>i.code===code)?.effectConfig??{}),code]);ids.push(await give(code,2))
    }
    return ids
  }
  it('无效道具清理：仅移除七种精确目标库存并停用来源，备份完整可恢复，重复执行无副作用',async()=>{
    const ids=await obsoleteFixture(),before=await getInventory(),[gear]=await db.c.query('SELECT * FROM equipment_instances ORDER BY id')
    const result=await cleanupObsoleteItems(db.c,config.PLAYER_ID);expect(result).toHaveLength(7)
    expect(await getInventory()).toEqual(before.filter(e=>!ids.includes(e.item.id)))
    expect((await db.c.query('SELECT * FROM equipment_instances ORDER BY id'))[0]).toEqual(gear)
    for(const item of result){
      const [definition]=await db.c.query('SELECT enabled FROM item_definitions WHERE id=?',[item.id]);expect(definition[0].enabled).toBe(0)
      for(const table of ['drop_pool_entries','tavern_pool_entries'])expect((await db.c.query(`SELECT * FROM ${table} WHERE item_definition_id=? AND enabled=1`,[item.id]))[0]).toHaveLength(0)
      const [audit]=await db.c.query('SELECT before_json FROM admin_audit_logs WHERE id=?',[item.auditId]),saved=typeof audit[0].before_json==='string'?JSON.parse(audit[0].before_json):audit[0].before_json
      expect(saved.definition.code).toBe(item.code);expect(Number(saved.inventory[0].quantity)).toBe(item.removedQuantity);expect(item.removedQuantity).toBe(before.find(e=>e.item.id===item.id)!.quantity)
    }
    expect(await cleanupObsoleteItems(db.c,config.PLAYER_ID)).toEqual([])
    expect((await listGems()).filter(g=>g.effectConfig.gemFamily)).toHaveLength(40)
  })
  it('无效道具清理：旧编号改成有效宝石后不清理，不按停用或缺图标误删',async()=>{
    await obsoleteFixture();await db.c.execute("UPDATE item_definitions SET effect_config=JSON_SET(effect_config,'$.gemFamily','custom','$.gemLevel',1) WHERE code='gem_speed'")
    const before=(await getInventory()).find(e=>e.item.code==='gem_speed')!
    const result=await cleanupObsoleteItems(db.c,config.PLAYER_ID);expect(result).toHaveLength(6);expect((await getInventory()).find(e=>e.item.id===before.item.id)).toEqual(before)
  })
  it('无效道具清理：发现仍镶嵌的旧宝石则整体拒绝，不损坏装备或删除库存',async()=>{
    const ids=await obsoleteFixture(),itemId=await give('official_trea_8000');await equipItem(heroId,'HELMET',itemId)
    const equipment=(await getWorldStatus()).ownedHeroes.find(h=>h.id===heroId)!.equipment[0],gem=[{itemId:ids[0],name:'近攻宝石',stat:'meleeAttack',amount:300}]
    await db.c.execute('UPDATE equipment_instances SET sockets=1,gems_json=? WHERE id=?',[JSON.stringify(gem),equipment.gear!.instanceId])
    const before=await getInventory();await expect(cleanupObsoleteItems(db.c,config.PLAYER_ID)).rejects.toThrow('仍有镶嵌');expect(await getInventory()).toEqual(before)
    const [row]=await db.c.query('SELECT gems_json FROM equipment_instances WHERE id=?',[equipment.gear!.instanceId]);expect(typeof row[0].gems_json==='string'?JSON.parse(row[0].gems_json):row[0].gems_json).toEqual(gem)
  })
  it.each([true,false])('无效道具清理：酒馆记录=%s，旧候选不能重新领回已清理道具',async recording=>{
    await obsoleteFixture();const f=await treasureFixture('MATERIAL'),legacyId=await give('gem_speed')
    await savePoolEntry({poolId:f.poolId,rewardType:'ITEM',itemDefinitionId:legacyId,weight:1,enabled:true},f.entryId)
    await setTavernRecording(recording);const action=randomUUID(),round=await refreshTavern(f.poolId,action)
    expect(round.candidates).toHaveLength(3);await cleanupObsoleteItems(db.c,config.PLAYER_ID)
    await expect(recruitCandidate(round.candidates[0].id)).rejects.toThrow('无效道具已清理')
    expect((await getInventory()).some(e=>e.item.id===legacyId)).toBe(false)
    expect((await refreshTavern(f.poolId,action)).candidates).toEqual([])
    expect((await getBootstrap()).latestRefreshes?.find(r=>r.pool.id===f.poolId)?.candidates).toEqual([])
  })
  it('关闭记录后，三类刷新与领取均不写候选或刷新表，余额和奖品正常存档',async()=>{
    await setTavernRecording(false)
    expect(await getTavernRecording()).toEqual({enabled:false})
    await db.c.execute('UPDATE resource_wallet SET gold=1000000,coupon=1000000 WHERE player_id=?',[config.PLAYER_ID])
    const [pools]=await db.c.query("SELECT id,candidate_count FROM tavern_pools WHERE code IN ('hero_standard','skill_standard','treasure_standard')")
    const sql:string[]=[],query=db.c.query.bind(db.c),execute=db.c.execute.bind(db.c)
    const q=vi.spyOn(db.c,'query').mockImplementation((...args:any[])=>{sql.push(String(args[0]));return query(...args)}),e=vi.spyOn(db.c,'execute').mockImplementation((...args:any[])=>{sql.push(String(args[0]));return execute(...args)})
    try{
      expect(pools).toHaveLength(3)
      for(const p of pools){
        const action=randomUUID(),[a,b]=await Promise.all([refreshTavern(Number(p.id),action),refreshTavern(Number(p.id),action)])
        expect(b).toEqual(a);expect(a.candidates).toHaveLength(Number(p.candidate_count))
        const candidate=a.candidates[0]
        if(candidate.rewardType==='HERO'&&(await getWorldStatus()).ownedHeroes.length>=6)await expect(recruitCandidate(candidate.id)).rejects.toThrow('英雄上限')
        else{
          const [one,two]=await Promise.all([recruitCandidate(candidate.id),recruitCandidate(candidate.id)])
          expect(one).toEqual(two);expect(tavernMemory.candidate(candidate.id)?.candidate.recruited).toBe(true)
        }
        expect((await getBootstrap()).latestRefreshes?.some(r=>r.refreshId===a.refreshId)).toBe(true)
      }
      expect(sql.filter(s=>/^(INSERT|UPDATE|DELETE|REPLACE)/i.test(s)&&/tavern_refreshes|tavern_candidates|admin_audit_logs/.test(s))).toEqual([])
      expect(sql.some(s=>s.startsWith('UPDATE resource_wallet'))).toBe(true)
    }finally{q.mockRestore();e.mockRestore()}
  })
  it('记录开关保留旧表与当前候选，切换不恢复已失效历史',async()=>{
    const f=await treasureFixture(),old=await refreshTavern(f.poolId,randomUUID())
    await setTavernRecording(false)
    const adopted=(await getBootstrap()).latestRefreshes!.find(r=>r.pool.id===f.poolId)!
    expect(adopted.candidates.map(c=>c.name)).toEqual(old.candidates.map(c=>c.name))
    expect(adopted.candidates[0].id).not.toBe(old.candidates[0].id)
    await recruitCandidate(adopted.candidates[0].id)
    const fresh=await refreshTavern(f.poolId,randomUUID())
    await expect(recruitCandidate(adopted.candidates[1].id)).rejects.toThrow('过期')
    await setTavernRecording(true)
    expect((await getBootstrap()).latestRefreshes!.find(r=>r.pool.id===f.poolId)?.refreshId).toBe(fresh.refreshId)
    await recruitCandidate(fresh.candidates[0].id)
    await expect(recruitCandidate(old.candidates[0].id)).rejects.toThrow('过期')
    const recorded=await refreshTavern(f.poolId,randomUUID())
    expect(tavernMemory.candidate(fresh.candidates[0].id)).toBeNull()
    const [rows]=await db.c.query('SELECT id FROM tavern_refreshes WHERE id IN (?,?)',[old.refreshId,recorded.refreshId]);expect(rows).toHaveLength(2)
    const [oldCandidate]=await db.c.query('SELECT recruited_at FROM tavern_candidates WHERE id=?',[old.candidates[0].id]);expect(oldCandidate[0].recruited_at).toBeNull()
  })
  it('内存模式失败不扣费或占领取位，重启丢失候选但不影响已入包物品',async()=>{
    const f=await treasureFixture();await setTavernRecording(false)
    const action=randomUUID(),round=await refreshTavern(f.poolId,action),id=round.candidates[0].id
    const execute=db.c.execute.bind(db.c),spy=vi.spyOn(db.c,'execute').mockImplementation((...args:any[])=>{if(String(args[0]).startsWith('INSERT INTO player_inventory'))throw Error('模拟入包失败');return execute(...args)})
    try{await expect(recruitCandidate(id)).rejects.toThrow('模拟入包失败');expect(tavernMemory.candidate(id)?.candidate.recruited).toBe(false)}finally{spy.mockRestore()}
    await recruitCandidate(id)
    await refreshTavern(f.poolId,randomUUID())
    const gold=(await getBootstrap()).player.wallet.gold
    await expect(refreshTavern(f.poolId,action)).rejects.toThrow('过期');expect((await getBootstrap()).player.wallet.gold).toBe(gold)
    tavernMemory.clear()
    expect((await getBootstrap()).latestRefreshes).toEqual([])
    await expect(recruitCandidate(id)).rejects.toThrow('已重启')
    const [stock]=await db.c.query('SELECT quantity FROM player_inventory WHERE player_id=? AND item_definition_id=?',[config.PLAYER_ID,f.itemId]);expect(Number(stock[0].quantity)).toBe(1)
  })
  it('后台开关HTTP参数严格校验，刷新和领取请求成功失败均不输出应用日志',async()=>{
    const f=await treasureFixture(),lines:string[]=[],app=Fastify({logger:{level:'trace',stream:{write:(s:string)=>lines.push(s)}}})
    app.setErrorHandler((error,request,reply)=>{request.log.error(error);void reply.status(400).send({error:'操作失败'})})
    await registerApi(app)
    try{
      expect((await app.inject({method:'PUT',url:'/api/admin/tavern-recording',payload:{enabled:false}})).json()).toEqual({enabled:false})
      expect((await app.inject({method:'GET',url:'/api/admin/tavern-recording'})).json()).toEqual({enabled:false})
      for(const body of [{},{enabled:'false'},{enabled:false,unknown:true}])expect((await app.inject({method:'PUT',url:'/api/admin/tavern-recording',payload:body})).statusCode).toBe(400)
      lines.length=0
      const a=await app.inject({method:'POST',url:'/api/tavern/refresh',payload:{poolId:f.poolId,clientActionId:randomUUID()}});expect(a.statusCode).toBe(200)
      expect((await app.inject({method:'POST',url:'/api/tavern/candidates/'+a.json().candidates[0].id+'/recruit'})).statusCode).toBe(200)
      await app.inject({method:'POST',url:'/api/tavern/refresh',payload:{}})
      await app.inject({method:'POST',url:'/api/tavern/candidates/1/recruit'})
      expect(lines).toEqual([])
    }finally{await app.close()}
  })
  async function treasureFixture(type='TREASURE'){
    const [p]=await db.c.execute("INSERT INTO tavern_pools (code,name,pool_type,currency_code,refresh_cost,candidate_count,select_limit) VALUES (?,'事务测试藏宝阁','ITEM','gold',8000,3,1)",['test_'+randomUUID()])
    const [i]=await db.c.execute("INSERT INTO item_definitions (code,name,item_type,rarity,quality_tier,effect_config,description) VALUES (?,'事务测试珍品',?,6,7,?, '用于回滚测试的属性说明')",['test_'+randomUUID(),type,JSON.stringify({bonuses:{meleeDefense:12},icon:'/art/official/trea_8000.gif'})])
    const poolId=Number(p.insertId),itemId=Number(i.insertId)
    const entryId=await savePoolEntry({poolId,rewardType:'ITEM',itemDefinitionId:itemId,weight:1,enabled:true})
    await db.c.execute('UPDATE resource_wallet SET gold=1000000 WHERE player_id=?',[config.PLAYER_ID])
    return {poolId,itemId,entryId}
  }
  it('藏宝阁四类物品都有快照与品质，选中只入包一次，不受英雄上限影响',async()=>{
    for(const type of ['EQUIPMENT','TREASURE','CONSUMABLE','MATERIAL']){
      const f=await treasureFixture(type),action=randomUUID(),result=await refreshTavern(f.poolId,action),candidate=result.candidates[0]
      expect(result.candidates).toHaveLength(3);expect(result.pool.id).toBe(f.poolId);expect(result.remainingCurrency).toBe(992000)
      expect(result.candidates.every(c=>c.rewardType==='ITEM'&&c.itemDefinitionId===f.itemId&&c.item?.id===f.itemId)).toBe(true)
      expect(candidate.item).toMatchObject({itemType:type,qualityTier:7,description:'用于回滚测试的属性说明',effectConfig:{bonuses:{meleeDefense:12}}})
      expect(await refreshTavern(f.poolId,action)).toEqual(result)
      expect((await recruitCandidate(candidate.id)).rewardType).toBe('ITEM')
      await recruitCandidate(candidate.id)
      const [stock]=await db.c.query('SELECT quantity FROM player_inventory WHERE player_id=? AND item_definition_id=?',[config.PLAYER_ID,f.itemId])
      expect(Number(stock[0].quantity)).toBe(1)
      expect((await getWorldStatus()).inventory.some(e=>e.item.id===f.itemId&&e.quantity===1)).toBe(true)
      await expect(recruitCandidate(result.candidates[1].id)).rejects.toThrow('选取上限')
    }
  })
  it('停用、回收及空池不会扣费，后加物品支持手动入池与权重修改',async()=>{
    const f=await treasureFixture()
    await expect(savePoolEntry({poolId:f.poolId,rewardType:'ITEM',itemDefinitionId:f.itemId,weight:1,enabled:true})).rejects.toThrow('已在卡池')
    await savePoolEntry({poolId:f.poolId,rewardType:'ITEM',itemDefinitionId:f.itemId,weight:10,enabled:false},f.entryId)
    await expect(refreshTavern(f.poolId,randomUUID())).rejects.toThrow('尚未配置')
    await savePoolEntry({poolId:f.poolId,rewardType:'ITEM',itemDefinitionId:f.itemId,weight:25,enabled:true},f.entryId)
    for(const sql of ['UPDATE item_definitions SET enabled=0 WHERE id=?','UPDATE item_definitions SET enabled=1,deleted_at=UTC_TIMESTAMP(3) WHERE id=?']){
      await db.c.execute(sql,[f.itemId]);await expect(refreshTavern(f.poolId,randomUUID())).rejects.toThrow('尚未配置')
      const entry=(await listPoolEntries()).find(e=>Number(e.id)===f.entryId)!;expect(Number(entry.reward_enabled)).toBe(0)
      expect((await getBootstrap()).player.wallet.gold).toBe(1000000)
    }
  })
  it('费用不足不产生刷新记录，跨卡池复用请求标识拒绝且不扣费',async()=>{
    const f=await treasureFixture(),g=await treasureFixture(),action=randomUUID()
    await db.c.execute('UPDATE resource_wallet SET gold=7999 WHERE player_id=?',[config.PLAYER_ID])
    await expect(refreshTavern(f.poolId,action)).rejects.toThrow('资源不足')
    const [r]=await db.c.query('SELECT id FROM tavern_refreshes WHERE client_action_id=?',[action]);expect(r).toHaveLength(0)
    await db.c.execute('UPDATE resource_wallet SET gold=8000 WHERE player_id=?',[config.PLAYER_ID])
    await refreshTavern(f.poolId,action)
    await expect(refreshTavern(g.poolId,action)).rejects.toThrow('原卡池不一致')
    expect((await getBootstrap()).player.wallet.gold).toBe(0)
  })
  it('更改规则不会扩大已付费轮次的领取上限；已抽物品即使回收也可领取',async()=>{
    const f=await treasureFixture(),action=randomUUID(),result=await refreshTavern(f.poolId,action)
    await savePoolSettings(f.poolId,{refreshCost:100,candidateCount:6,selectLimit:2})
    await db.c.execute('UPDATE item_definitions SET deleted_at=UTC_TIMESTAMP(3) WHERE id=?',[f.itemId])
    expect((await refreshTavern(f.poolId,action)).pool.selectLimit).toBe(1)
    await recruitCandidate(result.candidates[0].id)
    await expect(recruitCandidate(result.candidates[1].id)).rejects.toThrow('选取上限')
    await db.c.execute('UPDATE item_definitions SET deleted_at=NULL WHERE id=?',[f.itemId])
    const next=await refreshTavern(f.poolId,randomUUID());expect(next.candidates).toHaveLength(6);expect(next.remainingCurrency).toBe(991900)
    await recruitCandidate(next.candidates[0].id);await recruitCandidate(next.candidates[1].id)
    await expect(recruitCandidate(next.candidates[2].id)).rejects.toThrow('选取上限')
    await expect(savePoolSettings(f.poolId,{refreshCost:100,candidateCount:1,selectLimit:2})).rejects.toThrow('不能超过')
  })
  it('各酒馆分页分别保留最新结果，候选物品快照不被后台改名改变',async()=>{
    const f=await treasureFixture(),g=await treasureFixture(),first=await refreshTavern(f.poolId,randomUUID())
    const action=randomUUID(),second=await refreshTavern(g.poolId,action),next=await refreshTavern(f.poolId,randomUUID())
    await db.c.execute("UPDATE item_definitions SET name='后台新名称' WHERE id=?",[g.itemId])
    const boot=await getBootstrap()
    expect(boot.latestRefreshes?.filter(r=>r.pool.id===f.poolId).map(r=>r.refreshId)).toEqual([next.refreshId])
    expect(boot.latestRefreshes?.some(r=>r.refreshId===first.refreshId)).toBe(false)
    expect(boot.latestRefreshes?.find(r=>r.refreshId===second.refreshId)?.candidates[0].item?.name).toBe('事务测试珍品')
    await recruitCandidate(second.candidates[0].id)
    expect((await getWorldStatus()).inventory.find(e=>e.item.id===g.itemId)?.item.name).toBe('后台新名称')
  })
  it('技能书不能绕过独立书池进入藏宝阁，奖励不匹配不产生条目',async()=>{
    const f=await treasureFixture()
    await expect(savePoolEntry({poolId:f.poolId,rewardType:'SKILL_BOOK',skillDefinitionId:skillId,weight:1,enabled:true})).rejects.toThrow('不适用于')
    await expect(savePoolEntry({poolId:f.poolId,rewardType:'ITEM',itemDefinitionId:f.itemId,skillDefinitionId:skillId,weight:1,enabled:true})).rejects.toThrow('不匹配')
    const [books]=await db.c.query("SELECT id FROM item_definitions WHERE item_type='SKILL_BOOK' LIMIT 1")
    await expect(savePoolEntry({poolId:f.poolId,rewardType:'ITEM',itemDefinitionId:Number(books[0].id),weight:1,enabled:true})).rejects.toThrow('装备、宝物或道具')
  })
  it('藏宝阁HTTP刷新、入包、配置保存贯通，非法参数不改变配置',async()=>{
    const f=await treasureFixture(),app=Fastify();await registerApi(app)
    try{
      const settings={refreshCost:500,candidateCount:3,selectLimit:2}
      expect((await app.inject({method:'PUT',url:'/api/admin/tavern-pools/'+f.poolId,payload:settings})).statusCode).toBe(200)
      for(const bad of [{...settings,refreshCost:-1},{...settings,candidateCount:7},{...settings,selectLimit:4}])expect((await app.inject({method:'PUT',url:'/api/admin/tavern-pools/'+f.poolId,payload:bad})).statusCode).toBeGreaterThanOrEqual(400)
      const response=await app.inject({method:'POST',url:'/api/tavern/refresh',payload:{poolId:f.poolId,clientActionId:randomUUID()}})
      expect(response.statusCode).toBe(200);const result=response.json();expect(result.pool.selectLimit).toBe(2);expect(result.remainingCurrency).toBe(999500)
      const claim=await app.inject({method:'POST',url:'/api/tavern/candidates/'+result.candidates[0].id+'/recruit'});expect(claim.statusCode).toBe(200);expect(claim.json().rewardType).toBe('ITEM')
      const entries=await app.inject('/api/admin/pool-entries');expect(entries.json().find((e:any)=>Number(e.id)===f.entryId).item_definition_id).toBe(f.itemId)
    }finally{await app.close()}
  })
  it('精炼仅扣一枚，重复请求不重复精炼，卸下和流放保留培养状态',async()=>{
    const itemId=await give('official_trea_8000'),materialId=await give('refine_common',3)
    await saveForgeRules({...defaultForgeRules,refineRates:Array(9).fill(1)})
    await equipItem(heroId,'HELMET',itemId)
    const beforeWorld=await getWorldStatus(),before=beforeWorld.ownedHeroes.find(h=>h.id===heroId)!.stats.meleeDefense,quantity=beforeWorld.inventory.find(e=>e.item.id===materialId)!.quantity
    const q={slot:'HELMET' as const,operation:'REFINE' as const,materialId,clientActionId:randomUUID()}
    const result=await forgeItem(heroId,q);expect(result.gear.refineLevel).toBe(1);expect(await forgeItem(heroId,q)).toEqual(result)
    expect((await getWorldStatus()).inventory.find(e=>e.item.id===materialId)!.quantity).toBe(quantity-1)
    expect((await getWorldStatus()).ownedHeroes.find(h=>h.id===heroId)!.stats.meleeDefense).toBeGreaterThan(before)
    await equipItem(heroId,'HELMET',null)
    const bag=(await getWorldStatus()).inventory.find(e=>e.gear?.instanceId===result.gear.instanceId)!;expect(bag.gear?.refineLevel).toBe(1)
    await equipItem(heroId,'HELMET',itemId,bag.gear!.instanceId)
    await retireHero(heroId,'EXILE','章邯')
    expect((await getWorldStatus()).inventory.find(e=>e.gear?.instanceId===bag.gear?.instanceId)?.gear?.refineLevel).toBe(1)
  })
  it('三孔上限、镶嵌真实加属性、不相容或没有空孔不扣材料',async()=>{
    const itemId=await give('official_trea_8000'),drill=await give('drill_stone',4),gem=await give('gem_jingang_1',4),badGem=await give('gem_jifeng_1')
    await saveForgeRules({...defaultForgeRules,drillRates:[1,1,1]});await equipItem(heroId,'HELMET',itemId)
    const forge=(operation:'DRILL'|'SOCKET',materialId:number)=>forgeItem(heroId,{slot:'HELMET',operation,materialId,clientActionId:randomUUID()})
    for(let i=0;i<3;i++)expect((await forge('DRILL',drill)).gear.sockets).toBe(i+1)
    await expect(forge('DRILL',drill)).rejects.toThrow('三孔')
    const before=await getWorldStatus();await expect(forge('SOCKET',badGem)).rejects.toThrow('不相容');expect((await getWorldStatus()).inventory).toEqual(before.inventory)
    await forge('SOCKET',gem);const after=await getWorldStatus();expect(after.ownedHeroes.find(h=>h.id===heroId)!.stats.meleeDefense).toBe(before.ownedHeroes.find(h=>h.id===heroId)!.stats.meleeDefense+originalGems.find(g=>g.code==='gem_jingang_1')!.effectConfig.gemAmount!)
    await forge('SOCKET',gem);await forge('SOCKET',gem);await expect(forge('SOCKET',gem)).rejects.toThrow('空余孔位')
  })
  it('精炼失败降级、缺材料回滚、实力要求与行军锁定',async()=>{
    const itemId=await give('official_trea_8000'),stone=await give('refine_common',2)
    await db.c.execute("UPDATE item_definitions SET effect_config=JSON_SET(effect_config,'$.requiredStrength',99) WHERE id=?",[itemId]);await expect(equipItem(heroId,'HELMET',itemId)).rejects.toThrow('实力不足')
    await db.c.execute("UPDATE item_definitions SET effect_config=JSON_SET(effect_config,'$.requiredStrength',0) WHERE id=?",[itemId]);await equipItem(heroId,'HELMET',itemId)
    const id=(await getWorldStatus()).ownedHeroes.find(h=>h.id===heroId)!.equipment[0].gear!.instanceId
    await db.c.execute('UPDATE equipment_instances SET refine_level=3 WHERE id=?',[id]);await saveForgeRules({...defaultForgeRules,refineRates:Array(9).fill(0),downgradeChance:1})
    const q=()=>({slot:'HELMET' as const,operation:'REFINE' as const,materialId:stone,clientActionId:randomUUID()});expect((await forgeItem(heroId,q())).gear.refineLevel).toBe(2)
    await db.c.execute('UPDATE player_inventory SET quantity=0 WHERE player_id=? AND item_definition_id=?',[config.PLAYER_ID,stone]);await expect(forgeItem(heroId,q())).rejects.toThrow('数量不足')
    expect((await getWorldStatus()).ownedHeroes.find(h=>h.id===heroId)!.equipment[0].gear?.refineLevel).toBe(2)
    await startMarch(heroId,await makeOutpost(1));await expect(forgeItem(heroId,q())).rejects.toThrow('正在出征')
  })
  it('两件同名首饰有独立实例，不能重复占用同一实例',async()=>{
    const itemId=await give('official_trea_8006',2);await equipItem(heroId,'BRACELET',itemId);await equipItem(heroId,'BRACELET_2',itemId)
    const e=(await getWorldStatus()).ownedHeroes.find(h=>h.id===heroId)!.equipment;expect(e).toHaveLength(2);expect(e[0].gear!.instanceId).not.toBe(e[1].gear!.instanceId)
    await expect(equipItem(heroId,'BRACELET',itemId,e[1].gear!.instanceId)).rejects.toThrow('已经被穿戴')
  })
  it('真实升级、改名与下一级预览一致',async()=>{
    const before=(await getWorldStatus()).ownedHeroes.find(h=>h.id===heroId)!
    await give('rename_card');await trainHero(heroId);await renameHero(heroId,'测试名字',randomUUID())
    const after=(await getWorldStatus()).ownedHeroes.find(h=>h.id===heroId)!
    expect(after.name).toBe('测试名字');expect(after.originalName).toBe('章邯');expect(after.stats).toEqual(before.nextStats);expect(after.power).toBeGreaterThan(before.power)
  })
  it('改名卡原子扣除、重试不重扣、缺卡和空名不修改',async()=>{
    const card=await give('rename_card',2),action=randomUUID(),quantity=async()=>{const [r]=await db.c.query('SELECT quantity FROM player_inventory WHERE player_id=? AND item_definition_id=?',[config.PLAYER_ID,card]);return Number(r[0].quantity)}
    const before=await quantity();await renameHero(heroId,'新名字',action);await renameHero(heroId,'新名字',action);expect(await quantity()).toBe(before-1)
    await expect(renameHero(heroId,'不同名字',action)).rejects.toThrow('不匹配');await expect(renameHero(heroId,'',randomUUID())).rejects.toThrow('名字需');await expect(renameHero(heroId,'新名字',randomUUID())).rejects.toThrow('相同')
    expect(await quantity()).toBe(before-1);await db.c.execute('UPDATE player_inventory SET quantity=0 WHERE player_id=? AND item_definition_id=?',[config.PLAYER_ID,card]);await expect(renameHero(heroId,'缺卡',randomUUID())).rejects.toThrow('缺少改名卡');expect((await getWorldStatus()).ownedHeroes.find(h=>h.id===heroId)?.name).toBe('新名字')
  })
  it('宝石四合一、批量幂等、数量不足和满级不消耗',async()=>{
    const gems=await listGems();expect(gems).toHaveLength(40);const source=await give('gem_xiuluo_1',8),target=gems.find(i=>i.code==='gem_xiuluo_2')!,action=randomUUID()
    const count=async(id:number)=>{const [r]=await db.c.query('SELECT quantity FROM player_inventory WHERE player_id=? AND item_definition_id=?',[config.PLAYER_ID,id]);return Number(r[0]?.quantity??0)}
    const before=await count(source),to=await count(target.id),result=await combineGems(source,2,action);expect(result.consumed).toBe(8);expect(await combineGems(source,2,action)).toEqual(result);expect(await count(source)).toBe(before-8);expect(await count(target.id)).toBe(to+2)
    await expect(combineGems(source,1,action)).rejects.toThrow('不匹配');await expect(combineGems(source,-1,randomUUID())).rejects.toThrow('数量');await expect(combineGems(gems.find(i=>i.code==='gem_jingang_8')!.id,1,randomUUID())).rejects.toThrow('八级')
    await db.c.execute('UPDATE player_inventory SET quantity=3 WHERE player_id=? AND item_definition_id=?',[config.PLAYER_ID,source]);await expect(combineGems(source,1,randomUUID())).rejects.toThrow('数量不足');expect(await count(source)).toBe(3)
  })
  it('金刚原版宝石只镶防具，增加双防且重复请求只扣一次',async()=>{
    const helm=await give('official_trea_10000'),gem=await give('gem_jingang_1',2);await equipItem(heroId,'HELMET',helm);const hero=(await getWorldStatus()).ownedHeroes.find(h=>h.id===heroId)!,instance=hero.equipment.find(e=>e.slot==='HELMET')!.gear!.instanceId
    await db.c.execute('UPDATE equipment_instances SET sockets=1 WHERE id=?',[instance]);const q={slot:'HELMET' as const,operation:'SOCKET' as const,materialId:gem,clientActionId:randomUUID()};await forgeItem(heroId,q);await forgeItem(heroId,q);const after=(await getWorldStatus()).ownedHeroes.find(h=>h.id===heroId)!
    expect(after.stats.meleeDefense-hero.stats.meleeDefense).toBe(500);expect(after.stats.rangedDefense-hero.stats.rangedDefense).toBe(500);expect(after.equipment.find(e=>e.slot==='HELMET')!.gear!.gems).toHaveLength(1)
    await expect(forgeItem(heroId,{...q,clientActionId:randomUUID()})).rejects.toThrow('没有空余孔位')
  })
  async function itemQuantity(id:number){const [r]=await db.c.query('SELECT quantity FROM player_inventory WHERE player_id=? AND item_definition_id=?',[config.PLAYER_ID,id]);return Number(r[0]?.quantity??0)}
  async function gearRow(id:number){const [r]=await db.c.query('SELECT * FROM equipment_instances WHERE id=?',[id]);return r[0]}
  it('独立工坊：堆叠装备直接打孔只分离一件，重复请求不再拆件或扣材料',async()=>{
    const itemId=await give('official_trea_10000',2),materialId=await give('drill_stone',4),count=await itemQuantity(itemId),stones=await itemQuantity(materialId)
    await saveForgeRules({...defaultForgeRules,drillRates:[1,1,1]})
    const target={kind:'STACK' as const,itemId},q={operation:'DRILL' as const,materialId,clientActionId:randomUUID()}
    const r=await forgeEquipment(target,q);expect(r.gear.sockets).toBe(1);expect(await forgeEquipment(target,q)).toEqual(r)
    expect(await itemQuantity(itemId)).toBe(count-1);expect(await itemQuantity(materialId)).toBe(stones-1)
    expect((await getInventory()).find(e=>e.gear?.instanceId===r.gear.instanceId)?.quantity).toBe(1)
    const [worn]=await db.c.query('SELECT instance_id FROM hero_equipment WHERE instance_id=?',[r.gear.instanceId]);expect(worn).toHaveLength(0)
    const again=await forgeEquipment({kind:'INSTANCE',instanceId:r.gear.instanceId},{...q,clientActionId:randomUUID()});expect(again.gear.sockets).toBe(2)
    expect(await itemQuantity(itemId)).toBe(count-1);expect(await itemQuantity(materialId)).toBe(stones-2)
  })
  it('独立工坊：包裹打孔镶嵌取石完整链路，免费取石留孔与精炼，不重复返还',async()=>{
    const itemId=await give('official_trea_10000'),drill=await give('drill_stone'),gem=await give('gem_jingang_1',4)
    await saveForgeRules({...defaultForgeRules,drillRates:[1,1,1]})
    const r=await forgeEquipment({kind:'STACK',itemId},{operation:'DRILL',materialId:drill,clientActionId:randomUUID()}),target={kind:'INSTANCE' as const,instanceId:r.gear.instanceId}
    await db.c.execute('UPDATE equipment_instances SET refine_level=3 WHERE id=?',[target.instanceId])
    const before=await itemQuantity(gem)
    const socketed=await forgeEquipment(target,{operation:'SOCKET',materialId:gem,clientActionId:randomUUID()});expect(socketed.gear.gems).toHaveLength(1);expect(await itemQuantity(gem)).toBe(before-1)
    const walletBefore=await wallet(),stones=await itemQuantity(drill),q={operation:'UNSOCKET' as const,gemIndex:0,gemItemId:gem,clientActionId:randomUUID()}
    const removed=await forgeEquipment(target,q);expect(removed).toMatchObject({success:true,consumed:0,gear:{refineLevel:3,sockets:1,gems:[]}});expect(await itemQuantity(gem)).toBe(before)
    expect(await forgeEquipment(target,q)).toEqual(removed);expect(await itemQuantity(gem)).toBe(before);expect(await itemQuantity(drill)).toBe(stones);expect(await wallet()).toEqual(walletBefore)
    await expect(forgeEquipment(target,{...q,clientActionId:randomUUID()})).rejects.toThrow('宝石已变化')
    await combineGems(gem,1,randomUUID());expect(await itemQuantity(gem)).toBe(before-4)
  })
  it('独立工坊：穿戴装备免费取石立即扣回英雄双防，另一颗宝石与孔位不变',async()=>{
    const helm=await give('official_trea_10000'),gem=await give('gem_jingang_1',2),second=await give('gem_jingang_2')
    await equipItem(heroId,'HELMET',helm)
    const h=()=>getWorldStatus().then(w=>w.ownedHeroes.find(h=>h.id===heroId)!),instanceId=(await h()).equipment.find(e=>e.slot==='HELMET')!.gear!.instanceId
    await db.c.execute('UPDATE equipment_instances SET sockets=2 WHERE id=?',[instanceId])
    for(const materialId of [gem,second])await forgeItem(heroId,{slot:'HELMET',operation:'SOCKET',materialId,clientActionId:randomUUID()})
    const before=await h(),qty=await itemQuantity(gem),target={kind:'EQUIPPED' as const,heroId,slot:'HELMET' as const,instanceId}
    const result=await forgeEquipment(target,{operation:'UNSOCKET',gemIndex:0,gemItemId:gem,clientActionId:randomUUID()})
    const after=await h();expect(after.stats.meleeDefense).toBe(before.stats.meleeDefense-500);expect(after.stats.rangedDefense).toBe(before.stats.rangedDefense-500)
    expect(result.gear.sockets).toBe(2);expect(result.gear.gems.map(g=>g.itemId)).toEqual([second]);expect(await itemQuantity(gem)).toBe(qty+1)
    await expect(forgeEquipment(target,{operation:'UNSOCKET',gemIndex:0,gemItemId:gem,clientActionId:randomUUID()})).rejects.toThrow('宝石已变化')
    expect((await h()).equipment.find(e=>e.slot==='HELMET')!.gear?.gems.map(g=>g.itemId)).toEqual([second])
  })
  it('独立工坊：缺材料或无宝石时整笔回滚，不拆出幽灵装备',async()=>{
    const itemId=await give('official_trea_10000'),wrong=await give('talent_water'),inventory=await getInventory()
    const [before]=await db.c.query('SELECT * FROM equipment_instances WHERE player_id=? ORDER BY id',[config.PLAYER_ID])
    for(const q of [{operation:'DRILL' as const,materialId:wrong,clientActionId:randomUUID()},{operation:'UNSOCKET' as const,gemIndex:0,gemItemId:wrong,clientActionId:randomUUID()}])await expect(forgeEquipment({kind:'STACK',itemId},q)).rejects.toThrow()
    const [after]=await db.c.query('SELECT * FROM equipment_instances WHERE player_id=? ORDER BY id',[config.PLAYER_ID]);expect(after).toEqual(before);expect(await getInventory()).toEqual(inventory)
  })
  it('独立工坊：已穿戴实例不能伪装包裹绕过出征锁；换装旧请求不能误操作',async()=>{
    const itemId=await give('official_trea_10000',2),gem=await give('gem_jingang_1'),drill=await give('drill_stone')
    await equipItem(heroId,'HELMET',itemId);const hero=(await getWorldStatus()).ownedHeroes.find(h=>h.id===heroId)!,instanceId=hero.equipment.find(e=>e.slot==='HELMET')!.gear!.instanceId
    await db.c.execute('UPDATE equipment_instances SET sockets=1 WHERE id=?',[instanceId]);await forgeItem(heroId,{slot:'HELMET',operation:'SOCKET',materialId:gem,clientActionId:randomUUID()})
    const node=await makeOutpost(20),march=await startMarch(heroId,node),q={operation:'UNSOCKET' as const,gemIndex:0,gemItemId:gem,clientActionId:randomUUID()},before=await gearRow(instanceId)
    await expect(forgeEquipment({kind:'EQUIPPED',heroId,slot:'HELMET',instanceId},q)).rejects.toThrow('正在出征')
    await expect(forgeEquipment({kind:'INSTANCE',instanceId},q)).rejects.toThrow('已被穿戴');expect(await gearRow(instanceId)).toEqual(before)
    await processMarch(march.id,new Date(march.returnGameAt));await equipItem(heroId,'HELMET',null);await equipItem(heroId,'HELMET',itemId)
    await expect(forgeEquipment({kind:'EQUIPPED',heroId,slot:'HELMET',instanceId},{operation:'DRILL',materialId:drill,clientActionId:randomUUID()})).rejects.toThrow('装备已变化')
    expect(await gearRow(instanceId)).toEqual(before)
  })
  it('独立工坊：回收装备及停用宝石仍可免费取回，但不能新培养',async()=>{
    const itemId=await give('official_trea_10000'),gem=await give('gem_jingang_1')
    await equipItem(heroId,'HELMET',itemId);const instanceId=(await getWorldStatus()).ownedHeroes.find(h=>h.id===heroId)!.equipment.find(e=>e.slot==='HELMET')!.gear!.instanceId
    await db.c.execute('UPDATE equipment_instances SET sockets=1 WHERE id=?',[instanceId]);await forgeItem(heroId,{slot:'HELMET',operation:'SOCKET',materialId:gem,clientActionId:randomUUID()});await equipItem(heroId,'HELMET',null)
    await db.c.execute('UPDATE item_definitions SET deleted_at=UTC_TIMESTAMP() WHERE id=?',[itemId]);await db.c.execute('UPDATE item_definitions SET enabled=0 WHERE id=?',[gem])
    const before=await itemQuantity(gem),target={kind:'INSTANCE' as const,instanceId},result=await forgeEquipment(target,{operation:'UNSOCKET',gemIndex:0,gemItemId:gem,clientActionId:randomUUID()})
    expect(result.consumed).toBe(0);expect(await itemQuantity(gem)).toBe(before+1)
    await expect(forgeEquipment(target,{operation:'SOCKET',materialId:gem,clientActionId:randomUUID()})).rejects.toThrow('回收站')
  })
  it('独立工坊：新HTTP入口与英雄入口均支持免材料取石，非法孔位拒绝',async()=>{
    const itemId=await give('official_trea_10000'),gem=await give('gem_jingang_1'),drill=await give('drill_stone')
    await saveForgeRules({...defaultForgeRules,drillRates:[1,1,1]});const app=Fastify();await registerApi(app)
    try{
      const post=(payload:object)=>app.inject({method:'POST',url:'/api/forge/equipment',payload})
      const drilled=await post({target:{kind:'STACK',itemId},operation:'DRILL',materialId:drill,clientActionId:randomUUID()});expect(drilled.statusCode).toBe(200)
      const target={kind:'INSTANCE',instanceId:drilled.json().gear.instanceId}
      expect((await post({target,operation:'SOCKET',materialId:gem,clientActionId:randomUUID()})).statusCode).toBe(200)
      const invalid=await post({target,operation:'UNSOCKET',gemIndex:3,gemItemId:gem,clientActionId:randomUUID()});expect(invalid.statusCode).toBeGreaterThanOrEqual(400)
      const body={target,operation:'UNSOCKET',gemIndex:0,gemItemId:gem,clientActionId:randomUUID()},taken=await post(body);expect(taken.statusCode).toBe(200);expect(taken.json().consumed).toBe(0);expect((await post(body)).json()).toEqual(taken.json())
      await equipItem(heroId,'HELMET',itemId,target.instanceId);await forgeItem(heroId,{slot:'HELMET',operation:'SOCKET',materialId:gem,clientActionId:randomUUID()})
      const legacy=await app.inject({method:'POST',url:'/api/heroes/'+heroId+'/forge',payload:{slot:'HELMET',operation:'UNSOCKET',gemIndex:0,gemItemId:gem,clientActionId:randomUUID()}});expect(legacy.statusCode).toBe(200);expect(legacy.json().gear.gems).toEqual([])
    }finally{await app.close()}
  })
  it('家族科技技能下架隐藏库存与已学技能，重新上架即恢复',async()=>{
    const [rows]=await db.c.query("SELECT id FROM skill_definitions WHERE code='xueyuan'");const id=Number(rows[0].id);await db.c.execute('INSERT INTO player_skill_books (player_id,skill_definition_id,quantity) VALUES (?,?,2) ON DUPLICATE KEY UPDATE quantity=quantity+2',[config.PLAYER_ID,id]);await db.c.execute('INSERT INTO owned_hero_skills (owned_hero_id,slot_no,skill_definition_id,skill_level) VALUES (?,1,?,5)',[heroId,id]);await db.c.execute('UPDATE skill_definitions SET enabled=0 WHERE id=?',[id]);await db.c.execute("UPDATE item_definitions SET enabled=0 WHERE code='skill_book_xueyuan'")
    let world=await getWorldStatus();expect(world.skillBooks.some(b=>b.skillDefinitionId===id)).toBe(false);expect(world.ownedHeroes.find(h=>h.id===heroId)!.skills).toHaveLength(0);expect((await getInventory()).some(i=>i.item.effectConfig.skillId===id)).toBe(false)
    await db.c.execute('UPDATE skill_definitions SET enabled=1 WHERE id=?',[id]);await db.c.execute("UPDATE item_definitions SET enabled=1 WHERE code='skill_book_xueyuan'");expect(await applyHeroUpdate(db.c)).toBe(false);world=await getWorldStatus();expect(world.skillBooks.some(b=>b.skillDefinitionId===id)).toBe(true);expect(world.ownedHeroes.find(h=>h.id===heroId)!.skills[0].level).toBe(5)
  })
  it('装备增加属性、卸下返还、错误位置不消耗库存',async()=>{
    const id=await give('bronze_helmet'),before=(await getWorldStatus()).ownedHeroes.find(h=>h.id===heroId)!
    await expect(equipItem(heroId,'BOOTS',id)).rejects.toThrow('不适用')
    await equipItem(heroId,'HELMET',id)
    expect((await getWorldStatus()).ownedHeroes.find(h=>h.id===heroId)!.stats.meleeDefense).toBeGreaterThan(before.stats.meleeDefense)
    await equipItem(heroId,'HELMET',null)
    expect((await getWorldStatus()).ownedHeroes.find(h=>h.id===heroId)!.stats).toEqual(before.stats)
  })
  it('天赋水实际扣除、按新天赋成长、重复请求幂等；缺道具时完全回滚',async()=>{
    const id=await give('talent_water'),action=randomUUID()
    await db.c.execute("UPDATE item_definitions SET effect_config=? WHERE id=?",[JSON.stringify({kind:'TALENT',talentWeights:{MEDIOCRE:0,COMMON:0,GOOD:0,EXCELLENT:0,PERFECT:1}}),id])
    const before=(await getWorldStatus()).ownedHeroes.find(h=>h.id===heroId)!
    const result=await useItem(heroId,id,action);expect(result.after).toBe('PERFECT')
    expect(await useItem(heroId,id,action)).toEqual(result)
    expect((await getWorldStatus()).ownedHeroes.find(h=>h.id===heroId)!.stats.meleeAttack).toBeGreaterThan(before.stats.meleeAttack)
    await db.c.execute('UPDATE player_inventory SET quantity=0 WHERE player_id=? AND item_definition_id=?',[config.PLAYER_ID,id])
    await db.c.execute("UPDATE owned_heroes SET talent_grade='COMMON' WHERE id=?",[heroId])
    await expect(useItem(heroId,id,randomUUID())).rejects.toThrow('数量不足')
    expect((await getWorldStatus()).ownedHeroes.find(h=>h.id===heroId)!.talentGrade).toBe('COMMON')
  })
  it('据点胜利写入道具与战报；同一行军重试不重复掉落',async()=>{
    const id=await give('talent_water'),[p]=await db.c.query("SELECT id FROM drop_pools WHERE code='outpost_default'")
    await db.c.execute('UPDATE drop_pools SET chance=1,rolls=1,enabled=1,min_level=1,max_level=100 WHERE id=?',[p[0].id])
    await db.c.execute('UPDATE drop_pool_entries SET enabled=(item_definition_id=?) WHERE pool_id=?',[id,p[0].id])
    const nodeId=await makeOutpost(20)
    const [strong]=await db.c.execute("INSERT INTO hero_definitions (code,name,star,attack_type,melee_attack,speed,load_capacity,description) VALUES (?,'事务测试英雄',6,'MELEE',20000000,5000,50000,'测试结束回滚')",['test_'+randomUUID()])
    await db.c.execute('UPDATE owned_heroes SET hero_definition_id=? WHERE id=?',[strong.insertId,heroId])
    const march=await startMarch(heroId,nodeId);await processMarch(march.id,new Date(new Date(march.arriveGameAt).getTime()+1))
    const before=await getWorldStatus();expect(before.reports[0].loot?.some(l=>l.itemId===id)).toBe(true)
    await processMarch(march.id,new Date(new Date(march.arriveGameAt).getTime()+1))
    expect((await getWorldStatus()).inventory).toEqual(before.inventory)
    const [node]=await db.c.query('SELECT level FROM map_nodes WHERE id=?',[nodeId]);expect(Number(node[0].level)).toBe(19)
  })
  it('据点宝石提率：只提高三档宝石池，保留数量权重库存与其他掉落，重复更新不覆盖自定义',async()=>{
    await db.c.execute('DELETE FROM schema_migrations WHERE version=?',[outpostGemRateVersion])
    const [before]=await db.c.query('SELECT * FROM drop_pools ORDER BY id'),[entries]=await db.c.query('SELECT * FROM drop_pool_entries ORDER BY pool_id,item_definition_id'),inventory=await getInventory()
    expect(await applyOutpostGemRateUpdate(db.c)).toBe(true)
    const [after]=await db.c.query('SELECT * FROM drop_pools ORDER BY id')
    expect(after).toEqual(before.map((p:any)=>outpostGemPoolCodes.includes(p.code)?{...p,chance:typeof p.chance==='string'?'1.000000':1}:p))
    const [nextEntries]=await db.c.query('SELECT * FROM drop_pool_entries ORDER BY pool_id,item_definition_id');expect(nextEntries).toEqual(entries);expect(await getInventory()).toEqual(inventory)
    await db.c.execute("UPDATE drop_pools SET chance=0.7 WHERE code='gem_outpost_low'")
    expect(await applyOutpostGemRateUpdate(db.c)).toBe(false)
    const [custom]=await db.c.query("SELECT chance FROM drop_pools WHERE code='gem_outpost_low'");expect(Number(custom[0].chance)).toBe(.7)
  })
  async function installOutpostGemQuantities(){await db.c.execute('DELETE FROM schema_migrations WHERE version=?',[outpostGemQuantityVersion]);return applyOutpostGemQuantityUpdate(db.c)}
  async function prepareSalvage(){await db.c.execute('DELETE FROM schema_migrations WHERE version=?',[equipmentCalibrationVersion]);await applyEquipmentCalibration(db.c)}
  it('十件套更新：补25%且保留旧档位、自定义、库存与实例，重跑不覆盖后台',async()=>{
    await db.c.execute('DELETE FROM schema_migrations WHERE version=?',[equipmentSetUpdateVersion])
    const [instances]=await db.c.query('SELECT * FROM equipment_instances ORDER BY id'),[worn]=await db.c.query('SELECT * FROM hero_equipment ORDER BY owned_hero_id,slot'),inventory=(await getInventory()).map(e=>[e.item.id,e.quantity,e.gear])
    const oldTiers=[{count:3,bonuses:{speed:6}},{count:5,bonuses:{speed:11}},{count:8,bonuses:{speed:17}}]
    await db.c.execute("UPDATE item_definitions SET effect_config=JSON_SET(effect_config,'$.setBonuses',CAST(? AS JSON),'$.flatBonuses.speed',123) WHERE code='official_trea_8000'",[JSON.stringify(oldTiers)])
    const custom=[...oldTiers,{count:10,bonuses:{speed:30}}]
    await db.c.execute("UPDATE item_definitions SET effect_config=JSON_SET(effect_config,'$.setBonuses',CAST(? AS JSON)) WHERE code='official_trea_8001'",[JSON.stringify(custom)])
    expect(await applyEquipmentSetUpdate(db.c)).toBe(true)
    const [rows]=await db.c.query("SELECT code,effect_config FROM item_definitions WHERE code IN ('official_trea_8000','official_trea_8001','bronze_ring')")
    const cfg=(code:string)=>{const r=rows.find((r:any)=>r.code===code);return typeof r.effect_config==='string'?JSON.parse(r.effect_config):r.effect_config}
    expect(cfg('official_trea_8000').setBonuses).toEqual([...oldTiers,{count:10,bonuses:{speed:25}}]);expect(cfg('official_trea_8000').flatBonuses.speed).toBe(123)
    expect(cfg('official_trea_8001').setBonuses).toEqual(custom);expect(cfg('bronze_ring').setBonuses.at(-1)).toEqual({count:10,bonuses:{meleeDefense:25,rangedDefense:25}})
    expect((await getInventory()).map(e=>[e.item.id,e.quantity,e.gear])).toEqual(inventory)
    expect((await db.c.query('SELECT * FROM equipment_instances ORDER BY id'))[0]).toEqual(instances);expect((await db.c.query('SELECT * FROM hero_equipment ORDER BY owned_hero_id,slot'))[0]).toEqual(worn)
    expect(await applyEquipmentSetUpdate(db.c)).toBe(false)
    expect((await db.c.query("SELECT code,effect_config FROM item_definitions WHERE code IN ('official_trea_8000','official_trea_8001','bronze_ring')"))[0]).toEqual(rows)
  })
  it('十件套实际穿戴：同款左右戒指凑八件激活15%，十件25%，卸下回到八件档且面板属性一致',async()=>{
    await applyEquipmentSetUpdate(db.c)
    const [rows]=await db.c.query("SELECT id,effect_config FROM item_definitions WHERE JSON_UNQUOTE(JSON_EXTRACT(effect_config,'$.setCode'))='OFFICIAL_11'")
    const pieces=rows.map((r:any)=>({id:Number(r.id),slot:(typeof r.effect_config==='string'?JSON.parse(r.effect_config):r.effect_config).slot}))
    for(const p of pieces)await db.c.execute('INSERT INTO player_inventory (player_id,item_definition_id,quantity) VALUES (?,?,2) ON DUPLICATE KEY UPDATE quantity=quantity+2',[config.PLAYER_ID,p.id])
    for(const p of pieces.filter((p:any)=>p.slot!=='ARMOR'))await equipItem(heroId,p.slot,p.id)
    await equipItem(heroId,'RING_2',pieces.find((p:any)=>p.slot==='RING').id)
    const [base]=await db.c.query('SELECT h.*,o.level,o.talent_grade FROM owned_heroes o JOIN hero_definitions h ON h.id=o.hero_definition_id WHERE o.id=?',[heroId]),growth=await getGrowthRules()
    const verify=async(count:number,percent:number)=>{const h=(await getWorldStatus()).ownedHeroes.find(h=>h.id===heroId)!,set=equipmentSetStates(h.equipment)[0];expect(set.count).toBe(count);expect(set.tiers.find(t=>t.active)?.bonuses).toEqual({meleeAttack:percent});expect(equipmentBonuses(h.equipment).meleeAttack).toBe(percent);expect(h.stats).toEqual(statsFromRow(base[0],growth,5,{meleeAttack:percent},equipmentFlatBonuses(h.equipment)))}
    await verify(8,15)
    await equipItem(heroId,'ARMOR',pieces.find((p:any)=>p.slot==='ARMOR').id);await equipItem(heroId,'BRACELET_2',pieces.find((p:any)=>p.slot==='BRACELET').id);await verify(10,25)
    await equipItem(heroId,'BRACELET_2',null);await verify(9,15)
  })
  it('装备校准：更新基础值保留精炼孔位库存与自定义，重跑不覆盖后台修改',async()=>{
    const [before]=await db.c.query('SELECT * FROM equipment_instances ORDER BY id'),inventory=await getInventory()
    await db.c.execute("UPDATE item_definitions SET effect_config=JSON_SET(effect_config,'$.sourceStatus','DIY','$.flatBonuses.meleeDefense',12345) WHERE code='official_trea_8000'")
    await prepareSalvage()
    const [rows]=await db.c.query("SELECT code,effect_config FROM item_definitions WHERE code IN ('official_trea_10049','official_trea_8000','refine_advanced')")
    const cfg=(code:string)=>{const r=rows.find((r:any)=>r.code===code);return typeof r.effect_config==='string'?JSON.parse(r.effect_config):r.effect_config}
    expect(cfg('official_trea_10049').flatBonuses).toEqual({meleeDefense:3000,rangedDefense:3000});expect(cfg('official_trea_8000').flatBonuses.meleeDefense).toBe(12345)
    const [after]=await db.c.query('SELECT * FROM equipment_instances ORDER BY id');expect(after).toEqual(before)
    expect((await getInventory()).map(e=>[e.item.id,e.quantity,e.gear])).toEqual(inventory.map(e=>[e.item.id,e.quantity,e.gear]))
    await db.c.execute("UPDATE item_definitions SET effect_config=JSON_SET(effect_config,'$.flatBonuses.meleeDefense',3456) WHERE code='official_trea_10049'")
    expect(await applyEquipmentCalibration(db.c)).toBe(false)
    const [custom]=await db.c.query("SELECT effect_config FROM item_definitions WHERE code='official_trea_10049'");expect((typeof custom[0].effect_config==='string'?JSON.parse(custom[0].effect_config):custom[0].effect_config).flatBonuses.meleeDefense).toBe(3456)
  })
  it('批量分解：堆叠与精炼实例同时扣除，奖励实际入包；重试不再次扣装备',async()=>{
    await prepareSalvage();const itemId=await give('official_trea_10000',5),common=await give('refine_common'),advanced=await give('refine_advanced')
    await equipItem(heroId,'HELMET',itemId);const g=(await getWorldStatus()).ownedHeroes.find(h=>h.id===heroId)!.equipment[0].gear!
    await db.c.execute('UPDATE equipment_instances SET refine_level=9 WHERE id=?',[g.instanceId]);await equipItem(heroId,'HELMET',null)
    const before=await itemQuantity(itemId),normal=await itemQuantity(common),rare=await itemQuantity(advanced)
    const q={clientActionId:randomUUID(),targets:[{kind:'STACK',itemId,quantity:2},{kind:'INSTANCE',instanceId:g.instanceId}]}
    const result=await salvageEquipment(q);expect(result.pieces).toBe(3);expect(result.loot.find((r:any)=>r.itemId===common)?.quantity).toBe(24)
    expect(await itemQuantity(itemId)).toBe(before-2);expect(await itemQuantity(common)).toBe(normal+24)
    expect(await itemQuantity(advanced)).toBe(rare+(result.loot.find((r:any)=>r.itemId===advanced)?.quantity??0))
    const [gone]=await db.c.query('SELECT id FROM equipment_instances WHERE id=?',[g.instanceId]);expect(gone).toHaveLength(0)
    const snapshot=await getInventory();expect(await salvageEquipment(q)).toEqual(result);expect(await getInventory()).toEqual(snapshot)
    await expect(salvageEquipment({...q,targets:[{kind:'STACK',itemId,quantity:1}]})).rejects.toThrow('不匹配')
  })
  it('批量分解：已穿戴或镶石装备、非装备、库存不足全批回滚，原物品保留',async()=>{
    await prepareSalvage();const itemId=await give('official_trea_10000',5),water=await give('talent_water')
    await equipItem(heroId,'HELMET',itemId);const g=(await getWorldStatus()).ownedHeroes.find(h=>h.id===heroId)!.equipment[0].gear!
    const q={clientActionId:randomUUID(),targets:[{kind:'STACK',itemId,quantity:1},{kind:'INSTANCE',instanceId:g.instanceId}]}
    let inventory=await getInventory();await expect(salvageEquipment(q)).rejects.toThrow('已穿戴');expect(await getInventory()).toEqual(inventory)
    await equipItem(heroId,'HELMET',null);await db.c.execute('UPDATE equipment_instances SET sockets=1,gems_json=? WHERE id=?',[JSON.stringify([{itemId:water,name:'测试宝石',stat:'speed',amount:1}]),g.instanceId])
    inventory=await getInventory();await expect(salvageEquipment(q)).rejects.toThrow('取出宝石');expect(await getInventory()).toEqual(inventory)
    for(const target of [{kind:'STACK',itemId:water,quantity:1},{kind:'INSTANCE',instanceId:999999999}]){
      await expect(salvageEquipment({clientActionId:randomUUID(),targets:[{kind:'STACK',itemId,quantity:1},target]})).rejects.toThrow();expect(await getInventory()).toEqual(inventory)
    }
    const second=await give('official_trea_10001');await db.c.execute('UPDATE player_inventory SET quantity=0 WHERE player_id=? AND item_definition_id=?',[config.PLAYER_ID,second]);inventory=await getInventory()
    await expect(salvageEquipment({clientActionId:randomUUID(),targets:[{kind:'STACK',itemId,quantity:1},{kind:'STACK',itemId:second,quantity:1}]})).rejects.toThrow('数量不足');expect(await getInventory()).toEqual(inventory)
  })
  it('批量分解：HTTP真实入口校验和高级精炼石实际扣除，成功率加成生效',async()=>{
    await prepareSalvage();const itemId=await give('official_trea_10000',3),advanced=await give('refine_advanced',2)
    const app=Fastify();await registerApi(app)
    try{
      const payload={clientActionId:randomUUID(),targets:[{kind:'STACK',itemId,quantity:1}]}
      const response=await app.inject({method:'POST',url:'/api/forge/salvage',payload});expect(response.statusCode).toBe(200);expect(response.json().pieces).toBe(1)
      expect((await app.inject({method:'POST',url:'/api/forge/salvage',payload})).json()).toEqual(response.json())
      expect((await app.inject({method:'POST',url:'/api/forge/salvage',payload:{...payload,clientActionId:randomUUID(),targets:[]}})).statusCode).toBeGreaterThanOrEqual(400)
    }finally{await app.close()}
    await equipItem(heroId,'HELMET',itemId);const before=await itemQuantity(advanced)
    const result=await forgeItem(heroId,{slot:'HELMET',operation:'REFINE',materialId:advanced,clientActionId:randomUUID()})
    expect(result.success).toBe(true);expect(result.gear.refineLevel).toBe(1);expect(await itemQuantity(advanced)).toBe(before-1)
  })
  it('据点宝石数量：仅宝石条目改为1至1000，保留其他配置库存；重复更新不覆盖后台修改',async()=>{
    const [pools]=await db.c.query('SELECT * FROM drop_pools ORDER BY id'),ids=pools.filter((p:any)=>outpostGemPoolCodes.includes(p.code)).map((p:any)=>Number(p.id))
    const [gems]=await db.c.query("SELECT id FROM item_definitions WHERE item_type='MATERIAL' AND JSON_EXTRACT(effect_config,'$.gemLevel')>=1 AND JSON_EXTRACT(effect_config,'$.gemFamily') IS NOT NULL"),gemIds=new Set(gems.map((g:any)=>Number(g.id)))
    const [other]=await db.c.query("SELECT id FROM item_definitions WHERE code='talent_water'")
    await db.c.execute('INSERT INTO drop_pool_entries (pool_id,item_definition_id,weight,min_quantity,max_quantity,enabled) VALUES (?,?,17,7,9,0) ON DUPLICATE KEY UPDATE min_quantity=7,max_quantity=9',[ids[0],other[0].id])
    const [entries]=await db.c.query('SELECT * FROM drop_pool_entries ORDER BY pool_id,item_definition_id'),inventory=await getInventory()
    const affected=(e:any)=>ids.includes(Number(e.pool_id))&&gemIds.has(Number(e.item_definition_id))
    expect(entries.filter(affected).length).toBeGreaterThan(0)
    expect(await installOutpostGemQuantities()).toBe(true)
    const [after]=await db.c.query('SELECT * FROM drop_pool_entries ORDER BY pool_id,item_definition_id'),[nextPools]=await db.c.query('SELECT * FROM drop_pools ORDER BY id')
    expect(after).toEqual(entries.map((e:any)=>affected(e)?{...e,min_quantity:1,max_quantity:1000}:e))
    expect(nextPools).toEqual(pools);expect(await getInventory()).toEqual(inventory)
    await db.c.execute('UPDATE drop_pool_entries SET max_quantity=321 WHERE pool_id=?',[ids[0]])
    const [custom]=await db.c.query('SELECT * FROM drop_pool_entries ORDER BY pool_id,item_definition_id')
    expect(await applyOutpostGemQuantityUpdate(db.c)).toBe(false)
    const [unchanged]=await db.c.query('SELECT * FROM drop_pool_entries ORDER BY pool_id,item_definition_id');expect(unchanged).toEqual(custom)
  })
  it('据点宝石数量：普通与自动出征战报和实际入包一致，重试不重复发放',async()=>{
    await freezeDispatchTime(new Date('2027-01-01T00:00:00Z'));await installOutpostGemQuantities()
    await db.c.execute("UPDATE drop_pools SET enabled=(code IN ('gem_outpost_low','gem_outpost_mid','gem_outpost_high')),chance=1 WHERE node_type='OUTPOST'")
    const [strong]=await db.c.execute("INSERT INTO hero_definitions (code,name,star,attack_type,melee_attack,speed,load_capacity,description) VALUES (?,'事务测试英雄',6,'MELEE',20000000,5000,50000,'测试结束回滚')",['test_'+randomUUID()])
    await db.c.execute('UPDATE owned_heroes SET hero_definition_id=? WHERE id=?',[strong.insertId,heroId])
    const node=await makeOutpost(20),amounts=async()=>new Map((await getInventory()).map(e=>[e.item.id,e.quantity]))
    const random=vi.spyOn(SeededRandom.prototype,'next').mockReturnValue(.5)
    try{
      const check=async(id:number,arrival:Date)=>{
        const before=await amounts();await processMarch(id,arrival)
        const report=(await getWorldStatus()).reports[0],after=await amounts()
        expect(report.result).toBe('VICTORY');expect(report.loot).toHaveLength(1)
        const drop=report.loot![0];expect(drop.name).toMatch(/宝石$/);expect(drop.quantity).toBe(501)
        expect(after.get(drop.itemId)).toBe((before.get(drop.itemId)??0)+501)
        await processMarch(id,arrival);expect(await amounts()).toEqual(after)
      }
      const ordinary=await startMarch(heroId,node);await check(ordinary.id,new Date(ordinary.arriveGameAt));await processMarch(ordinary.id,new Date(ordinary.returnGameAt))
      await freezeDispatchTime(new Date(ordinary.returnGameAt))
      const auto=await startAutoFarm(heroId,'OUTPOST',19,19,1,[],node);await processFarm(auto.id,new Date(ordinary.returnGameAt))
      const march=await farmMarch(auto.id);await check(Number(march.id),new Date(march.arrive_game_at))
    }finally{random.mockRestore()}
  })
  async function installWildGems(){await db.c.execute('DELETE FROM schema_migrations WHERE version=?',[wildGemUpdateVersion]);return applyWildGemUpdate(db.c)}
  it('野地宝石：一次性新增五系一级池，数量1至1000，重跑不覆盖自定义且不改其他池库存',async()=>{
    const [before]=await db.c.query("SELECT p.*,e.item_definition_id,e.weight,e.min_quantity,e.max_quantity,e.enabled entry_enabled FROM drop_pools p JOIN drop_pool_entries e ON e.pool_id=p.id WHERE p.code<>'gem_wild' ORDER BY p.id,e.item_definition_id")
    const inventory=await getInventory();expect(await installWildGems()).toBe(true)
    const [rows]=await db.c.query("SELECT p.*,e.min_quantity,e.max_quantity,i.effect_config FROM drop_pools p JOIN drop_pool_entries e ON e.pool_id=p.id JOIN item_definitions i ON i.id=e.item_definition_id WHERE p.code='gem_wild'")
    expect(rows).toHaveLength(5);for(const r of rows){expect(Number(r.min_quantity)).toBe(1);expect(Number(r.max_quantity)).toBe(1000);expect((typeof r.effect_config==='string'?JSON.parse(r.effect_config):r.effect_config).gemLevel).toBe(1)}
    await db.c.execute('UPDATE drop_pools SET chance=0.4 WHERE id=?',[rows[0].id])
    await db.c.execute('UPDATE drop_pool_entries SET max_quantity=321 WHERE pool_id=?',[rows[0].id])
    expect(await applyWildGemUpdate(db.c)).toBe(false)
    const custom=(await listDropPools()).find(p=>p.id===Number(rows[0].id))!;expect(custom.chance).toBe(.4);expect(custom.entries.every(e=>e.maxQuantity===321)).toBe(true)
    const [after]=await db.c.query("SELECT p.*,e.item_definition_id,e.weight,e.min_quantity,e.max_quantity,e.enabled entry_enabled FROM drop_pools p JOIN drop_pool_entries e ON e.pool_id=p.id WHERE p.code<>'gem_wild' ORDER BY p.id,e.item_definition_id")
    expect(after).toEqual(before);expect(await getInventory()).toEqual(inventory)
  })
  it('野地宝石：后台保存接受1000并拒绝越界与小数，读取仍为真实配置',async()=>{
    await installWildGems();const [r]=await db.c.query("SELECT id FROM drop_pools WHERE code='gem_wild'"),pool=(await listDropPools()).find(p=>p.id===Number(r[0].id))!
    const app=Fastify();await registerApi(app)
    try{
      expect((await app.inject({method:'PUT',url:'/api/admin/drop-pools/'+pool.id,payload:pool})).statusCode).toBe(200)
      for(const n of [1001,0,-1,2.5]){const bad={...pool,entries:pool.entries.map(e=>({...e,maxQuantity:n}))};expect((await app.inject({method:'PUT',url:'/api/admin/drop-pools/'+pool.id,payload:bad})).statusCode).toBeGreaterThanOrEqual(400)}
      expect((await listDropPools()).find(p=>p.id===pool.id)).toEqual(pool)
    }finally{await app.close()}
  })
  it('野地宝石：普通和自动战斗实际批量入包，与战报一致；重复处理不重复发放',async()=>{
    await freezeDispatchTime(new Date('2027-01-01T00:00:00Z'));await installWildGems()
    const node=await makeOutpost(3);await db.c.execute("UPDATE map_nodes SET node_type='WILD',garrison_config='{\"power\":1}' WHERE id=?",[node])
    const amounts=async()=>new Map((await getInventory()).map(e=>[e.item.id,e.quantity]))
    const check=async(m:any,arrival:Date)=>{
      const before=await amounts();await processMarch(Number(m.id),arrival);const report=(await getWorldStatus()).reports[0],after=await amounts()
      expect(report.result).toBe('VICTORY');expect(report.loot).toHaveLength(1)
      const drop=report.loot![0];expect(drop.name).toMatch(/^1级.+宝石$/);expect(drop.quantity).toBeGreaterThanOrEqual(1);expect(drop.quantity).toBeLessThanOrEqual(1000)
      expect(after.get(drop.itemId)).toBe((before.get(drop.itemId)??0)+drop.quantity)
      await processMarch(Number(m.id),arrival);expect(await amounts()).toEqual(after)
    }
    const ordinary=await startMarch(heroId,node);await check(ordinary,new Date(ordinary.arriveGameAt));await processMarch(ordinary.id,new Date(ordinary.returnGameAt))
    await freezeDispatchTime(new Date(ordinary.returnGameAt))
    const auto=await startAutoFarm(heroId,'WILD',2,2,1,[],node);await processFarm(auto.id,new Date(ordinary.returnGameAt));const m=await farmMarch(auto.id);await check(m,new Date(m.arrive_game_at))
  })
  it('野地宝石：战败不掉宝石也不增加库存',async()=>{
    await installWildGems();const node=await makeOutpost(3);await db.c.execute("UPDATE map_nodes SET node_type='WILD',garrison_config='{\"power\":1000000000000}' WHERE id=?",[node])
    const before=await getInventory(),m=await startMarch(heroId,node);await processMarch(m.id,new Date(m.arriveGameAt))
    expect((await getWorldStatus()).reports[0]).toMatchObject({result:'DEFEAT',loot:[]});expect(await getInventory()).toEqual(before)
  })
  it('流放与斩首隐藏武将、移除技能、装备退仓，不准继续培养',async()=>{
    const id=await give('bronze_helmet');await equipItem(heroId,'HELMET',id);await learnHeroSkill(heroId,1,skillId)
    await expect(retireHero(heroId,'EXILE','不是本英雄')).rejects.toThrow('不一致')
    await retireHero(heroId,'EXILE','章邯')
    expect((await getWorldStatus()).ownedHeroes.some(h=>h.id===heroId)).toBe(false)
    const [skills]=await db.c.query('SELECT * FROM owned_hero_skills WHERE owned_hero_id=?',[heroId]);expect(skills).toHaveLength(0)
    expect((await getWorldStatus()).inventory.some(i=>i.item.id===id&&i.quantity>0)).toBe(true)
    await expect(trainHero(heroId)).rejects.toThrow('英雄不存在')
  })
  it('数据库仅保留最新50条战报，清空真正删除，事务最终回滚',async()=>{
    const ids:number[]=[]
    for(let i=0;i<55;i++){const [r]=await db.c.execute("INSERT INTO battle_reports (player_id,title,result,battle_config,occurred_game_at) VALUES (?,'测试战报','VICTORY','{}',UTC_TIMESTAMP(3))",[config.PLAYER_ID]);ids.push(Number(r.insertId))}
    await pruneReports(db.c)
    const [rows]=await db.c.query("SELECT id FROM battle_reports WHERE player_id=? AND direction='OUTGOING' ORDER BY id DESC",[config.PLAYER_ID]);expect(rows).toHaveLength(50);expect(rows.map((r:any)=>Number(r.id))).toEqual(ids.slice(-50).reverse())
    await clearReports();const [empty]=await db.c.query("SELECT id FROM battle_reports WHERE player_id=? AND direction='OUTGOING'",[config.PLAYER_ID]);expect(empty).toHaveLength(0)
  })
  it('刷新据点不删除历史行军目标，也不改变在途目标',async()=>{
    const n=[{id:await makeOutpost(10),level:10}],march=await startMarch(heroId,Number(n[0].id))
    await refreshMap()
    const [node]=await db.c.query('SELECT level FROM map_nodes WHERE id=?',[n[0].id]);expect(Number(node[0].level)).toBe(Number(n[0].level))
    expect((await getWorldStatus()).marches.some(m=>m.id===march.id)).toBe(true)
  })
  it('据点高等级权重同时用于手动与定时刷新，保护在途目标且野地城池规则不变',async()=>{
    const node=await makeOutpost(3);await startMarch(heroId,node)
    const random=vi.spyOn(Math,'random').mockReturnValue(.9)
    try{
      await refreshMap()
      const [all]=await db.c.query('SELECT id,node_type,level,garrison_config FROM map_nodes')
      expect(Number(all.find((r:any)=>Number(r.id)===node).level)).toBe(3)
      const outposts=all.filter((r:any)=>r.node_type==='OUTPOST'&&Number(r.id)!==node)
      expect(outposts.length).toBeGreaterThan(0);expect(outposts.every((r:any)=>Number(r.level)===20)).toBe(true)
      expect(all.filter((r:any)=>['WILD','RANDOM_CITY'].includes(r.node_type)).every((r:any)=>Number(r.level)===5)).toBe(true)
      random.mockReturnValue(.4);await runScheduledTask('refresh-outposts',randomUUID())
      const [after]=await db.c.query('SELECT id,node_type,level,garrison_config FROM map_nodes')
      expect(after.filter((r:any)=>r.node_type!=='OUTPOST')).toEqual(all.filter((r:any)=>r.node_type!=='OUTPOST'))
      expect(Number(after.find((r:any)=>Number(r.id)===node).level)).toBe(3)
      expect(after.filter((r:any)=>r.node_type==='OUTPOST'&&Number(r.id)!==node).every((r:any)=>Number(r.level)===16)).toBe(true)
    }finally{random.mockRestore()}
  })
  it('结构总文件包含实库新增字段，官方44技能均有11级数据',async()=>{
    const schema=readFileSync('database/schema.sql','utf8')
    for(const table of ['tavern_pools','tavern_pool_entries','tavern_refreshes','tavern_candidates','hero_definitions','skill_definitions','item_definitions','owned_heroes','hero_equipment','equipment_instances','forge_operations','drop_pools','drop_pool_entries','item_use_logs','battle_reports','scheduled_task_runs','military_definitions','player_forces','military_orders','march_orders','auto_farm_jobs','admin_resource_grants','military_upkeep']){
      const [fields]=await db.c.query('SHOW COLUMNS FROM '+table),part=schema.split('CREATE TABLE IF NOT EXISTS `'+table+'`')[1]?.split('ENGINE=')[0]??''
      for(const f of fields)expect(part).toContain('`'+f.Field+'`')
    }
    const skills=await listSkills();expect(skills).toHaveLength(44);expect(skills.every(s=>s.levels?.length===11)).toBe(true);expect(skills.find(s=>s.code==='lingwu')!.enabled).toBe(false)
    const [descs]=await db.c.query('SELECT description FROM skill_definitions');expect(descs.every((s:any)=>!/[估算]|腾讯官网/.test(s.description))).toBe(true)
  })

  it('地图散布：刷新重新分散普通目标，投影图标不重叠，在途目标坐标属性都不变',async()=>{
    await freezeDispatchTime(new Date('2027-01-01T00:00:00Z'));await refreshMap()
    const [before]=await db.c.query('SELECT * FROM map_nodes ORDER BY id'),wild=before.find((r:any)=>r.node_type==='WILD'&&!isWorldBoss(r.garrison_config))
    await startMarch(heroId,Number(wild.id));await refreshMap();const [after]=await db.c.query('SELECT * FROM map_nodes ORDER BY id')
    expect(after.find((r:any)=>r.id===wild.id)).toEqual(wild)
    const moving=after.filter((r:any)=>['OUTPOST','WILD','RANDOM_CITY'].includes(r.node_type)&&r.id!==wild.id&&!isWorldBoss(r.garrison_config))
    expect(moving.some((r:any)=>{const old=before.find((b:any)=>b.id===r.id);return old&&(r.x!==old.x||r.y!==old.y)})).toBe(true)
    for(const row of moving){expect(mapClearance(row,{x:50,y:50})).toBeGreaterThanOrEqual(1);for(const other of after.filter((r:any)=>r.id!==row.id))expect(mapClearance(row,other)).toBeGreaterThanOrEqual(1)}
  })
  it('地图散布：布局写入失败整批回滚，不留下暂存坐标或改变在途目标',async()=>{
    await refreshMap();const [before]=await db.c.query('SELECT * FROM map_nodes ORDER BY id'),execute=db.c.execute.bind(db.c)
    db.c.execute=async(sql:string,args:any[])=>{if(sql.startsWith('UPDATE map_nodes SET name='))throw Error('测试布局保存失败');return execute(sql,args)}
    try{await expect(refreshMap()).rejects.toThrow('测试布局保存失败')}finally{db.c.execute=execute}
    const [after]=await db.c.query('SELECT * FROM map_nodes ORDER BY id');expect(after).toEqual(before)
  })
  async function makeBoss(){const id=await makeOutpost(WORLD_BOSS_LEVEL);await db.c.execute("UPDATE map_nodes SET node_type='WILD',name='事务测试世界首领',defense_bias='BALANCED',garrison_config=? WHERE id=?",[JSON.stringify({worldBoss:true,power:WORLD_BOSS_POWER}),id]);return id}
  async function bossRows(){const [r]=await db.c.query("SELECT * FROM map_nodes WHERE JSON_EXTRACT(garrison_config,'$.worldBoss')=true ORDER BY id");return r}
  async function isolateBossSpawns(){await db.c.execute("UPDATE map_nodes SET garrison_config=JSON_REMOVE(garrison_config,'$.worldBoss') WHERE JSON_EXTRACT(garrison_config,'$.worldBoss')=true")}
  it('世界首领：一次性启用规则，不刷新地图或发奖，重跑保留管理员调整',async()=>{
    await db.c.execute('DELETE FROM schema_migrations WHERE version=?',[worldBossUpdateVersion]);await db.c.execute("DELETE FROM game_settings WHERE setting_key='world_boss_rules'")
    const [nodes]=await db.c.query('SELECT * FROM map_nodes ORDER BY id'),inventory=await getInventory()
    expect(await applyWorldBossUpdate(db.c)).toBe(true);expect(await getWorldBossRules()).toEqual(defaultWorldBossRules)
    expect(await getInventory()).toEqual(inventory);const [after]=await db.c.query('SELECT * FROM map_nodes ORDER BY id');expect(after).toEqual(nodes)
    await saveWorldBossRules({...defaultWorldBossRules,spawnChance:.42});expect(await applyWorldBossUpdate(db.c)).toBe(false);expect((await getWorldBossRules()).spawnChance).toBe(.42)
  })
  it('世界首领：普通刷新概率生成额外200级目标，最多一只且已有首领不被刷新覆盖',async()=>{
    await isolateBossSpawns();await saveWorldBossRules({...defaultWorldBossRules,spawnChance:1})
    await runScheduledTask('refresh-random-cities',randomUUID());expect(await bossRows()).toHaveLength(0)
    await refreshMap();const rows=await bossRows();expect(rows).toHaveLength(1);expect(Number(rows[0].level)).toBe(200)
    const w=await getBootstrap(),boss=w.mapNodes.find(n=>n.id===Number(rows[0].id))!;expect(boss.worldBoss).toBe(true);expect(boss.meleeDefense).toBe(WORLD_BOSS_POWER);expect(boss.rangedDefense).toBe(WORLD_BOSS_POWER)
    expect(w.mapNodes.filter(n=>n.nodeType==='WILD'&&!n.worldBoss).length).toBeGreaterThanOrEqual(4)
    await refreshMap();expect(await bossRows()).toEqual(rows)
    await saveWorldBossRules({...defaultWorldBossRules,enabled:false});await refreshMap();expect(await bossRows()).toEqual(rows)
  })
  it.each([['refresh-outposts','OUTPOST'],['refresh-wilds','WILD']] as const)('世界首领：%s GET定时刷新抽取，概率边界与调度去重正确，不修改其他普通目标',async(task,type)=>{
    await isolateBossSpawns();await saveWorldBossRules(defaultWorldBossRules)
    const unaffected="SELECT * FROM map_nodes WHERE node_type<>? AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(garrison_config,'$.worldBoss')),'false')<>'true' ORDER BY id"
    const [before]=await db.c.query(unaffected,[type]),random=vi.spyOn(Math,'random').mockReturnValue(.2),app=Fastify()
    await registerScheduledTasks(app)
    const run=async(key=randomUUID())=>{const response=await app.inject({method:'GET',url:taskPath(task)+'?requestId='+key,headers:{authorization:'Bearer '+config.SCHEDULER_TOKEN}});expect(response.statusCode).toBe(200);return response.json()}
    try{
      await run();expect(await bossRows()).toHaveLength(0)
      random.mockReturnValue(.199999);const key=randomUUID();await run(key);const spawned=await bossRows();expect(spawned).toHaveLength(1)
      expect((await run(key)).replayed).toBe(true);expect(await bossRows()).toEqual(spawned)
      await run();expect(await bossRows()).toEqual(spawned)
      const boss=(await getBootstrap()).mapNodes.find(n=>n.id===Number(spawned[0].id))!;expect(boss.worldBoss).toBe(true);expect(boss.level).toBe(200)
      const [after]=await db.c.query(unaffected,[type]);expect(after).toEqual(before)
    }finally{random.mockRestore();await app.close()}
  })
  it.each(['refresh-outposts','refresh-wilds'] as const)('世界首领：%s 遵守关闭开关与零概率',async task=>{
    await isolateBossSpawns();const random=vi.spyOn(Math,'random').mockReturnValue(0)
    try{
      await saveWorldBossRules({...defaultWorldBossRules,enabled:false,spawnChance:1});await runScheduledTask(task,randomUUID());expect(await bossRows()).toHaveLength(0)
      await saveWorldBossRules({...defaultWorldBossRules,spawnChance:0});await runScheduledTask(task,randomUUID());expect(await bossRows()).toHaveLength(0)
    }finally{random.mockRestore()}
  })
  it('世界首领：败战不降级不掉落，重复处理不重复战报',async()=>{
    const node=await makeBoss(),before=await getInventory(),m=await startMarch(heroId,node)
    await processMarch(m.id,new Date(m.arriveGameAt));const row=(await targetRows(node))[0];expect(Number(row.level)).toBe(200);expect(row.status).toBe('ACTIVE')
    const report=(await getWorldStatus()).reports[0];expect(report.result).toBe('DEFEAT');expect(report.targetLevelBefore).toBe(200);expect(report.targetLevelAfter).toBe(200);expect(report.loot).toEqual([]);expect(await getInventory()).toEqual(before)
    await processMarch(m.id,new Date(m.arriveGameAt));expect((await getWorldStatus()).reports[0].id).toBe(report.id)
  })
  it('世界首领：首杀掉落真实批量入包，技能书独立入库；第二队空返且重试不再发奖',async()=>{
    await freezeDispatchTime(new Date('2027-01-01T00:00:00Z'));await saveWorldBossRules({...defaultWorldBossRules,itemChance:1})
    await db.c.execute('UPDATE hero_definitions SET melee_attack=2000000000 WHERE id=(SELECT hero_definition_id FROM owned_heroes WHERE id=?)',[heroId])
    const node=await makeBoss(),second=await secondDispatchHero()
    await db.c.execute("UPDATE item_definitions SET enabled=0 WHERE code='talent_water'");await db.c.execute("UPDATE item_definitions SET deleted_at=UTC_TIMESTAMP() WHERE code='official_trea_10000'")
    const [hidden]=await db.c.query("SELECT id FROM item_definitions WHERE code IN ('talent_water','official_trea_10000','skill_book_xueyuan')"),hiddenIds=hidden.map((r:any)=>Number(r.id))
    const amounts=async()=>new Map((await getInventory()).filter(e=>!e.gear).map(e=>[e.item.id,e.quantity])),before=await amounts()
    const one=await startMarch(heroId,node),two=await startMarch(second,node),random=vi.spyOn(SeededRandom.prototype,'next').mockReturnValue(.5)
    try{
      await processMarch(one.id,new Date(one.arriveGameAt));const report=(await getWorldStatus()).reports[0];expect(report.result).toBe('VICTORY');expect(report.targetLevelAfter).toBe(0)
      expect(report.loot!.length).toBeGreaterThan(100);expect(report.loot!.some(l=>hiddenIds.includes(l.itemId))).toBe(false)
      const after=await amounts();for(const loot of report.loot!)expect(after.get(loot.itemId)).toBe((before.get(loot.itemId)??0)+loot.quantity)
      const [gems]=await db.c.query("SELECT id,effect_config FROM item_definitions WHERE item_type='MATERIAL' AND JSON_EXTRACT(effect_config,'$.gemStat') IS NOT NULL")
      let levelOne=0
      for(const gem of gems){const cfg=typeof gem.effect_config==='string'?JSON.parse(gem.effect_config):gem.effect_config,id=Number(gem.id);if(cfg.gemLevel===1){levelOne++;expect(report.loot!.find(l=>l.itemId===id)?.quantity).toBe(5500)}else{expect(report.loot!.some(l=>l.itemId===id)).toBe(false);expect(after.get(id)).toBe(before.get(id))}}
      expect(levelOne).toBe(5)
      expect((await getBootstrap()).mapNodes.some(n=>n.id===node)).toBe(false)
      await processMarch(one.id,new Date(one.arriveGameAt));await processMarch(two.id,new Date(two.arriveGameAt));expect(await amounts()).toEqual(after)
      const [secondResult]=await db.c.query('SELECT result_config FROM march_orders WHERE id=?',[two.id]);expect(JSON.stringify(secondResult[0].result_config)).toContain('TARGET_GONE')
      await processMarch(one.id,new Date(one.returnGameAt));expect(await targetRows(node)).toHaveLength(1)
      await processMarch(two.id,new Date(two.returnGameAt));expect(await targetRows(node)).toHaveLength(0);expect(await amounts()).toEqual(after)
    }finally{random.mockRestore()}
  })
  it('世界首领：不允许自动刷野，旧无指定目标任务也不会误选首领',async()=>{
    const node=await makeBoss()
    await db.c.execute('UPDATE map_nodes SET level=88 WHERE id=?',[node])
    await expect(startAutoFarm(heroId,'WILD',1,100,10,[],node)).rejects.toThrow('不能自动刷野')
    await db.c.execute("UPDATE map_nodes SET status='LOCKED' WHERE node_type='WILD' AND id<>?",[node])
    const job=await startAutoFarm(heroId,'WILD',1,200,10)
    const [row]=await db.c.query('SELECT next_run_game_at FROM auto_farm_jobs WHERE id=?',[job.id]);await processFarm(job.id,new Date(row[0].next_run_game_at))
    expect((await farmRow(job.id)).status).toBe('COMPLETED');expect(Number((await targetRows(node))[0].level)).toBe(88)
  })
  it('世界首领：后台HTTP读取保存与范围校验，关闭后不生成，已有普通掉落池不变',async()=>{
    await isolateBossSpawns();const pools=await listDropPools(),app=Fastify();await registerApi(app)
    try{
      expect((await app.inject('/api/admin/world-boss')).statusCode).toBe(200)
      const rules={...defaultWorldBossRules,enabled:false,spawnChance:1,itemChance:.95}
      expect((await app.inject({method:'PUT',url:'/api/admin/world-boss',payload:rules})).json()).toEqual(rules)
      expect((await app.inject({method:'PUT',url:'/api/admin/world-boss',payload:{...rules,itemChance:2}})).statusCode).toBeGreaterThanOrEqual(400)
      expect(await getWorldBossRules()).toEqual(rules);await refreshMap();expect(await bossRows()).toHaveLength(0);expect(await listDropPools()).toEqual(pools)
    }finally{await app.close()}
  })
  it('首领限时：生成五分钟期限，刷新与旧存档初始化不续期；到点隐藏清理，不发奖励',async()=>{
    await isolateBossSpawns();const start=new Date('2027-01-01T00:00:00Z'),end=new Date(start.getTime()+300000);await freezeDispatchTime(start)
    await saveWorldBossRules({...defaultWorldBossRules,spawnChance:1});await refreshMap();const boss=(await getBootstrap()).mapNodes.find(n=>n.worldBoss)!
    expect(boss.expiresGameAt).toBe(end.toISOString());const before=await getInventory(),reports=(await getWorldStatus()).reports
    await freezeDispatchTime(new Date(end.getTime()-1));await refreshMap();expect((await getBootstrap()).mapNodes.find(n=>n.id===boss.id)?.expiresGameAt).toBe(end.toISOString())
    await freezeDispatchTime(end);expect((await getBootstrap()).mapNodes.some(n=>n.id===boss.id)).toBe(false)
    await maintainWorldBosses(db.c,end);expect(await targetRows(boss.id)).toHaveLength(0);expect(await getInventory()).toEqual(before);expect((await getWorldStatus()).reports).toEqual(reports)
    await refreshMap();const next=(await getBootstrap()).mapNodes.find(n=>n.worldBoss)!;expect(next.id).not.toBe(boss.id);expect(next.expiresGameAt).toBe(new Date(end.getTime()+300000).toISOString())
    const old=await makeBoss();await maintainWorldBosses(db.c,end);const [row]=await targetRows(old);await maintainWorldBosses(db.c,new Date(end.getTime()+10000));expect((await targetRows(old))[0].garrison_config).toEqual(row.garrison_config)
  })
  it('首领限时：到点抵达空返，英雄士兵不受损；过期节点保留行军坐标但不阻止新首领',async()=>{
    await isolateBossSpawns();const start=new Date('2027-01-01T00:00:00Z'),end=new Date(start.getTime()+300000),back=new Date(end.getTime()+60000);await freezeDispatchTime(start)
    const node=await makeBoss(),d=await testUnit();await forceDelta(db.c,d.code,10);const m=await startMarch(heroId,node,[{code:d.code,quantity:4}]);const before=await getInventory(),reports=(await getWorldStatus()).reports,original=(await targetRows(node))[0]
    await db.c.execute('UPDATE march_orders SET arrive_game_at=?,return_game_at=? WHERE id=?',[end,back,m.id]);await freezeDispatchTime(end)
    await processMarch(m.id,end);expect((await getWorldStatus()).marches.find(x=>x.id===m.id)?.result).toBe('TARGET_GONE');expect((await getWorldStatus()).reports).toEqual(reports);expect(await getInventory()).toEqual(before)
    expect((await targetRows(node))[0]).toMatchObject({status:'DEPLETED',level:0,x:original.x,y:original.y});expect(await unitQuantity(d.code)).toBe(6)
    await saveWorldBossRules({...defaultWorldBossRules,spawnChance:1});await refreshMap();expect((await getBootstrap()).mapNodes.filter(n=>n.worldBoss)).toHaveLength(1);expect((await getBootstrap()).mapNodes.find(n=>n.worldBoss)?.id).not.toBe(node)
    await processMarch(m.id,back);await processMarch(m.id,back);expect(await unitQuantity(d.code)).toBe(10);expect(await targetRows(node)).toHaveLength(0)
  })
  it('首领限时：没有浏览器请求或行军，后台时钟到点同样自动清理',async()=>{
    await isolateBossSpawns();const start=new Date('2027-01-01T00:00:00Z');await freezeDispatchTime(start);await saveWorldBossRules({...defaultWorldBossRules,spawnChance:1});await refreshMap()
    const boss=(await getBootstrap()).mapNodes.find(n=>n.worldBoss)!,normal=(await getBootstrap()).mapNodes.filter(n=>!n.worldBoss).map(n=>n.id)
    await freezeDispatchTime(new Date(start.getTime()+299000));await processDueWorldWork();expect(await targetRows(boss.id)).toHaveLength(1)
    await freezeDispatchTime(new Date(start.getTime()+300000));await processDueWorldWork();expect(await targetRows(boss.id)).toHaveLength(0)
    expect((await getBootstrap()).mapNodes.map(n=>n.id)).toEqual(normal)
  })
  it('首领限时：离线补算保留期限内已经抵达的战斗，过期后不能新派遣',async()=>{
    const start=new Date('2027-01-01T00:00:00Z'),end=new Date(start.getTime()+300000);await freezeDispatchTime(start)
    const node=await makeBoss(),m=await startMarch(heroId,node);expect(new Date(m.arriveGameAt).getTime()).toBeLessThan(end.getTime())
    await freezeDispatchTime(end);await maintainWorldBosses(db.c,end);expect((await targetRows(node))[0].status).toBe('ACTIVE');expect((await getBootstrap()).mapNodes.some(n=>n.id===node)).toBe(false)
    const before=(await getWorldStatus()).reports.length;await processMarch(m.id,end);expect((await getWorldStatus()).reports.length).toBe(Math.min(50,before+1));expect((await getWorldStatus()).reports[0].result).toBe('DEFEAT');expect(await targetRows(node)).toHaveLength(0)
    await expect(startMarch(heroId,node)).rejects.toThrow('目标不存在');await processMarch(m.id,end);expect((await getWorldStatus()).reports.length).toBe(Math.min(50,before+1))
  })
  it('首领强度：HTTP保存自定义等级双防，地图与实际战斗一致；已出现首领不被后台修改',async()=>{
    await isolateBossSpawns();await freezeDispatchTime(new Date('2027-01-01T00:00:00Z'));const app=Fastify();await registerApi(app)
    const custom={...defaultWorldBossRules,level:88,meleeDefense:1000000000,rangedDefense:9000000000,spawnChance:1},random=vi.spyOn(SeededRandom.prototype,'next').mockReturnValue(.5)
    try{
      expect((await app.inject({method:'PUT',url:'/api/admin/world-boss',payload:custom})).json()).toEqual(custom);await refreshMap()
      const boss=(await getBootstrap()).mapNodes.find(n=>n.worldBoss)!;expect(boss).toMatchObject({level:88,meleeDefense:custom.meleeDefense,rangedDefense:custom.rangedDefense})
      await saveWorldBossRules({...custom,level:1,meleeDefense:1,rangedDefense:1});await refreshMap();expect((await getBootstrap()).mapNodes.find(n=>n.id===boss.id)).toEqual(boss)
      const m=await startMarch(heroId,boss.id);await processMarch(m.id,new Date(m.arriveGameAt));expect((await getWorldStatus()).reports[0]).toMatchObject({result:'DEFEAT',meleeDefense:custom.meleeDefense,rangedDefense:custom.rangedDefense,targetLevelAfter:88})
      expect((await targetRows(boss.id))[0].level).toBe(88)
      for(const change of [{level:1001},{meleeDefense:0},{rangedDefense:1e12+1}])expect((await app.inject({method:'PUT',url:'/api/admin/world-boss',payload:{...custom,...change}})).statusCode).toBeGreaterThanOrEqual(400)
    }finally{random.mockRestore();await app.close()}
  })
  async function makeOutpost(level:number){const [coords]=await db.c.query('SELECT MAX(x) x FROM map_nodes');const [r]=await db.c.execute("INSERT INTO map_nodes (node_type,name,level,x,y,garrison_config,reward_config) VALUES ('OUTPOST','事务测试据点',?,?,0,'{}','{\"food\":100}')",[level,Number(coords[0].x)+1]);return Number(r.insertId)}
  it('五个GET地址贯通真实数据库并能使用URL编号去重，测试全部回滚',async()=>{
    const app=Fastify();await registerScheduledTasks(app)
    try{for(const task of scheduledTasks){const requestId=randomUUID(),url=taskPath(task.id)+'?requestId='+requestId,headers=config.SCHEDULER_TOKEN?{authorization:'Bearer '+config.SCHEDULER_TOKEN}:{}
      const first=await app.inject({method:'GET',url,headers});expect(first.statusCode).toBe(200);expect(first.json()).toMatchObject({ok:true,taskId:task.id,requestId,replayed:false});expect(first.headers['cache-control']).toContain('no-store')
      const second=await app.inject({method:'GET',url,headers});expect(second.statusCode).toBe(200);expect(second.json()).toEqual({...first.json(),replayed:true})
    }}finally{await app.close()}
  })
  it('调度只刷新指定类型；保护在途目标；同一调度号重试不刷新，历史有最近成功结果',async()=>{
    const nodeId=await makeOutpost(20),march=await startMarch(heroId,nodeId)
    const [before]=await db.c.query('SELECT * FROM map_nodes ORDER BY id'),requestId=randomUUID()
    const result=await runScheduledTask('refresh-outposts',requestId);expect(result.ok).toBe(true);expect(result.replayed).toBe(false)
    const [after]=await db.c.query('SELECT * FROM map_nodes ORDER BY id')
    expect(after.filter((n:any)=>n.node_type!=='OUTPOST'||Number(n.id)===nodeId)).toEqual(before.filter((n:any)=>n.node_type!=='OUTPOST'||Number(n.id)===nodeId))
    expect(after.filter((n:any)=>n.node_type==='OUTPOST'&&Number(n.id)!==nodeId).every((n:any)=>Number(n.generation)===result.generation&&n.level>=1&&n.level<=20)).toBe(true)
    const replay=await runScheduledTask('refresh-outposts',requestId);expect(replay.replayed).toBe(true);expect(replay.generation).toBe(result.generation)
    const [unchanged]=await db.c.query('SELECT * FROM map_nodes ORDER BY id');expect(unchanged).toEqual(after)
    expect((await getWorldStatus()).marches.some(m=>m.id===march.id)).toBe(true)
    expect((await listScheduledTasks()).tasks.find(t=>t.id==='refresh-outposts')!.lastSuccess?.requestId).toBe(requestId)
    const next=await runScheduledTask('refresh-outposts',randomUUID());expect(next.generation).toBeGreaterThan(result.generation!)
  })
  it('指定野地或随机城池任务不触碰其他目标',async()=>{
    for(const [task,type] of [['refresh-wilds','WILD'],['refresh-random-cities','RANDOM_CITY']] as const){const [before]=await db.c.query('SELECT * FROM map_nodes WHERE node_type<>? ORDER BY id',[type]);await runScheduledTask(task,randomUUID());const [after]=await db.c.query('SELECT * FROM map_nodes WHERE node_type<>? ORDER BY id',[type]);expect(after).toEqual(before)}
  })
  it('调度记录写入失败时，地图刷新整体回滚，可以安全重试',async()=>{
    const [before]=await db.c.query('SELECT * FROM map_nodes ORDER BY id'),requestId=randomUUID(),execute=db.c.execute.bind(db.c)
    const spy=vi.spyOn(db.c,'execute').mockImplementation((...args:any[])=>{if(String(args[0]).startsWith('INSERT INTO scheduled_task_runs'))throw Error('模拟写入失败');return execute(...args)})
    try{await expect(runScheduledTask('refresh-map',requestId)).rejects.toThrow('模拟写入失败')}finally{spy.mockRestore()}
    const [after]=await db.c.query('SELECT * FROM map_nodes ORDER BY id');expect(after).toEqual(before)
    const [runs]=await db.c.query('SELECT id FROM scheduled_task_runs WHERE request_key=?',[requestId]);expect(runs).toHaveLength(0)
    expect((await runScheduledTask('refresh-map',requestId)).replayed).toBe(false)
  })
  it('调度成功记录最多50条，执行清理不删除被攻击战报和自动任务',async()=>{
    const [r]=await db.c.execute("INSERT INTO battle_reports (player_id,direction,title,result,battle_config,occurred_game_at) VALUES (?,'INCOMING','调度保留测试','DEFEAT','{}',UTC_TIMESTAMP(3))",[config.PLAYER_ID]),[jobsBefore]=await db.c.query('SELECT * FROM auto_farm_jobs WHERE player_id=? ORDER BY id',[config.PLAYER_ID])
    for(let i=0;i<51;i++)await db.c.execute("INSERT INTO scheduled_task_runs (player_id,task_code,request_key,result_json,completed_at) VALUES (?,'cleanup-records',?,'{}',UTC_TIMESTAMP(3))",[config.PLAYER_ID,randomUUID()])
    await runScheduledTask('cleanup-records',randomUUID())
    const [logs]=await db.c.query("SELECT id FROM scheduled_task_runs WHERE player_id=? AND task_code='cleanup-records'",[config.PLAYER_ID]);expect(logs).toHaveLength(50)
    const [reports]=await db.c.query('SELECT id FROM battle_reports WHERE id=?',[r.insertId]);expect(reports).toHaveLength(1)
    const [jobsAfter]=await db.c.query('SELECT * FROM auto_farm_jobs WHERE player_id=? ORDER BY id',[config.PLAYER_ID]);expect(jobsAfter).toEqual(jobsBefore)
  })
  it('战败同样降级，1级消失；其他已出发行军空返不重复战斗，返城清理数据库',async()=>{
    const nodeId=await makeOutpost(20),first=await startMarch(heroId,nodeId)
    await processMarch(first.id,new Date(new Date(first.arriveGameAt).getTime()+1))
    let w=await getWorldStatus();expect(w.reports[0].result).toBe('DEFEAT');expect(w.reports[0].outpostLevelAfter).toBe(19)
    await processMarch(first.id,new Date(w.marches.find(m=>m.id===first.id)!.returnGameAt!))
    await db.c.execute('UPDATE map_nodes SET level=1 WHERE id=?',[nodeId])
    const [secondHero]=await db.c.execute('INSERT INTO owned_heroes (player_id,hero_definition_id) SELECT player_id,hero_definition_id FROM owned_heroes WHERE id=?',[heroId])
    const a=await startMarch(heroId,nodeId),b=await startMarch(secondHero.insertId,nodeId)
    await processMarch(a.id,new Date(new Date(a.arriveGameAt).getTime()+1));const before=await getWorldStatus()
    expect(before.reports[0].outpostLevelAfter).toBe(0);expect((await getBootstrap()).mapNodes.some(n=>n.id===nodeId)).toBe(false)
    await processMarch(a.id,new Date(new Date(a.arriveGameAt).getTime()+1));expect((await getWorldStatus()).reports).toEqual(before.reports)
    await processMarch(b.id,new Date(new Date(b.arriveGameAt).getTime()+1));w=await getWorldStatus()
    expect(w.reports).toEqual(before.reports);expect(w.marches.find(m=>m.id===b.id)!.result).toBe('TARGET_GONE')
    for(const m of w.marches.filter(m=>[a.id,b.id].includes(m.id)))await processMarch(m.id,new Date(m.returnGameAt!))
    const [remaining]=await db.c.query('SELECT id FROM map_nodes WHERE id=?',[nodeId]);expect(remaining).toHaveLength(0)
  })
  it('自动出征按攻击降级，任务历史保留；拒绝超过20级的据点范围',async()=>{
    await expect(startAutoFarm(heroId,'OUTPOST',1,21,1)).rejects.toThrow('1至20')
    await makeOutpost(20)
    const job=await startAutoFarm(heroId,'OUTPOST',20,20,1),before=await getWorldStatus(),now=new Date(before.autoFarmJobs.find(j=>j.id===job.id)!.nextRunGameAt)
    await processFarm(job.id,now)
    const marching=(await getWorldStatus()).marches.find(m=>m.heroId===heroId)!;expect(marching.status).toBe('MARCHING')
    await processMarch(marching.id,new Date(marching.returnGameAt!))
    const w=await getWorldStatus();expect(w.autoFarmJobs.find(j=>j.id===job.id)!.status).toBe('COMPLETED');expect(w.reports[0].outpostLevelBefore).toBe(20);expect(w.reports[0].outpostLevelAfter).toBe(19)
    await pruneFinishedMarches(db.c);expect((await getWorldStatus()).autoFarmJobs.some(j=>j.id===job.id)).toBe(true)
    await processFarm(job.id,now);expect((await getWorldStatus()).reports).toEqual(w.reports)
  })
  async function farmRow(id:number){const [r]=await db.c.query('SELECT * FROM auto_farm_jobs WHERE id=?',[id]);return r[0]}
  async function targetRows(id:number){const [r]=await db.c.query('SELECT * FROM map_nodes WHERE id=?',[id]);return r}
  async function farmReports(id:number){const [r]=await db.c.query("SELECT * FROM battle_reports WHERE player_id=? AND JSON_EXTRACT(battle_config,'$.autoFarmJobId')=? ORDER BY id",[config.PLAYER_ID,id]);return r}
  it('往返回归：十次锁定所选20级据点，逐次降到10级，返城才计次，无固定60秒间隔',async()=>{
    const start=new Date('2027-01-01T00:00:00Z');await freezeDispatchTime(start)
    const other=await makeOutpost(20),node=await makeOutpost(20)
    // Slow this test hero to distinguish computed travel from the legacy fixed timer.
    await db.c.execute('UPDATE hero_definitions h JOIN owned_heroes o ON o.hero_definition_id=h.id SET h.speed=100 WHERE o.id=?',[heroId])
    const hero=(await getWorldStatus()).ownedHeroes.find(h=>h.id===heroId)!,target=(await targetRows(node))[0]
    const oneWay=Math.ceil(travelSeconds(Math.hypot(Number(target.x)-50,Number(target.y)-50),hero.stats.speed))*1000
    const job=await startAutoFarm(heroId,'OUTPOST',20,20,10,[],node);let depart=start
    for(let i=0;i<10;i++){
      await processFarm(job.id,depart);const m=await farmMarch(job.id),arrive=new Date(m.arrive_game_at),back=new Date(m.return_game_at)
      expect(Number(m.map_node_id)).toBe(node);expect(new Date(m.depart_game_at)).toEqual(depart)
      expect(arrive.getTime()-depart.getTime()).toBe(oneWay);expect(back.getTime()-depart.getTime()).toBe(oneWay*2)
      expect(Number((await farmRow(job.id)).runs_remaining)).toBe(10-i)
      await processMarch(Number(m.id),new Date(arrive.getTime()-1));expect(Number((await targetRows(node))[0].level)).toBe(20-i)
      await processMarch(Number(m.id),arrive);expect(Number((await targetRows(node))[0].level)).toBe(19-i)
      await processMarch(Number(m.id),arrive);expect(await farmReports(job.id)).toHaveLength(i+1)
      await processFarm(job.id,back);expect(Number((await farmMarch(job.id)).id)).toBe(Number(m.id))
      await processMarch(Number(m.id),new Date(back.getTime()-1));expect(Number((await farmRow(job.id)).runs_remaining)).toBe(10-i)
      await processMarch(Number(m.id),back);await processMarch(Number(m.id),back)
      const row=await farmRow(job.id);expect(Number(row.runs_remaining)).toBe(9-i);expect(readFarmConfig(row.troop_config)).toMatchObject({targetNodeId:node,totalRuns:10,completedRuns:i+1});expect(new Date(row.next_run_game_at)).toEqual(back)
      depart=back
    }
    expect((await farmRow(job.id)).status).toBe('COMPLETED');expect(Number((await targetRows(other))[0].level)).toBe(20)
    expect(Number((await targetRows(node))[0].level)).toBe(10);expect(await farmReports(job.id)).toHaveLength(10)
    expect((await getWorldStatus()).ownedHeroes.find(h=>h.id===heroId)!.busy).toBe(false)
  },30000)
  it.each(['OUTPOST','WILD','DUNGEON','SYSTEM_CITY','RANDOM_CITY'] as const)('往返回归：%s自动三轮逐次降到0，目标消失即停止，不换其他目标',async type=>{
    const start=new Date('2027-01-01T00:00:00Z');await freezeDispatchTime(start)
    const other=await makeOutpost(3),node=await makeOutpost(3)
    await db.c.execute('UPDATE map_nodes SET node_type=?,garrison_config=? WHERE id IN (?,?)',[type,JSON.stringify({power:900}),other,node])
    const job=await startAutoFarm(heroId,type,3,3,10,[],node);let depart=start
    for(let i=0;i<3;i++){
      await processFarm(job.id,depart);const m=await farmMarch(job.id)
      await processMarch(Number(m.id),new Date(m.arrive_game_at))
      expect(Number((await targetRows(node))[0].level)).toBe(2-i)
      if(i===2)expect((await getBootstrap()).mapNodes.some(n=>n.id===node)).toBe(false)
      depart=new Date(m.return_game_at);await processMarch(Number(m.id),depart)
    }
    await processFarm(job.id,depart)
    expect(await targetRows(node)).toHaveLength(0);expect(Number((await targetRows(other))[0].level)).toBe(3)
    const row=await farmRow(job.id);expect(row.status).toBe('COMPLETED');expect(Number(row.runs_remaining)).toBe(7);expect(row.last_error).toContain('目标已耗尽')
    expect(readFarmConfig(row.troop_config).completedRuns).toBe(3);expect(await farmMarch(job.id)).toBeUndefined()
    const reports=await farmReports(job.id);expect(reports).toHaveLength(3)
    expect(reports.map((r:any)=>{const b=typeof r.battle_config==='string'?JSON.parse(r.battle_config):r.battle_config;return [b.targetLevelBefore,b.targetLevelAfter]})).toEqual([[3,2],[2,1],[1,0]])
  })
  it.each(['WILD','DUNGEON','SYSTEM_CITY','RANDOM_CITY'] as const)('往返回归：%s普通出征战败也降级，重复到达不重复扣级',async type=>{
    const start=new Date('2027-01-01T00:00:00Z');await freezeDispatchTime(start)
    const node=await makeOutpost(3);await db.c.execute('UPDATE map_nodes SET node_type=?,garrison_config=? WHERE id=?',[type,JSON.stringify({power:1e12}),node])
    const m=await startMarch(heroId,node);await processMarch(m.id,new Date(m.arriveGameAt));await processMarch(m.id,new Date(m.arriveGameAt))
    const row=(await targetRows(node))[0];expect(Number(row.level)).toBe(2)
    const report=(await getWorldStatus()).reports[0];expect(report).toMatchObject({result:'DEFEAT',targetLevelBefore:3,targetLevelAfter:2})
    expect(Number((typeof row.garrison_config==='string'?JSON.parse(row.garrison_config):row.garrison_config).power)).toBe(Math.round(1e12*2/3))
  })
  it('往返回归：随机城最后一级被抢先打完，后到队伍空返，不再扣级发奖，最后返城再删目标',async()=>{
    await freezeDispatchTime(new Date('2027-01-01T00:00:00Z'))
    const node=await makeOutpost(1),second=await secondDispatchHero();await db.c.execute("UPDATE map_nodes SET node_type='RANDOM_CITY' WHERE id=?",[node])
    const a=await startMarch(heroId,node),b=await startMarch(second,node)
    await processMarch(a.id,new Date(a.arriveGameAt));const reports=(await getWorldStatus()).reports
    await processMarch(b.id,new Date(b.arriveGameAt));expect((await getWorldStatus()).reports).toEqual(reports)
    expect((await getWorldStatus()).marches.find(m=>m.id===b.id)?.result).toBe('TARGET_GONE')
    await processMarch(a.id,new Date(a.returnGameAt));expect(await targetRows(node)).toHaveLength(1)
    await processMarch(b.id,new Date(b.returnGameAt));expect(await targetRows(node)).toHaveLength(0)
  })
  it('往返回归：旧空快照任务也走真实行军；已出发旧任务返城不重复扣次数',async()=>{
    const start=new Date('2027-01-01T00:00:00Z');await freezeDispatchTime(start);await makeOutpost(20)
    const job=await startAutoFarm(heroId,'OUTPOST',20,20,2)
    await db.c.execute('UPDATE auto_farm_jobs SET troop_config=NULL WHERE id=?',[job.id])
    await processFarm(job.id,start);const m=await farmMarch(job.id)
    expect(m.status).toBe('MARCHING');expect(await farmReports(job.id)).toHaveLength(0);expect(Number((await farmRow(job.id)).runs_remaining)).toBe(2)
    // Simulate a pre-update in-flight order, whose first run was already consumed.
    await db.c.execute("UPDATE march_orders SET troop_config=JSON_REMOVE(troop_config,'$.autoFarmCycleVersion') WHERE id=?",[m.id])
    await db.c.execute('UPDATE auto_farm_jobs SET runs_remaining=1,troop_config=NULL WHERE id=?',[job.id])
    expect((await getWorldStatus()).autoFarmJobs.find(j=>j.id===job.id)!.runsRemaining).toBe(2)
    await processMarch(Number(m.id),new Date(m.return_game_at));expect(Number((await farmRow(job.id)).runs_remaining)).toBe(1)
    await processFarm(job.id,new Date(m.return_game_at));const next=await farmMarch(job.id);expect(next).toBeDefined()
    await processMarch(Number(next.id),new Date(next.return_game_at));const row=await farmRow(job.id)
    expect(row.status).toBe('COMPLETED');expect(Number(row.runs_remaining)).toBe(0);expect(readFarmConfig(row.troop_config)).toMatchObject({totalRuns:2,completedRuns:2});expect(await farmReports(job.id)).toHaveLength(2)
  })
  it('往返回归：关闭浏览器离线补结算十轮，耗时按行军事件，重复补算不重复攻击',async()=>{
    const start=new Date('2027-01-01T00:00:00Z');await freezeDispatchTime(start)
    const node=await makeOutpost(20),job=await startAutoFarm(heroId,'OUTPOST',20,20,10,[],node)
    await settleDueWorldEvents(db.c,new Date(start.getTime()+86400000))
    const reports=await farmReports(job.id),row=await farmRow(job.id)
    expect(reports).toHaveLength(10);expect(row.status).toBe('COMPLETED');expect(Number(row.runs_remaining)).toBe(0);expect(readFarmConfig(row.troop_config).completedRuns).toBe(10);expect(Number((await targetRows(node))[0].level)).toBe(10)
    await settleDueWorldEvents(db.c,new Date(start.getTime()+86400000));expect(await farmReports(job.id)).toEqual(reports)
  })
  it('往返回归：API绑定点击的目标，类型不匹配拒绝且不创建任务扣兵',async()=>{
    await freezeDispatchTime(new Date('2027-01-01T00:00:00Z'));const node=await makeOutpost(3),app=Fastify();await registerApi(app)
    try{
      const payload={heroId,nodeId:node,nodeType:'WILD',minLevel:3,maxLevel:3,runs:10,troops:[]}
      const rejected=await app.inject({method:'POST',url:'/api/world/auto-farm',payload});expect(rejected.statusCode).toBeGreaterThanOrEqual(400)
      const [none]=await db.c.query('SELECT id FROM auto_farm_jobs WHERE owned_hero_id=?',[heroId]);expect(none).toHaveLength(0)
      const accepted=await app.inject({method:'POST',url:'/api/world/auto-farm',payload:{...payload,nodeType:'OUTPOST'}});expect(accepted.statusCode).toBe(200)
      const job=await farmRow(accepted.json().id);expect(readFarmConfig(job.troop_config).targetNodeId).toBe(node)
    }finally{await app.close()}
  })
  it('往返回归：混编按最慢士兵行军，返城后按幸存编队重新计算下一轮',async()=>{
    const start=new Date('2027-01-01T00:00:00Z');await freezeDispatchTime(start)
    const d=await testUnit();await forceDelta(db.c,d.code,1)
    const node=await makeOutpost(20),job=await startAutoFarm(heroId,'OUTPOST',20,20,2,[{code:d.code,quantity:1}],node)
    await processFarm(job.id,start);const first=await farmMarch(job.id)
    const target=(await targetRows(node))[0],distance=Math.hypot(Number(target.x)-50,Number(target.y)-50)
    expect(new Date(first.return_game_at).getTime()-start.getTime()).toBe(2*Math.ceil(travelSeconds(distance,d.speed))*1000)
    await processMarch(Number(first.id),new Date(first.return_game_at));expect(readFarmConfig((await farmRow(job.id)).troop_config).units.every(s=>s.quantity===0)).toBe(true)
    await processFarm(job.id,new Date(first.return_game_at));const second=await farmMarch(job.id)
    expect(new Date(second.return_game_at).getTime()-new Date(second.depart_game_at).getTime()).toBeLessThan(new Date(first.return_game_at).getTime()-start.getTime())
    await pauseAutoFarm(job.id);await processMarch(Number(second.id),new Date(second.return_game_at))
    const row=await farmRow(job.id);expect(row.status).toBe('PAUSED');expect(Number(row.runs_remaining)).toBe(0);expect(readFarmConfig(row.troop_config)).toMatchObject({targetNodeId:node,totalRuns:2,completedRuns:2,units:[]})
    expect(await unitQuantity(d.code)).toBe(0)
  })
  it('被攻击超过50条也永久保留，清空只删主动出征，游标分页不重复',async()=>{
    const ids:number[]=[]
    for(let i=0;i<55;i++){const [r]=await db.c.execute("INSERT INTO battle_reports (player_id,direction,title,result,battle_config,occurred_game_at) VALUES (?,'INCOMING','被攻击测试','DEFEAT','{}',UTC_TIMESTAMP(3))",[config.PLAYER_ID]);ids.push(Number(r.insertId))}
    await pruneReports(db.c);await clearReports()
    let page=await incomingReports(),seen:number[]=[];const total=page.total
    do{seen.push(...page.reports.map(r=>r.id));if(!page.nextCursor)break;page=await incomingReports(page.nextCursor)}while(true)
    expect(total).toBeGreaterThanOrEqual(55);expect(new Set(seen).size).toBe(total);expect(ids.every(id=>seen.includes(id))).toBe(true)
  })
  async function testUnit(fort=false):Promise<MilitaryDefinition>{const d={...militaryDefaults.find(d=>d.code===(fort?'wall':'pikeman'))!,code:fort?'test_wall':'test_pikeman',name:fort?'事务测试城墙':'事务测试长枪兵',cost:{food:10,wood:20,stone:30,iron:40,gold:50},seconds:10};await db.c.execute('INSERT INTO military_definitions (code,name,kind,config_json) VALUES (?,?,?,?)',[d.code,d.name,d.kind,JSON.stringify(d)]);await db.c.execute('UPDATE resource_wallet SET food=100000000,wood=100000000,stone=100000000,iron=100000000,gold=100000000 WHERE player_id=?',[config.PLAYER_ID]);return d}
  async function queueRow(id:number){const [r]=await db.c.query('SELECT * FROM military_orders WHERE id=?',[id]);return r[0]}
  async function wallet(){const [r]=await db.c.query('SELECT food,wood,stone,iron,gold FROM resource_wallet WHERE player_id=?',[config.PLAYER_ID]);return r[0]}
  async function unitQuantity(code:string){const [r]=await db.c.query('SELECT quantity FROM player_forces WHERE player_id=? AND unit_code=?',[config.PLAYER_ID,code]);return Number(r[0]?.quantity??0)}
  async function farmMarch(id:number){const [r]=await db.c.query("SELECT * FROM march_orders WHERE auto_farm_job_id=? AND status IN ('MARCHING','RETURNING')",[id]);return r[0]}
  it('军营逐个生产、离线补齐、重试只扣一次金币，完成再结算不复制士兵',async()=>{
    const d=await testUnit(),before=await wallet(),key=randomUUID(),q=await enqueueMilitary(d.code,3,key),row=await queueRow(q.id),start=new Date(row.start_game_at).getTime()
    expect(await unitQuantity(d.code)).toBe(0);expect(Number((await wallet()).gold)).toBe(Number(before.gold)-150)
    expect(await enqueueMilitary(d.code,3,key)).toEqual(q);expect(Number((await wallet()).gold)).toBe(Number(before.gold)-150)
    await expect(enqueueMilitary(d.code,4,key)).rejects.toThrow('不匹配')
    await settleMilitary(db.c,new Date(start+9999));expect(await unitQuantity(d.code)).toBe(0)
    await settleMilitary(db.c,new Date(start+10000));expect(await unitQuantity(d.code)).toBe(1)
    await settleMilitary(db.c,new Date(start+10*86400000));expect(await unitQuantity(d.code)).toBe(3)
    await settleMilitary(db.c,new Date(start+10*86400000));expect(await unitQuantity(d.code)).toBe(3)
    expect((await getMilitaryState()).orders.some(o=>o.id===q.id)).toBe(false)
  })
  it('同类生产串行、城防独立排队，未完工不能贡献防御，旧订单耗时不受后台调整影响',async()=>{
    const d=await testUnit(),f=await testUnit(true),q1=await enqueueMilitary(d.code,5,randomUUID()),q2=await enqueueMilitary(d.code,2,randomUUID()),qf=await enqueueMilitary(f.code,2,randomUUID())
    const r1=await queueRow(q1.id),r2=await queueRow(q2.id),rf=await queueRow(qf.id)
    expect(new Date(r2.start_game_at).getTime()).toBe(new Date(r1.end_game_at).getTime());expect(new Date(rf.start_game_at).getTime()).toBeLessThan(new Date(r1.end_game_at).getTime())
    expect(await unitQuantity(f.code)).toBe(0);await saveMilitary({...f,seconds:100,meleeDefense:300});expect(Number((await queueRow(qf.id)).seconds_per_unit)).toBe(10)
    await settleMilitary(db.c,new Date(new Date(rf.start_game_at).getTime()+10000));expect(await unitQuantity(f.code)).toBe(1)
    expect((await getMilitaryState()).defense.melee).toBeGreaterThanOrEqual(600)
  })
  it('金币不足、无效数量、停用、城防出征均拒绝并回滚，不扣库存',async()=>{
    const d=await testUnit(),f=await testUnit(true);await forceDelta(db.c,d.code,10);await forceDelta(db.c,f.code,10)
    await db.c.execute('UPDATE resource_wallet SET gold=0 WHERE player_id=?',[config.PLAYER_ID]);const before=await wallet()
    await expect(enqueueMilitary(d.code,1,randomUUID())).rejects.toThrow('金币不足');expect(await wallet()).toEqual(before)
    await expect(enqueueMilitary(d.code,0,randomUUID())).rejects.toThrow('整数')
    const n=await makeOutpost(1);await expect(startMarch(null,n,[{code:f.code,quantity:1}])).rejects.toThrow('城防不可出征')
    await expect(startMarch(null,n,[{code:d.code,quantity:11}])).rejects.toThrow('可用兵力不足')
    await expect(startMarch(null,n,[{code:d.code,quantity:1},{code:d.code,quantity:1}])).rejects.toThrow('重复')
    await saveMilitary({...d,enabled:false});await expect(startMarch(null,n,[{code:d.code,quantity:1}])).rejects.toThrow('启用')
    expect(await unitQuantity(d.code)).toBe(10);expect(await unitQuantity(f.code)).toBe(10)
  })
  it('混编真实扣兵、速度取最慢，目标消失空返只归还一次',async()=>{
    const d=await testUnit();await forceDelta(db.c,d.code,20);const n=await makeOutpost(5),key=randomUUID(),troops=[{code:d.code,quantity:8}],m=await startMarch(heroId,n,troops,key)
    expect(await unitQuantity(d.code)).toBe(12);expect(await startMarch(heroId,n,troops,key)).toEqual(m);expect(await unitQuantity(d.code)).toBe(12)
    const [rows]=await db.c.query('SELECT troop_config,depart_game_at FROM march_orders WHERE id=?',[m.id]);expect(readArmy(rows[0].troop_config)[0].quantity).toBe(8)
    await db.c.execute("UPDATE map_nodes SET status='DEPLETED' WHERE id=?",[n]);await processMarch(m.id,new Date(m.arriveGameAt));expect(await unitQuantity(d.code)).toBe(12)
    await processMarch(m.id,new Date(m.returnGameAt));expect(await unitQuantity(d.code)).toBe(20);await processMarch(m.id,new Date(m.returnGameAt));expect(await unitQuantity(d.code)).toBe(20)
  })
  it('纯士兵战斗写入伤亡和近远攻防，幸存兵返城再恢复库存',async()=>{
    const d=await testUnit();await forceDelta(db.c,d.code,100);const n=await makeOutpost(10);await db.c.execute("UPDATE map_nodes SET node_type='WILD',garrison_config='{\"power\":10000}' WHERE id=?",[n]);const m=await startMarch(null,n,[{code:d.code,quantity:100}])
    expect(await unitQuantity(d.code)).toBe(0);await processMarch(m.id,new Date(m.arriveGameAt));const w=await getWorldStatus(),r=w.reports[0],loss=r.troopLosses![0]
    expect(r.meleeAttack).toBe(36000);expect(r.rangedAttack).toBe(0);expect(loss.sent).toBe(100);expect(loss.lost).toBeGreaterThan(0);expect(loss.remaining).toBeGreaterThan(0);expect(loss.remaining+loss.lost).toBe(100);expect(await unitQuantity(d.code)).toBe(0)
    await processMarch(m.id,new Date(m.returnGameAt));expect(await unitQuantity(d.code)).toBe(loss.remaining);await processMarch(m.id,new Date(m.returnGameAt));expect(await unitQuantity(d.code)).toBe(loss.remaining)
  })
  it('自动编队不瞬移，不重复派兵，暂停在途任务后仍需返城才归队',async()=>{
    const d=await testUnit();await forceDelta(db.c,d.code,100);await makeOutpost(1);const job=await startAutoFarm(null,'OUTPOST',1,1,2,[{code:d.code,quantity:100}]);expect(await unitQuantity(d.code)).toBe(0)
    const now=new Date((await getWorldStatus()).autoFarmJobs.find(j=>j.id===job.id)!.nextRunGameAt);await processFarm(job.id,now);let m=await farmMarch(job.id);expect(m.status).toBe('MARCHING');await processFarm(job.id,new Date(now.getTime()+86400000));expect((await farmMarch(job.id)).id).toBe(m.id)
    await pauseAutoFarm(job.id);expect(await unitQuantity(d.code)).toBe(0);await processMarch(Number(m.id),new Date(m.return_game_at));const q=await unitQuantity(d.code);expect(q).toBeGreaterThan(0);expect(q).toBeLessThanOrEqual(100);await pauseAutoFarm(job.id);expect(await unitQuantity(d.code)).toBe(q);expect((await getWorldStatus()).autoFarmJobs.find(j=>j.id===job.id)!.status).toBe('PAUSED')
  })
  it('自动编队战败全灭停止，未出发暂停全额退兵',async()=>{
    const d=await testUnit();await forceDelta(db.c,d.code,2);const n=await makeOutpost(20),job=await startAutoFarm(null,'OUTPOST',20,20,2,[{code:d.code,quantity:1}]);const now=new Date((await getWorldStatus()).autoFarmJobs.find(j=>j.id===job.id)!.nextRunGameAt);await processFarm(job.id,now);const m=await farmMarch(job.id);await processMarch(Number(m.id),new Date(m.return_game_at));expect((await getWorldStatus()).autoFarmJobs.find(j=>j.id===job.id)!.status).toBe('COMPLETED');expect(await unitQuantity(d.code)).toBe(1)
    const next=await startAutoFarm(null,'OUTPOST',20,20,2,[{code:d.code,quantity:1}]);await pauseAutoFarm(next.id);expect(await unitQuantity(d.code)).toBe(1)
  })
  it('军营及后台HTTP接口贯通实库，配置保存立即反映前台',async()=>{
    const d=await testUnit(),app=Fastify();await registerMilitary(app)
    try{const before=await app.inject({method:'GET',url:'/api/military'});expect(before.statusCode).toBe(200);expect(before.json().ready).toBe(true)
      const update=await app.inject({method:'PUT',url:'/api/admin/military/'+d.code,payload:{...d,name:'事务测试骑兵',speed:1234}});expect(update.statusCode).toBe(200);expect((await listMilitary()).find(x=>x.code===d.code)!.speed).toBe(1234)
      const order=await app.inject({method:'POST',url:'/api/military/orders',payload:{code:d.code,quantity:2,clientActionId:randomUUID()}});expect(order.statusCode).toBe(200);expect(await unitQuantity(d.code)).toBe(0)
    }finally{await app.close()}
  })
  it('最多6个英雄，拒绝招募不消耗候选；已有满员存档不删除英雄',async()=>{
    let count=(await getWorldStatus()).ownedHeroes.length
    while(count<6){await db.c.execute('INSERT INTO owned_heroes (player_id,hero_definition_id) SELECT player_id,hero_definition_id FROM owned_heroes WHERE id=?',[heroId]);count++}
    const [p]=await db.c.query("SELECT id FROM tavern_pools WHERE code='hero_standard'"),result=await refreshTavern(Number(p[0].id),randomUUID()),candidate=result.candidates[0]
    await expect(recruitCandidate(candidate.id)).rejects.toThrow('英雄上限')
    const [c]=await db.c.query('SELECT recruited_at FROM tavern_candidates WHERE id=?',[candidate.id]);expect(c[0].recruited_at).toBeNull();expect((await getWorldStatus()).ownedHeroes.length).toBe(count)
  })
  async function isolateFood(){
    await db.c.execute('UPDATE player_forces SET quantity=0 WHERE player_id=?',[config.PLAYER_ID])
    await db.c.execute('UPDATE military_orders SET completed=quantity WHERE player_id=?',[config.PLAYER_ID])
    await db.c.execute("UPDATE march_orders SET troop_config=JSON_OBJECT('units',JSON_ARRAY()) WHERE player_id=?",[config.PLAYER_ID])
    await db.c.execute("UPDATE auto_farm_jobs SET troop_config=JSON_OBJECT('units',JSON_ARRAY()) WHERE player_id=?",[config.PLAYER_ID])
    await db.c.execute("UPDATE military_upkeep SET last_game_at='2026-01-01',fraction=0 WHERE player_id=?",[config.PLAYER_ID])
  }
  it('管理员加资源是真正累加、六项独立、同请求仅到账一次',async()=>{
    await isolateFood();const amounts={food:100,wood:200,stone:300,iron:400,gold:500,coupon:600},[before]=await db.c.query('SELECT * FROM resource_wallet WHERE player_id=?',[config.PLAYER_ID]),key=randomUUID(),r=await grantResources(amounts,key)
    for(const [k,v] of Object.entries(amounts))expect(r.wallet[k as keyof typeof amounts]).toBe(Number(before[0][k])+v)
    expect(await grantResources(amounts,key)).toEqual(r);expect((await resourceAdminState()).wallet).toEqual(r.wallet)
    await expect(grantResources({...amounts,gold:501},key)).rejects.toThrow('不匹配');expect((await resourceAdminState()).wallet).toEqual(r.wallet)
  })
  it('添加资源接口贯通，错误参数和记录失败不入账',async()=>{
    await isolateFood();const before=await wallet(),app=Fastify();await registerResources(app)
    try{const reply=await app.inject({method:'POST',url:'/api/admin/resources/grant',payload:{clientActionId:randomUUID(),amounts:{gold:100}}});expect(reply.statusCode).toBe(200);expect(reply.json().wallet.gold).toBe(Number(before.gold)+100);expect((await app.inject({method:'GET',url:'/api/admin/resources'})).json().recent.length).toBeGreaterThan(0)}finally{await app.close()}
    const balance=await wallet(),execute=db.c.execute.bind(db.c),spy=vi.spyOn(db.c,'execute').mockImplementation((...args:any[])=>{if(String(args[0]).startsWith('INSERT INTO admin_resource_grants'))throw Error('测试写入失败');return execute(...args)})
    try{await expect(grantResources({...emptyResources(),gold:100},randomUUID())).rejects.toThrow('测试写入失败')}finally{spy.mockRestore()}
    expect(await wallet()).toEqual(balance);await expect(grantResources({...emptyResources(),food:-1},randomUUID())).rejects.toThrow('非负整数')
  })
  it('耗粮包含驻城、行军、自动编队；生产按实际完成时刻起算，重复结算不重扣',async()=>{
    await isolateFood();const d=await testUnit();await saveMilitary({...d,foodPerHour:4});await forceDelta(db.c,d.code,10)
    await db.c.execute("UPDATE military_upkeep SET last_game_at='2026-01-01',fraction=0 WHERE player_id=?",[config.PLAYER_ID]);await db.c.execute('UPDATE resource_wallet SET food=10000 WHERE player_id=?',[config.PLAYER_ID])
    await settleUpkeep(db.c,new Date('2026-01-01T01:00:00Z'));expect(Number((await wallet()).food)).toBe(9960)
    await settleUpkeep(db.c,new Date('2026-01-01T01:00:00Z'));expect(Number((await wallet()).food)).toBe(9960)
    const n=await makeOutpost(10),m=await startMarch(null,n,[{code:d.code,quantity:5}]),job=await startAutoFarm(null,'OUTPOST',1,20,3,[{code:d.code,quantity:5}]);expect(await unitQuantity(d.code)).toBe(0);expect((await getUpkeep())!.hourly).toBe(40)
    await pauseAutoFarm(job.id);expect((await getUpkeep())!.hourly).toBe(40);expect(await unitQuantity(d.code)).toBe(5)
    await db.c.execute("UPDATE military_upkeep SET last_game_at='2026-01-01',fraction=0 WHERE player_id=?",[config.PLAYER_ID]);await db.c.execute('UPDATE resource_wallet SET food=10000 WHERE player_id=?',[config.PLAYER_ID])
    await settleUpkeep(db.c,new Date('2026-01-01T01:00:00Z'));expect(Number((await wallet()).food)).toBe(9960)
  })
  it('缺粮不杀兵、不取消任务、不欠账，重新补粮后正常扣除',async()=>{
    await isolateFood();const d=await testUnit();await saveMilitary({...d,foodPerHour:4});await forceDelta(db.c,d.code,10)
    await db.c.execute("UPDATE military_upkeep SET last_game_at='2026-01-01',fraction=0 WHERE player_id=?",[config.PLAYER_ID]);await db.c.execute('UPDATE resource_wallet SET food=1 WHERE player_id=?',[config.PLAYER_ID])
    await settleUpkeep(db.c,new Date('2026-01-01T01:00:00Z'));expect(Number((await wallet()).food)).toBe(0);expect(await unitQuantity(d.code)).toBe(10);expect((await getUpkeep())!.shortage).toBe(true)
    await settleUpkeep(db.c,new Date('2026-01-02T01:00:00Z'));expect(await unitQuantity(d.code)).toBe(10)
    await db.c.execute('UPDATE resource_wallet SET food=100 WHERE player_id=?',[config.PLAYER_ID]);await settleUpkeep(db.c,new Date('2026-01-02T02:00:00Z'));expect(Number((await wallet()).food)).toBe(60)
  })
  it('离线完成一批兵，只收每名士兵出生后的军粮，不重复收已入营部分',async()=>{
    await isolateFood();const d=await testUnit();await saveMilitary({...d,foodPerHour:4});await db.c.execute("UPDATE military_upkeep SET last_game_at='2026-01-01',fraction=0 WHERE player_id=?",[config.PLAYER_ID]);await db.c.execute('UPDATE resource_wallet SET food=1000 WHERE player_id=?',[config.PLAYER_ID])
    await db.c.execute("INSERT INTO military_orders (player_id,unit_code,lane,quantity,seconds_per_unit,start_game_at,end_game_at,snapshot_json,client_action_id) VALUES (?,?,'TROOP',3,3600,'2026-01-01','2026-01-01 03:00:00',?,?)",[config.PLAYER_ID,d.code,JSON.stringify(d),randomUUID()])
    await settleMilitary(db.c,new Date('2026-01-01T03:00:00Z'));expect(await unitQuantity(d.code)).toBe(3);expect(Number((await wallet()).food)).toBe(988)
    await settleMilitary(db.c,new Date('2026-01-01T04:00:00Z'));expect(Number((await wallet()).food)).toBe(976)
  })

})
