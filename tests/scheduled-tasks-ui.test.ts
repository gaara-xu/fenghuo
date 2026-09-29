import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest'
import {h,nextTick} from 'vue'
import {clientComponent} from './vue-client'
import {renderClient,content} from './ui-renderer'
import {useTimedNotice} from '../web/timed-notice'
import * as tasks from '../shared/scheduled-tasks'
const api=vi.fn(),actionId=vi.fn()
const Component=clientComponent('web/ScheduledTasks.vue',{'./api':{api,actionId},'./timed-notice':{useTimedNotice},'../shared/scheduled-tasks':tasks})
const catalog=(authRequired=false)=>({authRequired,retainedRunsPerTask:50,tasks:tasks.scheduledTasks.map(task=>({...task,path:tasks.taskPath(task.id),method:'GET',lastSuccess:null}))})
const flush=async()=>{for(let i=0;i<4;i++){await Promise.resolve();await nextTick()}}
const mount=()=>renderClient({setup(){Object.assign(window,{location:{origin:'http://game.local:5173'}});return()=>h(Component)}},{})
type View=ReturnType<typeof mount>
const button=(v:View,name:string)=>v.all().find(n=>n.type==='button'&&n.props['aria-label']===name)!
function success(url:string){const parsed=new URL(url,'http://game.local:5173'),taskId=tasks.scheduledTasks.find(t=>tasks.taskPath(t.id)===parsed.pathname)!.id;return {ok:true,taskId,requestId:parsed.searchParams.get('requestId'),replayed:false,completedAt:'2026-09-29T01:00:00.000Z',summary:'本次任务已完成'}}
beforeEach(()=>{vi.useFakeTimers();api.mockReset().mockImplementation(async(url:string)=>url==='/api/admin/tasks'?catalog():success(url));let sequence=0;actionId.mockReset().mockImplementation(()=>`manual-${++sequence}`)})
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals()})
describe('后台定时任务手动执行',()=>{
 it('六项任务均有执行按钮，进入和轮询只读列表，卸载停止轮询，无系统选择或确认窗口',async()=>{
  const v=mount()
  try{await flush();expect(api).toHaveBeenCalledExactlyOnceWith('/api/admin/tasks');expect(v.all().filter(n=>String(n.props.class).includes('task-run'))).toHaveLength(6);expect(v.all().some(n=>['select','dialog'].includes(n.type))).toBe(false)
   await vi.advanceTimersByTimeAsync(10000);await flush();expect(api.mock.calls.every(([url])=>url==='/api/admin/tasks')).toBe(true)
  }finally{v.app.unmount()}
  api.mockClear();await vi.advanceTimersByTimeAsync(20000);expect(api).not.toHaveBeenCalled()
 })
 it('一次点击只发一个GET；请求中防连点及其他任务并发，成功立即更新最近执行状态，提示一秒消失',async()=>{
  const v=mount()
  try{await flush();let resolve!:(value:unknown)=>void;api.mockImplementationOnce(()=>new Promise(r=>{resolve=r}))
   const click=button(v,'刷新据点执行一次').props.onClick;click();click();button(v,'刷新野地执行一次').props.onClick();await flush()
   expect(api).toHaveBeenCalledTimes(2);expect(api.mock.calls[1]).toEqual(['/api/admin/tasks/refresh-outposts/run?requestId=manual-1',expect.objectContaining({method:'GET',cache:'no-store',headers:{}})])
   expect(v.find('button','执行中…')!.props.disabled).toBe(true);expect(button(v,'刷新野地执行一次').props.disabled).toBe(true)
   await vi.advanceTimersByTimeAsync(10000);expect(api).toHaveBeenCalledTimes(2)
   resolve(success(api.mock.calls[1][0]));await flush();expect(button(v,'刷新据点执行一次').props.disabled).toBe(false);expect(content(v.root)).toContain('本次任务已完成');expect(content(v.byClass('toast')!)).toBe('刷新据点已执行')
   await vi.advanceTimersByTimeAsync(1000);await flush();expect(v.byClass('toast')).toBeUndefined();expect(content(v.root)).toContain('本次任务已完成')
  }finally{v.app.unmount()}
 })
 it('所有按钮调用各自的当前游戏接口；可复制地址的改动不会将执行请求发到其他服务器，成功后再次执行使用新编号',async()=>{
  const v=mount()
  try{await flush();v.all().find(n=>n.props['aria-label']==='调度访问根地址')!.props['onUpdate:modelValue']('https://other.example');await flush()
   for(const task of tasks.scheduledTasks){button(v,task.name+'执行一次').props.onClick();await flush();expect(api.mock.lastCall?.[0]).toBe(tasks.taskPath(task.id)+'?requestId=manual-'+(tasks.scheduledTasks.indexOf(task)+1))}
   button(v,'刷新据点执行一次').props.onClick();await flush();expect(api.mock.lastCall?.[0]).toBe('/api/admin/tasks/refresh-outposts/run?requestId=manual-7');expect(api.mock.calls.some(([url])=>url.includes('other.example'))).toBe(false)
  }finally{v.app.unmount()}
 })
 it.each(['网络错误','未确认结果','超时'])('%s不显示成功，失败重试复用编号，成功后解除重试状态',async(kind)=>{
  const v=mount()
  try{await flush();if(kind==='未确认结果')api.mockResolvedValueOnce({ok:false});else api.mockRejectedValueOnce(kind==='超时'?Object.assign(Error('timeout'),{name:'TimeoutError'}):TypeError('Failed to fetch'))
   button(v,'刷新据点执行一次').props.onClick();await flush();expect(content(v.root)).not.toContain('本次任务已完成');expect(content(v.byClass('toast')!)).toContain('重试本次请求');expect(button(v,'刷新据点重试本次').props.disabled).toBe(false)
   await vi.advanceTimersByTimeAsync(1000);await flush();expect(v.byClass('toast')).toBeUndefined()
   button(v,'刷新据点重试本次').props.onClick();await flush();expect(api.mock.calls[1][0]).toBe(api.mock.calls[2][0]);expect(actionId).toHaveBeenCalledOnce();expect(button(v,'刷新据点执行一次')).toBeDefined()
  }finally{v.app.unmount()}
 })
 it('启用令牌时需填写，仅通过请求头发送，不放入URL、复制示例或本地存储',async()=>{
  api.mockResolvedValueOnce(catalog(true));const v=mount()
  try{await flush();expect(button(v,'刷新据点执行一次').props.disabled).toBe(true);button(v,'刷新据点执行一次').props.onClick();expect(api).toHaveBeenCalledTimes(1)
   const token='private-scheduler-token-123456';v.all().find(n=>n.props['aria-label']==='手动执行调度令牌')!.props['onUpdate:modelValue'](' '+token+' ');await flush();button(v,'刷新据点执行一次').props.onClick();await flush()
   expect(api.mock.calls[1][1].headers).toEqual({Authorization:'Bearer '+token});expect(api.mock.calls[1][0]).not.toContain(token);expect(v.all().filter(n=>n.type==='pre').every(n=>!content(n).includes(token))).toBe(true)
  }finally{v.app.unmount()}
 })
})
