import {qualityLabels} from '../shared/quality'
export function labelOptions<T extends string>(labels:Record<T,string>):Array<{id:T;label:string}>{return (Object.entries(labels) as [T,string][]).map(([id,label])=>({id,label}))}
export const qualityOptions=qualityLabels.slice(1).map((label,index)=>({id:index+1,label,quality:index+1}))
