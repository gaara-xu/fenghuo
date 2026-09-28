import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import mysql, { type RowDataPacket } from 'mysql2/promise'
import { parseConfig } from '../server/config.js'

const config=parseConfig()
const seedPath=path.resolve(process.cwd(),'database/seeds/0001_demo_catalog.sql')
const sql=await readFile(seedPath,'utf8')
const connection=await mysql.createConnection({host:config.DB_HOST,port:config.DB_PORT,user:config.DB_USER,password:config.DB_PASSWORD,database:'fenghuo',multipleStatements:true,charset:'utf8mb4'})
try{
  const [before]=await connection.query<RowDataPacket[]>('SELECT DATABASE() currentDatabase')
  if(before[0]?.currentDatabase!=='fenghuo') throw new Error('Refusing to seed outside fenghuo')
  await connection.query(sql)
  console.log('Applied development catalog to fenghuo only.')
}finally{ await connection.end() }
