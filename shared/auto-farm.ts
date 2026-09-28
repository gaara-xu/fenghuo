import type {ArmyStack} from './military.js'

export interface AutoFarmConfig {
  units:ArmyStack[]
  cycleVersion?:2
  targetNodeId?:number
  targetName?:string
  totalRuns?:number|null
  completedRuns?:number
}
export function readFarmConfig(raw:unknown):AutoFarmConfig {
  const value=typeof raw==='string'?JSON.parse(raw):raw
  return value&&typeof value==='object'?{...value,units:Array.isArray(value.units)?value.units:[]}:{units:[]}
}
export function farmReturnProgress(raw:unknown,remaining:number|null,countsOnReturn:boolean){
  const config=readFarmConfig(raw)
  return {
    remaining:remaining===null?null:Math.max(0,remaining-(countsOnReturn?1:0)),
    config:{...config,cycleVersion:2 as const,totalRuns:config.totalRuns??(remaining===null?null:remaining+(countsOnReturn?0:1)),completedRuns:(config.completedRuns??0)+1},
  }
}
