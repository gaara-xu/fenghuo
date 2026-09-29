import mysql, { type Pool, type PoolConnection, type RowDataPacket } from 'mysql2/promise'
import { config } from './config.js'

let singleton: Pool | undefined

export async function closePool(): Promise<void> {
  const pool = singleton; singleton = undefined
  if (pool) await pool.end()
}

export function getPool(): Pool {
  singleton ??= mysql.createPool({
    host: config.DB_HOST,
    port: config.DB_PORT,
    database: 'fenghuo',
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    charset: 'utf8mb4',
    connectionLimit: 10,
    waitForConnections: true,
    timezone: 'Z',
    decimalNumbers: true,
  })
  return singleton
}

export async function assertDatabaseScope(connection: Pool | PoolConnection): Promise<void> {
  const [rows] = await connection.query<RowDataPacket[]>('SELECT DATABASE() AS currentDatabase')
  if (rows[0]?.currentDatabase !== 'fenghuo') {
    throw new Error(`Database scope violation: expected fenghuo, received ${String(rows[0]?.currentDatabase)}`)
  }
}

export async function inTransaction<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await getPool().getConnection()
  try {
    await assertDatabaseScope(connection)
    await connection.beginTransaction()
    const result = await work(connection)
    await connection.commit()
    return result
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}
