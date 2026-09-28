import mysql,{type RowDataPacket,type ResultSetHeader} from 'mysql2/promise'
import {config} from '../server/config.js'

// Explicit maintenance only: dry-run rolls back the complete operation; --apply commits it.
const mode=process.argv[2]??'--dry-run'
if(!['--dry-run','--apply'].includes(mode))throw Error('仅支持 --dry-run 或 --apply')
const c=await mysql.createConnection({host:config.DB_HOST,port:config.DB_PORT,user:config.DB_USER,password:config.DB_PASSWORD,database:'fenghuo',charset:'utf8mb4',connectTimeout:10000})
let locked=false
try{
  const [scope]=await c.query<RowDataPacket[]>('SELECT DATABASE() db');if(scope[0]?.db!=='fenghuo')throw Error('数据库越界')
  const [lock]=await c.query<RowDataPacket[]>("SELECT GET_LOCK('fenghuo_update',10) acquired");locked=Number(lock[0].acquired)===1;if(!locked)throw Error('另一个更新正在进行')
  await c.beginTransaction()
  const playerId=config.PLAYER_ID,[player]=await c.query<RowDataPacket[]>('SELECT id FROM player_profile WHERE id=? FOR UPDATE',[playerId]);if(!player.length)throw Error('玩家不存在')
  const [inventory]=await c.query<RowDataPacket[]>('SELECT * FROM player_inventory WHERE player_id=? ORDER BY item_definition_id FOR UPDATE',[playerId])
  const [skillBooks]=await c.query<RowDataPacket[]>('SELECT * FROM player_skill_books WHERE player_id=? ORDER BY skill_definition_id FOR UPDATE',[playerId])
  const [equipmentInstances]=await c.query<RowDataPacket[]>('SELECT g.* FROM equipment_instances g WHERE g.player_id=? AND NOT EXISTS (SELECT 1 FROM hero_equipment e WHERE e.instance_id=g.id) ORDER BY g.id FOR UPDATE',[playerId])
  const wornSql='SELECT g.* FROM equipment_instances g WHERE g.player_id=? AND EXISTS (SELECT 1 FROM hero_equipment e WHERE e.instance_id=g.id) ORDER BY g.id'
  const [wornBefore]=await c.query<RowDataPacket[]>(wornSql+' FOR UPDATE',[playerId])
  const summary={stackRows:inventory.length,stackQuantity:inventory.reduce((n,r)=>n+Number(r.quantity),0),skillBookRows:skillBooks.length,skillBookQuantity:skillBooks.reduce((n,r)=>n+Number(r.quantity),0),unequippedInstances:equipmentInstances.length,preservedEquippedInstances:wornBefore.length}
  let auditId:number|null=null
  if(inventory.length||skillBooks.length||equipmentInstances.length){
    const [audit]=await c.execute<ResultSetHeader>("INSERT INTO admin_audit_logs (action,entity_type,entity_id,before_json,after_json) VALUES ('CLEAR_BACKPACK','PLAYER',?,?,?)",[String(playerId),JSON.stringify({playerId,inventory,skillBooks,equipmentInstances}),JSON.stringify(summary)]);auditId=audit.insertId
    await c.execute('DELETE FROM player_inventory WHERE player_id=?',[playerId])
    await c.execute('DELETE FROM player_skill_books WHERE player_id=?',[playerId])
    const [removed]=await c.execute<ResultSetHeader>('DELETE g FROM equipment_instances g WHERE g.player_id=? AND NOT EXISTS (SELECT 1 FROM hero_equipment e WHERE e.instance_id=g.id)',[playerId])
    if(removed.affectedRows!==equipmentInstances.length)throw Error('未穿戴装备数量校验失败')
  }
  const [remaining]=await c.query<RowDataPacket[]>('SELECT (SELECT COUNT(*) FROM player_inventory WHERE player_id=?)+(SELECT COUNT(*) FROM player_skill_books WHERE player_id=?)+(SELECT COUNT(*) FROM equipment_instances g WHERE g.player_id=? AND NOT EXISTS (SELECT 1 FROM hero_equipment e WHERE e.instance_id=g.id)) total',[playerId,playerId,playerId])
  const [wornAfter]=await c.query<RowDataPacket[]>(wornSql,[playerId])
  if(Number(remaining[0].total)!==0||JSON.stringify(wornAfter)!==JSON.stringify(wornBefore))throw Error('清空包裹或保留穿戴装备校验失败')
  if(mode==='--apply')await c.commit();else await c.rollback()
  console.log(JSON.stringify({mode,message:mode==='--apply'?'包裹已清空，武将穿戴和已学技能保留，恢复数据已保存。':'完整清空流程及穿戴保护校验通过，已回滚，未删除实际库存。',...summary,auditId:mode==='--apply'?auditId:null},null,2))
}catch(e){await c.rollback();throw e}finally{if(locked)await c.query("SELECT RELEASE_LOCK('fenghuo_update')");await c.end()}
