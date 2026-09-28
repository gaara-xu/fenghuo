import { readFileSync } from 'node:fs'
import { describe,expect,it } from 'vitest'

const schema=readFileSync(new URL('../database/schema.sql',import.meta.url),'utf8')
describe('canonical schema safety',()=>{
  it('targets only fenghuo and never drops a database',()=>{
    expect(schema).toMatch(/USE `fenghuo`/)
    expect(schema).not.toMatch(/DROP\s+DATABASE/i)
    expect(schema).not.toMatch(/(?:FROM|JOIN|UPDATE|INTO)\s+`?(?!fenghuo\b)[a-z0-9_]+\.[a-z0-9_]+/i)
  })
  it('contains the core persistent systems',()=>{
    for(const table of ['hero_definitions','skill_definitions','tavern_pool_entries','tavern_refreshes','tavern_candidates','map_nodes','march_orders','auto_farm_jobs','admin_audit_logs']) expect(schema).toContain(`\`${table}\``)
  })
})
