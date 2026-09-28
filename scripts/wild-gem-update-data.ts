import type {Connection,RowDataPacket} from 'mysql2/promise'
import {originalGems} from '../shared/gems.js'
import {wildGemDropDefaults as defaults} from '../shared/drop-rules.js'
export const wildGemUpdateVersion='0016_wild_gem_drops'

// Caller owns the transaction and migration lock. No DDL or inventory mutation.
export async function applyWildGemUpdate(c:Connection):Promise<boolean>{
  const [scope]=await c.query<RowDataPacket[]>('SELECT DATABASE() db')
  if(scope[0]?.db!=='fenghuo')throw Error('数据库越界')
  const [done]=await c.query<RowDataPacket[]>('SELECT version FROM schema_migrations WHERE version=?',[wildGemUpdateVersion])
  if(done.length)return false
  const codes=originalGems.filter(g=>g.effectConfig.gemLevel===1).map(g=>g.code)
  const [gems]=await c.query<RowDataPacket[]>('SELECT id,code FROM item_definitions WHERE code IN ('+codes.map(()=>'?').join(',')+')',codes)
  if(gems.length!==5)throw Error('缺少五系一级宝石，请先执行英雄宝石更新')
  await c.execute('INSERT IGNORE INTO drop_pools (code,name,node_type,min_level,max_level,chance,rolls,enabled) VALUES (?,?,?,?,?,?,?,1)',[defaults.code,defaults.name,defaults.nodeType,defaults.minLevel,defaults.maxLevel,defaults.chance,defaults.rolls])
  const [pools]=await c.query<RowDataPacket[]>('SELECT id,node_type FROM drop_pools WHERE code=? FOR UPDATE',[defaults.code])
  if(pools[0].node_type!=='WILD')throw Error('野地宝石池编号被其他目标类型占用')
  for(const gem of gems)await c.execute('INSERT INTO drop_pool_entries (pool_id,item_definition_id,weight,min_quantity,max_quantity,enabled) VALUES (?,?,?,?,?,1) ON DUPLICATE KEY UPDATE min_quantity=VALUES(min_quantity),max_quantity=VALUES(max_quantity)',[pools[0].id,gem.id,defaults.weight,defaults.minQuantity,defaults.maxQuantity])
  await c.execute('INSERT INTO schema_migrations (version,description) VALUES (?,?)',[wildGemUpdateVersion,'独立野地一级宝石池；五系等权，单次随机1至1000颗；不改变据点副本或已有库存'])
  return true
}
