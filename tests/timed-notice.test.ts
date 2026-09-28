import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {effectScope,nextTick} from 'vue'
import {readFileSync,readdirSync} from 'node:fs'
import {NOTICE_DURATION_MS,useTimedNotice} from '../web/timed-notice'
import {defaultForgeRules} from '../shared/forge'
import {clientComponent} from './vue-client'
import {content,renderClient} from './ui-renderer'

const scopes:ReturnType<typeof effectScope>[]=[]
const notice=()=>{const scope=effectScope();scopes.push(scope);return {scope,message:scope.run(useTimedNotice)!}}
const flush=async()=>{await Promise.resolve();await nextTick();await Promise.resolve();await nextTick()}
beforeEach(()=>vi.useFakeTimers())
afterEach(()=>{scopes.splice(0).forEach(scope=>scope.stop());vi.useRealTimers();vi.unstubAllGlobals()})

describe('全部临时提示最多一秒',()=>{
  it('999毫秒仍显示，1000毫秒清空；没有淡出或悬停续时',()=>{
    const {message}=notice();expect(NOTICE_DURATION_MS).toBe(1000);expect(vi.getTimerCount()).toBe(0)
    message.value='装备成功';vi.advanceTimersByTime(999);expect(message.value).toBe('装备成功')
    vi.advanceTimersByTime(1);expect(message.value).toBe('');expect(vi.getTimerCount()).toBe(0)
  })
  it('同一提示重复赋值不延期，消失后重新操作仍可提示',()=>{
    const {message}=notice();message.value='保存成功';vi.advanceTimersByTime(600);message.value='保存成功'
    vi.advanceTimersByTime(400);expect(message.value).toBe('')
    message.value='保存成功';expect(message.value).toBe('保存成功');vi.advanceTimersByTime(1000);expect(message.value).toBe('')
  })
  it('新提示替换旧提示，旧计时器不提前清除新提示且不会排队重现',()=>{
    const {message}=notice();message.value='旧提示';vi.advanceTimersByTime(800);message.value='新提示'
    expect(vi.getTimerCount()).toBe(1);vi.advanceTimersByTime(200);expect(message.value).toBe('新提示')
    vi.advanceTimersByTime(800);expect(message.value).toBe('');vi.advanceTimersByTime(10000);expect(message.value).toBe('')
  })
  it('成功和错误各自到期；主动清空及卸载取消计时，迟到响应不重新创建',()=>{
    const a=notice(),b=notice();a.message.value='成功';vi.advanceTimersByTime(500);b.message.value='失败'
    vi.advanceTimersByTime(500);expect(a.message.value).toBe('');expect(b.message.value).toBe('失败')
    b.message.value='';expect(vi.getTimerCount()).toBe(0)
    a.message.value='正在显示';a.scope.stop();expect(vi.getTimerCount()).toBe(0)
    a.message.value='已离开页面的迟到响应';expect(vi.getTimerCount()).toBe(0)
  })
  it('全站所有toast横幅的数据源都走统一一秒计时',()=>{
    let banners=0
    for(const file of readdirSync('web').filter(file=>file.endsWith('.vue'))){
      const source=readFileSync('web/'+file,'utf8')
      for(const match of source.matchAll(/<(?:div|p)\b([^>]*\bclass="toast(?: error)?"[^>]*)>/g)){
        const name=match[1].match(/v-if="(\w+)"/)?.[1];expect(name,file).toBeTruthy()
        expect(source,file).toMatch(new RegExp('\\b'+name+'=useTimedNotice\\(\\)'));banners++
      }
    }
    expect(banners).toBeGreaterThanOrEqual(11)
  })
  it('实际工坊保存提示在一秒时从界面移除，相同操作可再次显示',async()=>{
    const api=vi.fn().mockResolvedValueOnce(structuredClone(defaultForgeRules)).mockResolvedValue({})
    const Forge=clientComponent('web/ForgeSettings.vue',{'./api':{api},'./timed-notice':{useTimedNotice},'../shared/forge':{defaultForgeRules}})
    const view=renderClient(Forge,{})
    try{
      await flush()
      for(let i=0;i<2;i++){
        view.find('form')!.props.onSubmit({preventDefault(){}});await flush();expect(content(view.root)).toContain('工坊规则已保存')
        await vi.advanceTimersByTimeAsync(999);expect(content(view.root)).toContain('工坊规则已保存')
        await vi.advanceTimersByTimeAsync(1);expect(content(view.root)).not.toContain('工坊规则已保存')
      }
    }finally{view.app.unmount()}
  })
  it('读取错误提示一秒后消失，但重试入口保留，恢复不会误启用开关',async()=>{
    const api=vi.fn().mockRejectedValueOnce(Error('连接失败'))
    const Control=clientComponent('web/TavernRecording.vue',{'./api':{api},'./timed-notice':{useTimedNotice},'./game-dialog':{gameConfirm:vi.fn()}})
    const view=renderClient(Control,{})
    try{
      await flush();expect(content(view.root)).toContain('连接失败')
      await vi.advanceTimersByTimeAsync(1000);expect(content(view.root)).not.toContain('连接失败')
      expect(view.find('button','开启记录')!.props.disabled).toBe(true)
      api.mockResolvedValueOnce({enabled:false});view.find('button','重新读取')!.props.onClick();await flush()
      expect(view.find('button','开启记录')!.props.disabled).toBe(false);expect(view.find('button','重新读取')).toBeUndefined()
    }finally{view.app.unmount()}
  })
})
