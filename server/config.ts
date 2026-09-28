import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(18770),
  HOST: z.string().default('0.0.0.0'),
  DB_HOST: z.string().default('192.168.3.110'),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_NAME: z.literal('fenghuo').default('fenghuo'),
  DB_USER: z.string().default('root'),
  DB_PASSWORD: z.string().default(''),
  PLAYER_ID: z.coerce.number().int().positive().default(1),
  SCHEDULER_TOKEN: z.union([z.literal(''),z.string().min(24).max(256)]).default(''),
})

export type AppConfig = z.infer<typeof envSchema>

export function parseConfig(input: NodeJS.ProcessEnv = process.env): AppConfig {
  return envSchema.parse(input)
}

export const config = parseConfig()
