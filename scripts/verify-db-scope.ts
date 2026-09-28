import 'dotenv/config'
import mysql, { type RowDataPacket } from 'mysql2/promise'
import { parseConfig } from '../server/config.js'

const config=parseConfig()
const connection=await mysql.createConnection({host:config.DB_HOST,port:config.DB_PORT,user:config.DB_USER,password:config.DB_PASSWORD,database:'fenghuo',charset:'utf8mb4'})
try{
  const [scope]=await connection.query<RowDataPacket[]>('SELECT DATABASE() currentDatabase, VERSION() serverVersion')
  if(scope[0]?.currentDatabase!=='fenghuo') throw new Error('Database scope verification failed')
  console.log(`Scope OK: database=fenghuo, server=${scope[0].serverVersion}`)
}finally{ await connection.end() }
