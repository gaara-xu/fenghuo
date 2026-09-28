import { describe,expect,it } from 'vitest'
import { parseConfig } from '../server/config.js'

describe('database scope',()=>{
  it('accepts only the authorized database',()=>expect(parseConfig({DB_NAME:'fenghuo'} as NodeJS.ProcessEnv).DB_NAME).toBe('fenghuo'))
  it('rejects any other database name',()=>expect(()=>parseConfig({DB_NAME:'mysql'} as NodeJS.ProcessEnv)).toThrow())
})
