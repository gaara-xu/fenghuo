export const qualityLabels=['','白色','蓝色','黄色','绿色','蓝紫色','橙黄色','红色']
export function qualityTier(rarity:number,override?:number){return Math.max(1,Math.min(7,override??rarity))}
