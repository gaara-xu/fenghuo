import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import mysql, { type RowDataPacket } from 'mysql2/promise'
import { parseConfig } from '../server/config.js'

const config=parseConfig()
const schemaPath=path.resolve(process.cwd(),'database/schema.sql')
if(!schemaPath.startsWith(path.resolve(process.cwd())+path.sep)) throw new Error('Schema path escaped project directory')
const sql=await readFile(schemaPath,'utf8')
const connection=await mysql.createConnection({host:config.DB_HOST,port:config.DB_PORT,user:config.DB_USER,password:config.DB_PASSWORD,multipleStatements:true,charset:'utf8mb4'})
try{
  await connection.query(sql)
  const [rows]=await connection.query<RowDataPacket[]>('SELECT DATABASE() currentDatabase')
  if(rows[0]?.currentDatabase!=='fenghuo') throw new Error('Database scope verification failed')
  console.log('Applied canonical schema to fenghuo only.')
}finally{ await connection.end() }
