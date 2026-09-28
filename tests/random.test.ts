import { describe,expect,it } from 'vitest'
import { pickTalent,SeededRandom } from '../server/domain/random.js'

describe('SeededRandom',()=>{
  it('replays the same draw sequence from the same seed',()=>{
    const pool=[{name:'common',weight:90},{name:'rare',weight:10}]
    const a=new SeededRandom('audit-seed'); const b=new SeededRandom('audit-seed')
    expect(Array.from({length:30},()=>a.pickWeighted(pool).name)).toEqual(Array.from({length:30},()=>b.pickWeighted(pool).name))
  })
  it('never selects a zero weight item',()=>{
    const rng=new SeededRandom('zero-weight')
    expect(Array.from({length:20},()=>rng.pickWeighted([{name:'never',weight:0},{name:'yes',weight:1}]).name)).toEqual(Array(20).fill('yes'))
  })
  it('draws a valid talent grade',()=>{
    expect(['MEDIOCRE','COMMON','GOOD','EXCELLENT','PERFECT']).toContain(pickTalent(new SeededRandom('talent')))
  })
})
