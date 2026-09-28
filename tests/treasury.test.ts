import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import Fastify from 'fastify'
import {filterTreasury,treasuryHoldings} from '../shared/treasury'
import type {ItemDefinition} from '../shared/items'
const db=vi.hoisted(()=>({query:vi.fn(),execute:vi.fn()}))
vi.mock('../server/db.js',()=>({getPool:()=>db,inTransaction:(work:any)=>work(db),assertDatabaseScope:vi.fn()}))
import {mapItem,setItemArchived,saveItem,rollLoot} from '../server/item-service'
import {registerApi} from '../server/routes/api'
const make=(id:number,type:ItemDefinition['itemType'],quality=1):ItemDefinition=>({id,code:'item_'+id,name:type==='TREASURE'?'虎符':'战甲',description:'战国珍藏',itemType:type,rarity:3,qualityTier:quality,enabled:true,effectConfig:{}})
const row=(extra:object={})=>({id:1,code:'a',name:'战甲',item_type:'EQUIPMENT',rarity:3,quality_tier:4,enabled:1,description:'说明',effect_config:'{}',deleted_at:null,...extra})
describe('藏宝阁统一目录',()=>{
 it('装备和宝物混排，按品质排序；停用、回收和非装备宝物隐藏',()=>{
  const entries=[make(1,'EQUIPMENT',4),make(2,'TREASURE',7),make(3,'CONSUMABLE',7),{...make(4,'EQUIPMENT'),enabled:false},{...make(5,'TREASURE'),deletedAt:'2026-09-16'}]
  expect(filterTreasury(entries,{search:'',quality:0,ownedOnly:false}).map(i=>i.id)).toEqual([2,1])
  expect(filterTreasury(entries,{search:'虎符',quality:7,ownedOnly:false}).map(i=>i.id)).toEqual([2])
 })
 it('包裹堆叠、独立实例和穿戴数量合并，支持仅看已拥有',()=>{
  const item=make(1,'EQUIPMENT'),holdings=treasuryHoldings([{item,quantity:2},{item,quantity:1,gear:{instanceId:3,refineLevel:2,sockets:0,gems:[]}}],[{item,heroId:1,slot:'HELMET'}])
  expect(holdings[1]).toEqual({bag:3,equipped:1})
  expect(filterTreasury([item,make(2,'TREASURE')],{search:'',quality:0,ownedOnly:true},holdings)).toEqual([item])
 })
 it('迁移前兼容读取，回收后停用但保留原属性',()=>{
  const old=row();delete (old as any).deleted_at
  expect(mapItem(old as any).enabled).toBe(true);expect(mapItem(old as any).deletedAt).toBeNull()
  const archived=mapItem(row({deleted_at:new Date('2026-09-16T00:00:00Z')}) as any)
  expect(archived.enabled).toBe(false);expect(archived.deletedAt).toBe('2026-09-16T00:00:00.000Z');expect(archived.effectConfig).toEqual({})
  expect(rollLoot([{id:1,name:'必掉',nodeType:'OUTPOST',minLevel:1,maxLevel:20,chance:1,rolls:1,enabled:true,entries:[{itemId:1,weight:1,minQuantity:1,maxQuantity:1,enabled:true}]}],[archived],'OUTPOST',20,'seed')).toEqual([])
 })
})
describe('回收站服务与HTTP（模拟数据库，不触碰存档）',()=>{
 beforeEach(()=>{vi.clearAllMocks();db.query.mockResolvedValue([[row()]]);db.execute.mockResolvedValue([{affectedRows:1,insertId:99}])})
 afterEach(()=>vi.restoreAllMocks())
 it('删除只写回收标记和审计，不删库存、物品或穿戴实例；重复删除幂等',async()=>{
  await expect(setItemArchived(1,true)).resolves.toEqual({ok:true})
  expect(db.execute.mock.calls).toHaveLength(2)
  expect(db.execute.mock.calls[0]).toEqual(['UPDATE item_definitions SET deleted_at=UTC_TIMESTAMP(3) WHERE id=?',[1]])
  expect(db.execute.mock.calls.map(c=>c[0]).join(' ')).not.toMatch(/DELETE|player_inventory|equipment_instances|hero_equipment/)
  db.execute.mockClear();db.query.mockResolvedValue([[row({deleted_at:new Date()})]])
  await setItemArchived(1,true);expect(db.execute).not.toHaveBeenCalled()
 })
 it('恢复保留原启用开关；未迁移、无物品、非装备宝物拒绝任何写入',async()=>{
  db.query.mockResolvedValue([[row({deleted_at:new Date(),enabled:0})]])
  await setItemArchived(1,false);expect(db.execute.mock.calls[0][0]).toBe('UPDATE item_definitions SET deleted_at=NULL WHERE id=?')
  for(const [rows,message] of [[[],'物品不存在'],[[row({item_type:'CONSUMABLE'})],'仅用于装备与宝物'],[[{id:1,item_type:'EQUIPMENT'}],'尚未启用']] as const){db.execute.mockClear();db.query.mockResolvedValue([rows]);await expect(setItemArchived(1,true)).rejects.toThrow(message);expect(db.execute).not.toHaveBeenCalled()}
 })
 it('回收中的定义不能通过保存绕过恢复',async()=>{
  db.query.mockResolvedValue([[row({deleted_at:new Date()})]])
  await expect(saveItem(make(1,'EQUIPMENT'),1)).rejects.toThrow('先从回收站恢复');expect(db.execute).not.toHaveBeenCalled()
 })
 it('前台接口只读且禁止缓存，每次读取新目录；管理增改删恢复均有独立路由',async()=>{
  const app=Fastify();await registerApi(app)
  try{
   db.query.mockResolvedValue([[row(),row({id:2,item_type:'TREASURE',name:'虎符'}),row({id:3,item_type:'SKILL_BOOK'}),row({id:4,deleted_at:new Date()})]])
   const first=await app.inject('/api/catalog/items');expect(first.statusCode).toBe(200);expect(first.headers['cache-control']).toBe('no-store');expect(first.json().map((i:any)=>i.name)).toEqual(['战甲','虎符']);expect(db.execute).not.toHaveBeenCalled()
   db.query.mockResolvedValue([[row({name:'改名后的战甲'})]])
   expect((await app.inject('/api/catalog/items')).json()[0].name).toBe('改名后的战甲')
   expect((await app.inject({method:'DELETE',url:'/api/admin/items/1'})).statusCode).toBe(200)
   db.query.mockResolvedValue([[row({deleted_at:new Date()})]])
   expect((await app.inject({method:'POST',url:'/api/admin/items/1/restore'})).statusCode).toBe(200)
   db.query.mockResolvedValue([[row({effect_config:'{"slot":"HELMET"}'})]])
   const payload={...make(1,'EQUIPMENT'),effectConfig:{slot:'HELMET'},description:'新说明'}
   expect((await app.inject({method:'POST',url:'/api/admin/items',payload})).statusCode).toBe(200)
   expect((await app.inject({method:'PUT',url:'/api/admin/items/1',payload})).statusCode).toBe(200)
  }finally{await app.close()}
 })
})
