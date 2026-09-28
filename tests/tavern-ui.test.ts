import {describe,it,expect} from 'vitest'
import {createSSRApp,h} from 'vue'
import {renderToString} from 'vue/server-renderer'
import TavernCandidates from '../web/TavernCandidates.vue'
import type {TavernRefreshResult} from '../shared/contracts'
const result:TavernRefreshResult={refreshId:100,pool:{id:3,name:'藏宝阁',code:'treasure_standard',poolType:'ITEM',currencyCode:'gold',refreshCost:8000,candidateCount:3,selectLimit:1,enabled:true},remainingCurrency:1,createdAt:'2026-09-17',candidates:[{id:200,slotNo:1,rewardType:'ITEM',itemDefinitionId:12,name:'测试虎符',rarity:6,recruited:false,item:{id:12,name:'测试虎符',code:'a',itemType:'TREASURE',rarity:6,qualityTier:7,enabled:true,description:'统率千军。',effectConfig:{bonuses:{meleeAttack:20},icon:'/art/test.png'}}}]}
const render=(r=result,heroCount=6)=>renderToString(createSSRApp({render:()=>h(TavernCandidates,{result:r,heroCount,heroes:[],skills:[],busy:false})}))
describe('藏宝阁候选展示',()=>{
  it('保留图标品质与领取按钮，移除常驻说明及属性展开栏',async()=>{
    const html=await render();expect(html).toContain('quality-7');expect(html).toContain('/art/test.png');expect(html).toContain('宝物 × 1');expect(html).not.toContain('统率千军。');expect(html).not.toContain('近攻 +20%');expect(html).not.toContain('<details');expect(html).not.toContain('查看详细属性');expect(html).toContain('收入包裹');expect(html).not.toContain('disabled');expect(html).not.toContain('已招募')
  })
  it('领取后展示入包与查看包裹，剩余候选禁用，刷新后可恢复该状态',async()=>{
    const c=result.candidates[0],html=await render({...result,candidates:[{...c,recruited:true},{...c,id:201,slotNo:2}]})
    expect(html).toContain('已收入包裹');expect(html).toContain('查看包裹');expect(html).toContain('还可选 0 件');expect(html).toContain('本轮已选完');expect(html.match(/<button disabled/g)).toHaveLength(2)
  })
  it('无图片的消耗道具使用包裹图形，不出现缺失图片或待配图',async()=>{
    const c=result.candidates[0],html=await render({...result,candidates:[{...c,item:{...c.item!,itemType:'CONSUMABLE',effectConfig:{kind:'EXPERIENCE',amount:100}}}]})
    expect(html).toContain('<svg');expect(html).toContain('消耗道具');expect(html).not.toContain('待配图')
  })
})
