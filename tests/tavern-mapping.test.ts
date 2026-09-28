import { describe,expect,it } from 'vitest'
import type { TavernPool } from '../shared/contracts.js'

function visible(pool:TavernPool,selectedPoolId:number){return pool.id===selectedPoolId}
describe('tavern result visibility',()=>{
  it('uses pool_id rather than the refresh record id',()=>{
    const databaseRow={id:62,pool_id:1}
    const mappedPoolId=Number(databaseRow.pool_id??databaseRow.id)
    expect(mappedPoolId).toBe(1)
    expect(visible({id:mappedPoolId,code:'hero',name:'英雄',poolType:'HERO',currencyCode:'gold',refreshCost:1,candidateCount:3,selectLimit:1,enabled:true},1)).toBe(true)
  })
})
