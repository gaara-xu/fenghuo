import {describe,it,expect} from 'vitest'
import {createSSRApp} from 'vue'
import {renderToString} from '@vue/server-renderer'
import {militaryDefaults,stackFromDefinition,armyStats,completedUnits,weightedDefense,npcArmy,type MilitaryState} from '../shared/military'
import {armyBattleOutcome} from '../server/domain/army-battle'
import {militarySchema,troopSelectionSchema} from '../server/routes/military'
import type {LearnedSkill} from '../shared/contracts'
import MilitaryPanel from '../web/MilitaryPanel.vue'
import DispatchTroops from '../web/DispatchTroops.vue'
import DispatchHeroes from '../web/DispatchHeroes.vue'
const def=(code:string)=>militaryDefaults.find(d=>d.code===code)!
const unit=(code:string,n=1)=>stackFromDefinition(def(code),n)
const enemy=npcArmy(1000,'BALANCED',false)
const skill=(v:Partial<LearnedSkill>={}):LearnedSkill=>({slotNo:1,skillDefinitionId:1,name:'热血',level:10,description:'',effectType:'MELEE_ATTACK_PERCENT',targetScope:'SELF_ONE',triggerRate:1,effectValue:60,mode:'ATTACK',maxLevel:10,upgradeExp:100,...v})
const battle=(codes:string[],s:LearnedSkill[])=>armyBattleOutcome(codes.map(c=>unit(c,10)),enemy,'test',{randomize:false,attackerSkills:s})
describe('兵种、双通道攻防与生产时间',()=>{
 it('15项定义有效，只保留考证兵种；骑兵各有攻防通道，重甲双防低速',()=>{expect(militaryDefaults).toHaveLength(15);for(const d of militaryDefaults)expect(militarySchema.safeParse(d).success).toBe(true);expect(def('heavy_general')).toMatchObject({meleeAttack:250,rangedAttack:250,meleeDefense:2500,rangedDefense:2500,speed:350});expect(def('lance_cavalry')).toMatchObject({meleeAttack:900,rangedAttack:0,speed:800});expect(def('mounted_archer')).toMatchObject({meleeAttack:0,rangedAttack:900,speed:800});expect(def('elite_cavalry')).toBeUndefined();expect(militaryDefaults.filter(d=>d.kind==='TROOP').every(d=>!d.cost.gold)).toBe(true)})
 it('不能提交零耗时、负价、零速兵种或会行军的城防',()=>{for(const patch of [{seconds:0},{cost:{gold:-1}},{speed:0}])expect(militarySchema.safeParse({...def('pikeman'),...patch}).success).toBe(false);expect(militarySchema.safeParse({...def('wall'),speed:100}).success).toBe(false);expect(troopSelectionSchema.safeParse([{code:'archer',quantity:1.5}]).success).toBe(false)})
 it('生产从零开始，单个完成才入营，离线补齐而不超量',()=>{const t=100000;expect([-1,0,9999,10000,29999,30000,86400000].map(dt=>completedUnits(t,10,3,t+dt))).toEqual([0,0,0,1,2,3,3])})
 it('混编速度取最慢单位，零数量不拖慢，负重叠加',()=>{expect(armyStats([unit('lance_cavalry',5),unit('heavy_general',1)]).speed).toBe(350);expect(armyStats([unit('lance_cavalry',5),unit('heavy_general',0)]).speed).toBe(800);expect(armyStats([unit('cart',2),unit('supply',5)]).loadCapacity).toBe(7000)})
 it('纯近攻、纯远攻、双攻分别匹配防御通道',()=>{expect(weightedDefense(100,0,1000,10)).toBe(1000);expect(weightedDefense(0,100,1000,10)).toBe(10);expect(weightedDefense(100,100,1000,10)).toBe(505);const d=npcArmy(1000,'MELEE',false);expect(armyBattleOutcome([unit('pikeman',3)],d,'same',{randomize:false}).victory).toBe(false);expect(armyBattleOutcome([unit('archer',3)],d,'same',{randomize:false}).victory).toBe(true)})
 it('防御不冒充出征攻击，科技与技能加法叠加',()=>{expect(battle(['pikeman'],[]).heroPower).toBe(3600);expect(battle(['pikeman'],[skill()]).heroPower).toBe(4680);expect(armyBattleOutcome([unit('wall',99)],enemy,'test',{randomize:false}).victory).toBe(false)})
 it('单兵种热血不选零近攻弓兵，也不增强全军',()=>{const r=battle(['pikeman','archer'],[skill()]);expect(r.heroPower).toBe(8280);expect(r.skillEvents[0].target).toBe('长枪兵');const r2=battle(['pikeman','lance_cavalry'],[skill()]);expect([21600+1080,21600+5400]).toContain(r2.heroPower)})
 it('城防有独立近远防；破城技能只削弱工事，不削弱守军',()=>{const d=npcArmy(1000,'BALANCED',true),a=[unit('archer',10)];const r=armyBattleOutcome(a,d,'t',{randomize:false,attackerSkills:[skill({name:'瓦解',effectType:'DEFENSE_REDUCE',targetScope:'ENEMY_FORT_ALL',effectValue:50})]});expect(r.enemyRoll).toBe(825);expect(r.skillEvents[0].target).toBe('城池防御工事');const home=armyBattleOutcome(a,[unit('trap',2),unit('tower',2)],'t',{randomize:false,defenderTech:1});expect(home.meleeDefense).toBe(840);expect(home.rangedDefense).toBe(840)})
 it('防方技能真实减少对应攻击',()=>{const r=armyBattleOutcome([unit('pikeman',10),unit('archer',10)],enemy,'t',{randomize:false,defenderSkills:[skill({name:'缴械',targetScope:'ENEMY_ONE',mode:'DEFENSE',effectType:'ENEMY_MELEE_ATTACK_REDUCE',effectValue:50})]});expect(r.meleeAttack).toBe(2700);expect(r.rangedAttack).toBe(3600)})
 it('伤亡可重现、幸存兵数守恒，减伤技能减少实际阵亡',()=>{const a=[unit('pikeman',1000)],d=npcArmy(150000,'BALANCED',false);const opts={randomize:false},r=armyBattleOutcome(a,d,'loss',opts);expect(armyBattleOutcome(a,d,'loss',opts)).toEqual(r);expect(r.troopLosses[0].lost).toBeGreaterThan(0);expect(r.troopLosses[0].lost+r.survivors[0].quantity).toBe(1000);const less=armyBattleOutcome(a,d,'loss',{...opts,attackerSkills:[skill({name:'不屈',effectType:'LOSS_REDUCTION',effectValue:80})]});expect(less.troopLosses[0].lost).toBeLessThan(r.troopLosses[0].lost)})
 it('仅胜利也可能损兵；溃败全灭无负重、英雄不因士兵伤亡被删除',()=>{const a=[unit('pikeman',2)],r=armyBattleOutcome(a,npcArmy(1e8,'BALANCED',false),'loss',{randomize:false});expect(r.victory).toBe(false);expect(r.survivors[0].quantity).toBe(0);expect(r.loadCapacity).toBe(0);const h={...unit('lance_cavalry'),kind:'HERO' as const};expect(armyBattleOutcome([h],enemy,'t').troopLosses).toHaveLength(0)})
})
describe('军营、城防与编队界面',()=>{
 const state:MilitaryState={ready:true,definitions:militaryDefaults,stock:{pikeman:100,wall:12},orders:[{id:1,code:'pikeman',name:'长枪兵',kind:'TROOP',quantity:10,completed:2,seconds:18,startGameAt:'2026-09-17T00:00:00Z',endGameAt:'2026-09-17T00:03:00Z'}],defense:{melee:100,ranged:100}}
 const render=(c:any,p:any)=>renderToString(createSSRApp(c,p))
 it('军营显示属性、价格、耗时、队列与入营数量',async()=>{const html=await render(MilitaryPanel,{state,kind:'TROOP',wallet:{food:1e8,wood:1e8,stone:1e8,iron:1e8,gold:1e8,coupon:0},gameTime:Date.parse('2026-09-17T00:00:40Z'),busy:false});for(const text of ['骑枪战将','重甲将军','近攻','远攻','近防','远防','速度','负重','单个耗时','生产中','已完成 2 / 10'])expect(html).toContain(text);expect(html).not.toContain('<select');expect(html).not.toContain('精锐骑兵')})
 it('城防不显示招兵，驻城近远防和生产时间独立',async()=>{const html=await render(MilitaryPanel,{state,kind:'DEFENSE',wallet:{food:1e8,wood:1e8,stone:1e8,iron:1e8,gold:1e8,coupon:0},gameTime:0,busy:false});for(const t of ['驻城总近防','驻城总远防','高级箭塔','火箱','建造队列'])expect(html).toContain(t);expect(html).not.toContain('精锐骑兵')})
 it('没有英雄也能选择仅派士兵，编队显示兵力与最慢移速',async()=>{expect(await render(DispatchHeroes,{heroes:[],selected:0,busy:false})).toContain('仅派士兵');const html=await render(DispatchTroops,{state,selection:{pikeman:10},node:{x:0,y:0},busy:false});expect(html).toContain('长枪兵出征数量');expect(html).toContain('3,600');expect(html).toContain('行军速度');expect(html).not.toContain('<select')})
})
