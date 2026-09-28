import type {Connection,RowDataPacket} from 'mysql2/promise'
import {defaultWorldBossRules} from '../shared/world-boss.js'
export const worldBossUpdateVersion='0020_world_boss'
export async function applyWorldBossUpdate(c:Connection){
  const [scope]=await c.query<RowDataPacket[]>('SELECT DATABASE() db');if(scope[0]?.db!=='fenghuo')throw Error('数据库越界')
  const [done]=await c.query<RowDataPacket[]>('SELECT version FROM schema_migrations WHERE version=?',[worldBossUpdateVersion]);if(done.length)return false
  await c.execute("INSERT IGNORE INTO game_settings (setting_key,setting_value,value_type,description) VALUES ('world_boss_rules',?,'JSON','世界首领刷新概率、逐物品掉率与分类数量；仅用于首领，普通目标不变')",[JSON.stringify(defaultWorldBossRules)])
  await c.execute('INSERT INTO schema_migrations (version,description) VALUES (?,?)',[worldBossUpdateVersion,'200级世界首领：WILD节点garrison_config.worldBoss标识；击败一次消失；豪华掉落；无DDL，不改现有地图库存'])
  return true
}
