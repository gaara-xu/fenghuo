export const dynamicNodeTypes=['OUTPOST','WILD','RANDOM_CITY'] as const
export type DynamicNodeType=typeof dynamicNodeTypes[number]
export const scheduledTasks=[
  {id:'refresh-outposts',name:'刷新据点',description:'重置未被行军锁定的据点，缺少时补足至少4个；随机1至20级，16至20级合计60%，其中20级12%；额外按后台概率生成世界首领（默认200级，游戏时间5分钟后消失），已有首领保留。',suggestion:'每小时一次',nodeTypes:['OUTPOST']},
  {id:'refresh-wilds',name:'刷新野地',description:'重置未被行军锁定的野地，缺少时补足至少4个；额外按后台概率生成世界首领（默认200级，游戏时间5分钟后消失），已有首领保留；不修改据点、副本和城池。',suggestion:'每2小时一次',nodeTypes:['WILD']},
  {id:'refresh-random-cities',name:'刷新随机城池',description:'重置未被行军锁定的无主城池，缺少时补足至少4个；不修改系统城。',suggestion:'每6小时一次',nodeTypes:['RANDOM_CITY']},
  {id:'refresh-map',name:'刷新全部动态目标',description:'一次刷新据点、野地、随机城池，并参与世界首领随机出现；不改变副本、系统城和在途目标。与前三项按需二选一，避免重复刷新。',suggestion:'每小时一次（综合方案）',nodeTypes:['OUTPOST','WILD','RANDOM_CITY']},
  {id:'cleanup-records',name:'清理过期记录',description:'主动出征战报只保留最新50条，清理已返城的普通任务及无行军引用的0级据点；不删除被攻击战报和自动出征记录。',suggestion:'每天一次（可选；游戏结算也会维护）',nodeTypes:[]},
] as const
export type ScheduledTaskId=typeof scheduledTasks[number]['id']
export const taskPath=(id:ScheduledTaskId)=>'/api/admin/tasks/'+id+'/run'
export interface TaskRunResult {ok:true;taskId:ScheduledTaskId;requestId:string;replayed:boolean;completedAt:string;summary:string;generation?:number}
export interface TaskDescriptor {id:ScheduledTaskId;name:string;description:string;suggestion:string;path:string;method:'GET';lastSuccess:TaskRunResult|null}
export interface TaskCatalog {tasks:TaskDescriptor[];authRequired:boolean;retainedRunsPerTask:number}
