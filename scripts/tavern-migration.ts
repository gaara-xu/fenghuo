import type {Connection,RowDataPacket} from 'mysql2/promise'
import {mapItem} from '../server/item-service.js'
import {eligibleTreasureItem,treasureWeight} from '../shared/tavern.js'
export const tavernMigrationVersion='0014_tavern_treasure'
export function migrationStatements(sql:string):string[]{
  const statements=sql.replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean)
  if(statements.some(s=>!/^ALTER TABLE `tavern_(pools|pool_entries|candidates|refreshes)` (MODIFY COLUMN|ADD COLUMN|ADD UNIQUE KEY|ADD CONSTRAINT) /.test(s)))throw Error('藏宝阁迁移包含非预期语句')
  return statements
}
export async function migrateTreasureTavern(c:Connection,sql:string):Promise<boolean>{
  const statements=migrationStatements(sql)
  const [scope]=await c.query<RowDataPacket[]>('SELECT DATABASE() db');if(scope[0].db!=='fenghuo')throw Error('数据库越界')
  const [lock]=await c.query<RowDataPacket[]>("SELECT GET_LOCK('fenghuo_update',10) acquired");if(Number(lock[0].acquired)!==1)throw Error('另一个更新正在进行')
  try{
    const [columns]=await c.query<RowDataPacket[]>("SHOW COLUMNS FROM item_definitions LIKE 'deleted_at'")
    if(!columns.length)throw Error('请先更新物品回收站结构：npm run db:update:treasury')
    const [done]=await c.query<RowDataPacket[]>('SELECT version FROM schema_migrations WHERE version=?',[tavernMigrationVersion])
    if(done.length)return false
    for(const sql of statements){
      const table=sql.match(/^ALTER TABLE `([^`]+)`/)![1]!,added=sql.match(/ADD (?:COLUMN|UNIQUE KEY|CONSTRAINT) `([^`]+)`/)
      if(added){const [rows]=await c.query<RowDataPacket[]>(`SHOW CREATE TABLE \`${table}\``);if(String(rows[0]['Create Table']).includes('`'+added[1]+'`'))continue}
      await c.query(sql)
    }
    await c.beginTransaction()
    // Preserve all previous rolls and their current claim limit before settings become editable.
    await c.execute('UPDATE tavern_refreshes r JOIN tavern_pools p ON p.id=r.pool_id SET r.select_limit_snapshot=p.select_limit WHERE r.select_limit_snapshot IS NULL')
    await c.execute("INSERT IGNORE INTO tavern_pools (code,name,pool_type,currency_code,refresh_cost,candidate_count,select_limit) VALUES ('treasure_standard','藏宝阁·珍宝','ITEM','gold',8000,3,1)")
    const [pools]=await c.query<RowDataPacket[]>("SELECT id FROM tavern_pools WHERE code='treasure_standard' FOR UPDATE")
    const [items]=await c.query<RowDataPacket[]>('SELECT * FROM item_definitions')
    for(const item of items.map(mapItem).filter(eligibleTreasureItem)){
      await c.execute("INSERT IGNORE INTO tavern_pool_entries (pool_id,reward_type,item_definition_id,weight) VALUES (?,'ITEM',?,?)",[pools[0].id,item.id,treasureWeight(item)])
    }
    await c.execute('INSERT INTO schema_migrations (version,description) VALUES (?,?)',[tavernMigrationVersion,'酒馆藏宝阁：装备宝物道具抽取、物品快照与每轮选取上限'])
    await c.commit();return true
  }catch(e){await c.rollback();throw e}finally{await c.query("SELECT RELEASE_LOCK('fenghuo_update')")}
}
