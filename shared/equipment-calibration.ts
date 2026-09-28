import {officialItems} from './official-catalog.js'
import type {HeroStats} from './hero-growth.js'
// Base values where recorded: March 2012 equipment guide. Other tiers/parts are
// explicitly estimated by role; this is not a recovered +0…+9 official table.
export const equipmentReference='https://www.juxia.com/news/2012-3-24/36051_2.html'
export const equipmentCalibration=officialItems.map(item=>{
  const c=item.effectConfig,slot=c.slot!,scale=item.rarity===5?1:item.rarity===4?.5:.2
  const theme=c.setCode?Number(c.setCode.replace('OFFICIAL_',''))%5:-1
  let values:Partial<HeroStats>={}
  if(slot==='HELMET'||slot==='SHOULDER')values={meleeDefense:theme===0?2000:1500,rangedDefense:theme===0?2000:1500}
  else if(slot==='ARMOR')values={meleeDefense:theme===0?3200:2500,rangedDefense:theme===0?3200:2500}
  else if(slot==='LEGS')values={loadCapacity:theme===3?50000:40000}
  else if(slot==='BOOTS')values={speed:theme===4?50:37}
  else if(slot==='NECKLACE')values={meleeAttack:theme===1?1500:1000,rangedAttack:theme===2?1500:1000}
  else if(slot==='BRACELET')values={meleeAttack:theme===3?500:1000}
  else if(slot==='RING')values={rangedAttack:theme===3?500:1000}
  else if(slot==='MOUNT')values={speed:37}
  else if(slot==='SHIELD')values={meleeDefense:item.name==='巡天曜日旗'?3000:2500,rangedDefense:item.name==='巡天曜日旗'?3000:2500}
  else if(slot==='WEAPON'){
    const ranged=/弓|弩|轮回|痴狂|离别/.test(item.name),power:Record<string,number>={幻神:2500,镇狱:2000,轮回:2500,痴狂:2000,离别:1600}
    values={[ranged?'rangedAttack':'meleeAttack']:power[item.name]??2000}
  }
  return {code:item.code,name:item.name,flatBonuses:Object.fromEntries(Object.entries(values).map(([k,v])=>[k,Math.round(v*scale)])) as Partial<HeroStats>}
})
