import { describe,expect,it } from 'vitest'
import { battleOutcome,heroPower } from '../server/domain/battle.js'

const hero={level:1,meleeAttack:100,rangedAttack:80,meleeDefense:70,rangedDefense:60}
describe('battle calculation',()=>{
  it('is deterministic and exposes auditable power values',()=>expect(battleOutcome(hero,250,'same')).toEqual(battleOutcome(hero,250,'same')))
  it('lets clearly stronger heroes win and weaker heroes lose',()=>{expect(battleOutcome(hero,50,'a').victory).toBe(true);expect(battleOutcome(hero,2000,'b').victory).toBe(false)})
  it('calculates a positive power score',()=>expect(heroPower(hero)).toBeGreaterThan(0))
})
