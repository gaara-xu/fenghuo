import type {PoolConnection,RowDataPacket} from 'mysql2/promise'
import {getPool} from './db.js'
export interface TavernRecording {enabled:boolean;afterRefreshId:number}
export async function readTavernRecording(c:PoolConnection|ReturnType<typeof getPool>=getPool()):Promise<TavernRecording>{
 const [rows]=await c.query<RowDataPacket[]>("SELECT setting_value FROM game_settings WHERE setting_key='tavern_recording'")
 // Upgrade compatibility: preserve existing rounds until the administrator turns recording off.
 if(!rows.length)return {enabled:true,afterRefreshId:0}
 const value=typeof rows[0].setting_value==='string'?JSON.parse(rows[0].setting_value):rows[0].setting_value
 if(typeof value?.enabled!=='boolean'||!Number.isSafeInteger(value.afterRefreshId)||value.afterRefreshId<0)throw Error('酒馆记录开关配置无效')
 return value
}
