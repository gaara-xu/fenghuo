import {beforeEach,describe,it,expect,vi} from 'vitest'
import {randomUUID} from 'node:crypto'
import Fastify from 'fastify'
import {completedUnits,speedupGoldCost,type MilitaryOrder} from '../shared/military'
const db=vi.hoisted(()=>({state:{gold:20,stock:{} as Record<string,number>,orders:[] as any[]},now:Date.parse('2026-01-01T00:00:00Z'),query:vi.fn(),execute:vi.fn(),events:[] as string[],failWrite:false,tail:Promise.resolve()}))
vi.mock('../server/db.js',()=>({getPool:()=>({query:db.query,execute:db.execute}),inTransaction:async(fn:any)=>{let release!:()=>void;const previous=db.tail;db.tail=new Promise<void>(r=>{release=r});await previous;const before=structuredClone(db.state);try{return await fn({query:db.query,execute:db.execute})}catch(e){db.state=before;throw e}finally{release()}}}))
vi.mock('../server/upkeep-service.js',()=>({settleUpkeep:vi.fn(async()=>{db.events.push('upkeep')}),getUpkeep:vi.fn(),nextMilitaryEvent:vi.fn()}))
vi.mock('../server/world-service.js',()=>({settleDueWorldEvents:vi.fn(async()=>{db.events.push('prior-world-events:'+JSON.stringify(db.state.stock))})}))
import {accelerateMilitary,enqueueMilitary} from '../server/military-service'
import {registerMilitary} from '../server/routes/military'
const start=Date.parse('2026-01-01T00:00:00Z')
const row=(id:number,offset=0,seconds=100,quantity=3,lane='DEFENSE')=>({id,player_id:1,unit_code:lane==='TROOP'?'pikeman':'wall',lane,quantity,completed:0,seconds_per_unit:seconds,start_game_at:new Date(start+offset*1000),end_game_at:new Date(start+(offset+seconds*quantity)*1000),snapshot_json:JSON.stringify({name:'城防',seconds})})
const order=(patch:Partial<MilitaryOrder>={}):MilitaryOrder=>({id:1,code:'wall',name:'城墙',kind:'DEFENSE',quantity:10,completed:0,seconds:60,startGameAt:new Date(start).toISOString(),endGameAt:new Date(start+600000).toISOString(),...patch})
beforeEach(()=>{
 db.state={gold:20,stock:{},orders:[]};db.now=start;db.events=[];db.failWrite=false;db.tail=Promise.resolve()
 db.query.mockReset().mockImplementation(async(sql:string,p:any[]=[])=>{
  if(sql.includes('FROM player_profile'))return [[{id:1}]]
  if(sql.includes('FROM game_clock'))return [[{real_anchor_at:new Date(),game_anchor_at:new Date(db.now),multiplier:0}]]
  if(sql.includes('FROM military_orders')){
   let rows=db.state.orders.filter(r=>r.player_id===p[0])
   if(sql.includes('AND id=?'))rows=rows.filter(r=>r.id===p[1])
   if(sql.includes('completed<quantity'))rows=rows.filter(r=>r.completed<r.quantity)
   if(sql.includes('lane=?'))rows=rows.filter(r=>r.lane===p[1])
   if(sql.includes('start_game_at<=?'))rows=rows.filter(r=>+r.start_game_at<=+p[1])
   return [structuredClone(rows.sort((a,b)=>+a.start_game_at-+b.start_game_at||a.id-b.id))]
  }
  throw Error('未模拟的查询：'+sql)
 })
 db.execute.mockReset().mockImplementation(async(sql:string,p:any[]=[])=>{
  if(sql.startsWith('DELETE FROM military_orders'))return [{affectedRows:0}]
  if(sql.startsWith('UPDATE military_orders SET completed=?')){db.state.orders.find(r=>r.id===p[1]).completed=p[0];return [{affectedRows:1}]}
  if(sql.startsWith('INSERT INTO player_forces')){db.events.push('grant-units');if(db.failWrite)throw Error('入城失败');db.state.stock[p[1]]=(db.state.stock[p[1]]??0)+p[2];return [{affectedRows:1}]}
  if(sql.startsWith('UPDATE resource_wallet')){db.events.push('charge-gold');if(db.state.gold<p[0])return [{affectedRows:0}];db.state.gold-=p[0];return [{affectedRows:1}]}
  if(sql.startsWith('UPDATE military_orders SET completed=quantity')){const r=db.state.orders.find(r=>r.id===p[4]);r.completed=r.quantity;r.start_game_at=new Date(Math.min(+r.start_game_at,+p[0]));r.end_game_at=p[1];r.snapshot_json=p[2];return [{affectedRows:1}]}
  if(sql.startsWith('UPDATE military_orders SET start_game_at')){const r=db.state.orders.find(r=>r.id===p[3]);r.start_game_at=p[0];r.end_game_at=p[1];return [{affectedRows:1}]}
  throw Error('未模拟的写入：'+sql)
 })
})
describe('金币加速计价',()=>{
 it('每五分钟一金币向上取整，不收费前置等待，完成后为零',()=>{
  expect([0,299999,300000,599999,600000].map(t=>speedupGoldCost(order(),start+t))).toEqual([2,2,1,1,0])
  expect(speedupGoldCost(order({startGameAt:new Date(start+3600000).toISOString(),endGameAt:new Date(start+4200000).toISOString()}),start)).toBe(2)
  expect(speedupGoldCost(order({completed:10}),start)).toBe(0)
  expect(speedupGoldCost(order({completed:8}),start-1000)).toBe(1)
 })
 it('先结算已完成单位，再只补剩余数量；后续同类提前，另一条队列不变',async()=>{
  db.state.orders=[row(1,0,10,3),row(2,30,10,2),row(3,0,100,2,'TROOP')];db.now=start+11000
  const result=await accelerateMilitary(1,randomUUID(),1)
  expect(result).toMatchObject({goldSpent:1,completedUnits:2,savedSeconds:19});expect(db.state.stock.wall).toBe(3);expect(db.state.gold).toBe(19)
  expect(+db.state.orders[1].start_game_at).toBe(start+11000);expect(+db.state.orders[1].end_game_at).toBe(start+31000);expect(+db.state.orders[2].start_game_at).toBe(start)
  expect(db.events[0]).toBe('prior-world-events:{}');expect(db.events.indexOf('upkeep')).toBeLessThan(db.events.indexOf('charge-gold'))
  expect(completedUnits(+db.state.orders[1].start_game_at,10,2,start+21000)).toBe(1)
 })
 it('可加速排队订单，前置订单不变，只缩短其后同类等待',async()=>{
  db.state.orders=[row(1,0,60,10),row(2,600,300,2),row(3,1200,60,1)]
  expect((await accelerateMilitary(2,randomUUID(),2)).goldSpent).toBe(2);expect(db.state.stock.wall).toBe(2)
  expect(+db.state.orders[0].end_game_at).toBe(start+600000);expect(+db.state.orders[2].start_game_at).toBe(start+600000);expect(+db.state.orders[1].start_game_at).toBe(start)
 })
 it('并发点击与请求重放都只扣一次金币、只入城一次；不同编号重试完成订单不收费',async()=>{
  db.state.orders=[row(1)];const key=randomUUID(),[a,b]=await Promise.all([accelerateMilitary(1,key,1),accelerateMilitary(1,key,1)])
  expect(a.goldSpent).toBe(1);expect(b).toEqual({...a,replayed:true});expect(db.state.gold).toBe(19);expect(db.state.stock.wall).toBe(3)
  expect(await accelerateMilitary(1,randomUUID(),1)).toMatchObject({goldSpent:0,alreadyCompleted:true});expect(db.state.gold).toBe(19)
 })
 it('自然完成不扣金；不存在或其他玩家的订单不产生变更',async()=>{
  db.state.orders=[row(1)];db.now=start+300000;expect(await accelerateMilitary(1,randomUUID(),1)).toMatchObject({goldSpent:0,alreadyCompleted:true});expect(db.state.stock.wall).toBe(3);expect(db.state.gold).toBe(20)
  await expect(accelerateMilitary(2,randomUUID(),1)).rejects.toThrow('不存在');db.state.orders.push({...row(2),player_id:999});await expect(accelerateMilitary(2,randomUUID(),1)).rejects.toThrow('不存在')
 })
 it.each(['余额不足','价格超过展示上限','入城失败'])('%s则原子回滚扣金、数量、队列和回执',async reason=>{
  db.state.orders=[row(1,0,10,3),row(2,30,10,2)];db.now=start+11000
  if(reason==='余额不足')db.state.gold=0;if(reason==='入城失败')db.failWrite=true
  const before=structuredClone(db.state);await expect(accelerateMilitary(1,randomUUID(),reason==='价格超过展示上限'?0:1)).rejects.toThrow();expect(db.state).toEqual(before)
 })
 it.each(['TROOP','DEFENSE'])('%s订单接受1000，服务层与HTTP拒绝1001且不扣资源',async kind=>{
  const lane=kind,code=kind==='TROOP'?'pikeman':'wall',clientActionId=randomUUID()
  db.state.orders=[{...row(1,0,30,1000,lane),client_action_id:clientActionId}]
  await expect(enqueueMilitary(code,1001,clientActionId)).rejects.toThrow('1至1000');expect(db.query).not.toHaveBeenCalled()
  const app=Fastify();await registerMilitary(app)
  try{
   const request=(quantity:number)=>app.inject({method:'POST',url:'/api/military/orders',payload:{code,quantity,clientActionId}})
   expect((await request(1001)).statusCode).toBeGreaterThanOrEqual(400);expect(db.query).not.toHaveBeenCalled()
   expect((await request(1000)).statusCode).toBe(200);expect(db.execute).not.toHaveBeenCalled();expect(db.state.gold).toBe(20)
  }finally{await app.close()}
 })
 it('HTTP只接受POST、有效订单与整数报价，不接受客户端指定完成数量或扣款金额',async()=>{
  const app=Fastify();await registerMilitary(app);db.state.orders=[row(1)]
  try{for(const payload of [{clientActionId:randomUUID(),maxGold:-1},{clientActionId:'bad',maxGold:1},{clientActionId:randomUUID(),maxGold:1,quantity:999}])expect((await app.inject({method:'POST',url:'/api/military/orders/1/accelerate',payload})).statusCode).toBeGreaterThanOrEqual(400)
   expect(db.state.gold).toBe(20);expect((await app.inject('/api/military/orders/1/accelerate')).statusCode).toBe(404)
   const r=await app.inject({method:'POST',url:'/api/military/orders/1/accelerate',payload:{clientActionId:randomUUID(),maxGold:1}});expect(r.statusCode).toBe(200);expect(r.json().goldSpent).toBe(1)
  }finally{await app.close()}
 })
})
