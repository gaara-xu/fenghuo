import type {Connection,RowDataPacket} from 'mysql2/promise'
import {MAX_DROP_QUANTITY} from '../shared/drop-rules.js'
export const outpostGemRateVersion='0017_outpost_gem_rates'
export const outpostGemQuantityVersion='0018_outpost_gem_quantities'
export const outpostGemPoolCodes=['gem_outpost_low','gem_outpost_mid','gem_outpost_high'] as const
export const outpostGemBaseChance=1
export const outpostGemQuantityRange={minQuantity:1,maxQuantity:MAX_DROP_QUANTITY} as const

// One-time configuration update; caller owns transaction and update lock.
// Preserve quantities, gem-grade weights, pool enablement and every other pool.
export async function applyOutpostGemRateUpdate(c:Connection):Promise<boolean>{
  const [scope]=await c.query<RowDataPacket[]>('SELECT DATABASE() db')
  if(scope[0]?.db!=='fenghuo')throw Error('数据库越界')
  const [done]=await c.query<RowDataPacket[]>('SELECT version FROM schema_migrations WHERE version=?',[outpostGemRateVersion])
  if(done.length)return false
  const [pools]=await c.query<RowDataPacket[]>('SELECT id,code,node_type FROM drop_pools WHERE code IN (?,?,?) FOR UPDATE',[...outpostGemPoolCodes])
  if(pools.length!==3||pools.some(p=>p.node_type!=='OUTPOST'))throw Error('据点宝石池配置缺失或类型不匹配，请先检查宝石更新')
  for(const pool of pools)await c.execute('UPDATE drop_pools SET chance=? WHERE id=?',[outpostGemBaseChance,pool.id])
  await c.execute('INSERT INTO schema_migrations (version,description) VALUES (?,?)',[outpostGemRateVersion,'三档据点宝石池基础概率提高至100%；保留等级系数、原数量与权重，其他池不变'])
  return true
}

// Separate migration so saves that already received 0017 also get the quantity fix.
// Caller owns the transaction/lock; leave chance, weights, enablement and inventory intact.
export async function applyOutpostGemQuantityUpdate(c:Connection):Promise<boolean>{
  const [scope]=await c.query<RowDataPacket[]>('SELECT DATABASE() db')
  if(scope[0]?.db!=='fenghuo')throw Error('数据库越界')
  const [done]=await c.query<RowDataPacket[]>('SELECT version FROM schema_migrations WHERE version=?',[outpostGemQuantityVersion])
  if(done.length)return false
  const [pools]=await c.query<RowDataPacket[]>('SELECT id,code,node_type FROM drop_pools WHERE code IN (?,?,?) FOR UPDATE',[...outpostGemPoolCodes])
  if(pools.length!==3||pools.some(p=>p.node_type!=='OUTPOST'))throw Error('据点宝石池配置缺失或类型不匹配，请先检查宝石更新')
  const [entries]=await c.query<RowDataPacket[]>('SELECT e.pool_id,e.item_definition_id,i.item_type,i.effect_config FROM drop_pool_entries e JOIN item_definitions i ON i.id=e.item_definition_id WHERE e.pool_id IN (?,?,?) FOR UPDATE',pools.map(p=>p.id))
  const gems=entries.filter(e=>{
    const effect=typeof e.effect_config==='string'?JSON.parse(e.effect_config):e.effect_config
    return e.item_type==='MATERIAL'&&effect?.gemFamily&&Number(effect.gemLevel)>=1
  })
  if(pools.some(p=>!gems.some(e=>e.pool_id===p.id)))throw Error('据点宝石池缺少宝石条目，请先检查配置')
  for(const gem of gems)await c.execute('UPDATE drop_pool_entries SET min_quantity=?,max_quantity=? WHERE pool_id=? AND item_definition_id=?',[outpostGemQuantityRange.minQuantity,outpostGemQuantityRange.maxQuantity,gem.pool_id,gem.item_definition_id])
  await c.execute('INSERT INTO schema_migrations (version,description) VALUES (?,?)',[outpostGemQuantityVersion,'三档据点宝石单次掉落数量改为随机1至1000颗；概率、宝石等级权重、启停及已有库存不变'])
  return true
}
