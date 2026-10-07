import {afterEach,describe,it,expect,vi} from 'vitest'
import {nextTick,createSSRApp} from 'vue'
import {renderToString} from '@vue/server-renderer'
import {readFarmConfig,farmReturnProgress} from '../shared/auto-farm'
import {targetAfterAttack,outpostDefense} from '../shared/world-rules'
import * as military from '../shared/military'
import * as labels from '../shared/labels'
import {travelSeconds} from '../server/domain/travel'
import {marchRoute,routeDistance} from '../shared/map-routes'
import DispatchTroops from '../web/DispatchTroops.vue'
import {clientComponent} from './vue-client'
import {renderClient,content} from './ui-renderer'
afterEach(()=>vi.unstubAllGlobals())

describe('目标降级与往返计次',()=>{
  it('所有类型每战减一级，不给非据点套上20级上限，0级耗尽',()=>{
    for(const type of ['OUTPOST','WILD','DUNGEON','SYSTEM_CITY','RANDOM_CITY']){
      expect(targetAfterAttack(type,3,900)).toMatchObject({level:2,status:'ACTIVE'})
      expect(targetAfterAttack(type,1,300)).toEqual({level:0,power:0,status:'DEPLETED'})
      expect(targetAfterAttack(type,0,300)).toEqual({level:0,power:0,status:'DEPLETED'})
    }
    expect(targetAfterAttack('SYSTEM_CITY',50,15000)).toEqual({level:49,power:14700,status:'ACTIVE'})
    expect(targetAfterAttack('OUTPOST',20,1).power).toBe(outpostDefense(19))
  })
  it('兼容空快照；读写不丢失锁定目标与累计进度',()=>{
    expect(readFarmConfig(null)).toEqual({units:[]})
    const raw=JSON.stringify({units:[],targetNodeId:123,targetName:'秦都',cycleVersion:2,totalRuns:10,completedRuns:3})
    const result=farmReturnProgress(raw,7,true)
    expect(result.remaining).toBe(6)
    expect(result.config).toMatchObject({targetNodeId:123,targetName:'秦都',totalRuns:10,completedRuns:4,cycleVersion:2,units:[]})
  })
  it('旧版在途已扣次数不再扣一次；不限次数不被转为有限次数',()=>{
    expect(farmReturnProgress(null,9,false)).toEqual({remaining:9,config:{units:[],cycleVersion:2,totalRuns:10,completedRuns:1}})
    expect(farmReturnProgress({units:[],totalRuns:null,completedRuns:12},null,true)).toMatchObject({remaining:null,config:{totalRuns:null,completedRuns:13}})
    expect(farmReturnProgress(null,0,true).remaining).toBe(0)
  })
})

const Record=clientComponent('web/AutoFarmRecord.vue',{'../shared/military':military,'../shared/labels':labels})
describe('自动出征进度界面',()=>{
  it('显示真实往返耗时、返城倒计时和已完成轮数，支持暂停与历史兼容',async()=>{
    const pause=vi.fn(),job={id:1,heroId:1,heroName:'章邯',nodeType:'OUTPOST',targetName:'秦军据点',minLevel:20,maxLevel:20,runsRemaining:9,totalRuns:10,completedRuns:1,status:'ACTIVE',phase:'RETURNING',nextRunGameAt:'2027-01-01T00:01:00Z',roundTripSeconds:46}
    const v=renderClient(Record,{job,busy:false,gameTime:Date.parse('2027-01-01T00:00:40Z'),onPause:pause})
    try{
      expect(content(v.root)).toContain('已往返 1 / 10 次');expect(content(v.root)).toContain('本轮往返 46秒');expect(content(v.root)).toContain('20秒 后返城')
      v.find('button','暂停')!.props.onClick();expect(pause).toHaveBeenCalledExactlyOnceWith(1)
      v.props.busy=true;await nextTick();expect(v.find('button','暂停')!.props.disabled).toBe(true)
      v.props.job={...job,status:'COMPLETED',phase:'WAITING',completedRuns:10,runsRemaining:0};await nextTick()
      expect(content(v.root)).toContain('已往返 10 / 10 次');expect(content(v.root)).not.toContain('后返城');expect(v.find('button','暂停')).toBeUndefined()
      v.props.job={...job,status:'COMPLETED',phase:'WAITING',completedRuns:undefined,totalRuns:undefined};await nextTick();expect(content(v.root)).toContain('余 9 次')
    }finally{v.app.unmount()}
  })
  it('调兵预览与服务端共用距离移速公式，往返为单程两倍',async()=>{
    const d=military.militaryDefaults.find(d=>d.code==='pikeman')!,node={x:0,y:0},oneWay=Math.ceil(travelSeconds(routeDistance(marchRoute(node)),d.speed))
    const html=await renderToString(createSSRApp(DispatchTroops,{state:{ready:true,definitions:[d],stock:{pikeman:10},orders:[],defense:{melee:0,ranged:0}},selection:{pikeman:10},node,busy:false}))
    expect(html).toContain('单程');expect(html).toContain(military.durationText(oneWay));expect(html).toContain('往返一轮');expect(html).toContain(military.durationText(oneWay*2));expect(html).not.toContain('<select')
  })
})
