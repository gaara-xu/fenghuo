import 'dotenv/config'
import mysql from 'mysql2/promise'
import {readFile} from 'node:fs/promises'
import {parseConfig} from '../server/config.js'
import {migrateTreasureTavern} from './tavern-migration.js'
const cfg=parseConfig()
const sql=await readFile(new URL('../database/migrations/0014_tavern_treasure.sql',import.meta.url),'utf8')
const c=await mysql.createConnection({host:cfg.DB_HOST,port:cfg.DB_PORT,user:cfg.DB_USER,password:cfg.DB_PASSWORD,database:'fenghuo',charset:'utf8mb4',timezone:'Z',connectTimeout:10000})
try{console.log(await migrateTreasureTavern(c,sql)?'酒馆藏宝阁已加入，8000 金刷新三选一。未扣除资源，未改变现有包裹。':'酒馆藏宝阁已更新，保留现有配置。')}finally{await c.end()}
