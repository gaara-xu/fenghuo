import {afterEach,describe,it,expect,vi} from 'vitest'
import {h,nextTick} from 'vue'
import {readFileSync,readdirSync} from 'node:fs'
import {clientComponent} from './vue-client'
import {content,nodes,renderClient} from './ui-renderer'
import * as dialogs from '../web/game-dialog'
import {useTimedNotice} from '../web/timed-notice'
import {installGameValidation} from '../web/game-validation'
const Modal={props:['title'],setup(p:any,{slots}:any){return()=>h('section',{role:'dialog'},[h('h2',p.title),slots.default?.(),slots.footer?.()])}}
const Dialogs=clientComponent('web/GameDialogs.vue',{'./game-dialog':dialogs,'./timed-notice':{useTimedNotice},'./GameModal.vue':Modal})
const flush=async()=>{await nextTick();await Promise.resolve();await nextTick()}
afterEach(()=>{while(dialogs.activeDialog.value)dialogs.finishDialog(dialogs.activeDialog.value.id,null);vi.unstubAllGlobals();vi.useRealTimers()})
describe('全局直接操作与非阻塞提示',()=>{
 it('前后台没有二次确认调用或内嵌确认栏，系统确认也不可使用',()=>{
  expect('gameConfirm' in dialogs).toBe(false)
  for(const f of readdirSync('web').filter(f=>/\.(vue|ts)$/.test(f))){const source=readFileSync('web/'+f,'utf8');expect(source,f).not.toMatch(/gameConfirm|forge-confirm|\b(?:window\.)?(?:confirm|alert)\(/)}
 })
 it('缺材料等提示无需点击，最多一秒且重复文本不续时，过期后可再次提示',async()=>{
  vi.useFakeTimers();const v=renderClient(Dialogs,{})
  try{
   dialogs.gameNotice('缺少天赋水');await flush();expect(content(v.body)).toContain('缺少天赋水');expect(nodes(v.root).some(n=>n.props.role==='dialog')).toBe(false)
   await vi.advanceTimersByTimeAsync(800);dialogs.gameNotice('缺少天赋水');await flush();await vi.advanceTimersByTimeAsync(200);expect(content(v.body)).not.toContain('缺少天赋水')
   dialogs.gameNotice('缺少天赋水');await flush();expect(content(v.body)).toContain('缺少天赋水');await vi.advanceTimersByTimeAsync(1000);expect(content(v.body)).not.toContain('缺少天赋水')
  }finally{v.app.unmount()}
 })
 it('改名输入仍保留校验与提交，但不增加确认步骤',async()=>{
  const v=renderClient(Dialogs,{})
  try{
   const result=dialogs.gamePrompt({title:'英雄改名',message:'输入新名字',submitText:'改名',validate:n=>n.length<2?'名字太短':''});await flush()
   expect(v.find('button','改名')!.props.disabled).toBe(true);v.find('input')!.props['onUpdate:modelValue']('新的名字');await flush();v.find('button','改名')!.props.onClick();expect(await result).toBe('新的名字');await flush();expect(v.find('input')).toBeUndefined()
  }finally{v.app.unmount()}
 })
 it('浏览器表单错误转成一秒中文提示并聚焦，不打开确认窗',async()=>{
  vi.useFakeTimers();const v=renderClient(Dialogs,{})
  try{
   let handler!:(e:any)=>void;(document as any).addEventListener=(_name:string,fn:any)=>handler=fn
   class Field {validity={valueMissing:true};isConnected=true;focus=vi.fn();getAttribute(){return '合成数量'}}
   vi.stubGlobal('HTMLInputElement',Field);vi.stubGlobal('HTMLTextAreaElement',class{});installGameValidation()
   const field=new Field(),preventDefault=vi.fn();handler({target:field,preventDefault});await flush();expect(preventDefault).toHaveBeenCalledOnce();expect(field.focus).toHaveBeenCalledOnce();expect(content(v.body)).toContain('合成数量');expect(content(v.body)).toContain('此项不能为空');expect(dialogs.activeDialog.value).toBeNull()
   await vi.advanceTimersByTimeAsync(1000);expect(content(v.body)).not.toContain('此项不能为空')
  }finally{v.app.unmount()}
 })
})
