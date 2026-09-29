import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest'
import {nextTick} from 'vue'
import {clientComponent} from './vue-client'
import {renderClient,content} from './ui-renderer'
import {useTimedNotice} from '../web/timed-notice'
import * as update from '../shared/game-update'
const api=vi.fn(),actionId=vi.fn(()=> 'request-1234'),reload=vi.fn()
const Component=clientComponent('web/GameUpdater.vue',{'./api':{api,actionId},'./timed-notice':{useTimedNotice},'../shared/game-update':update})
const base={...update.unsupportedUpdate(),supported:true,currentRevision:'a'.repeat(40)}
const flush=async()=>{await Promise.resolve();await nextTick();await Promise.resolve();await nextTick()}
beforeEach(()=>{vi.useFakeTimers();vi.stubGlobal('window',{location:{reload}});api.mockReset().mockResolvedValue(structuredClone(base));reload.mockReset()})
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals()})
describe('后台一键更新',()=>{
 it('进入只读状态、不自动拉代码；直接一键更新，无确认和系统选择框，重复点击受阻',async()=>{
  const v=renderClient(Component,{})
  try{await flush();expect(api).toHaveBeenCalledExactlyOnceWith('/api/admin/game-update/status');expect(v.all().some(n=>n.type==='select')).toBe(false)
   api.mockResolvedValue({...base,busy:true,phase:'fetching'});const click=v.find('button','更新游戏')!.props.onClick;click();click();await flush()
   expect(api).toHaveBeenCalledTimes(2);expect(api.mock.calls[1][0]).toBe('/api/admin/game-update/run');expect(api.mock.calls[1][1]).toMatchObject({method:'POST',headers:{'X-Fenghuo-Update':'1'}});expect(JSON.parse(api.mock.calls[1][1].body)).toEqual({requestId:'request-1234'})
   expect(v.find('button','更新处理中…')!.props.disabled).toBe(true)
  }finally{v.app.unmount()}
 })
 it('开发环境禁用执行；断线后自动重连，成功切换才刷新页面',async()=>{
  api.mockResolvedValueOnce(update.unsupportedUpdate());const v=renderClient(Component,{});Object.assign(window,{location:{reload}})
  try{await flush();expect(v.find('button','更新游戏')!.props.disabled).toBe(true)
   api.mockResolvedValue(base);await vi.advanceTimersByTimeAsync(2000);await flush()
   api.mockRejectedValueOnce(Error('连接中断'));await vi.advanceTimersByTimeAsync(2000);await flush();expect(content(v.root)).toContain('重新连接更新服务')
   api.mockResolvedValue({...base,currentRevision:'b'.repeat(40),phase:'succeeded'});await vi.advanceTimersByTimeAsync(2000);await flush();expect(reload).toHaveBeenCalledOnce()
  }finally{v.app.unmount()}
 })
 it('请求报错提示最多一秒；卸载停止轮询',async()=>{
  const v=renderClient(Component,{});await flush();api.mockRejectedValueOnce(Error('测试错误'));v.find('button','更新游戏')!.props.onClick();await flush();expect(content(v.root)).toContain('测试错误')
  await vi.advanceTimersByTimeAsync(1000);await flush();expect(content(v.root)).not.toContain('测试错误');v.app.unmount();api.mockClear();await vi.advanceTimersByTimeAsync(10000);expect(api).not.toHaveBeenCalled()
 })
})
