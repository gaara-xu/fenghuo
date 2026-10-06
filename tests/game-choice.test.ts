import {afterEach,describe,it,expect,vi} from 'vitest'
import {createRenderer,h,markRaw,nextTick,ref} from 'vue'
import {readdirSync,readFileSync} from 'node:fs'
import {clientComponent} from './vue-client'
import * as art from '../web/art'
const GameChoice=clientComponent('web/GameSelect.vue',{'./AssetIcon.vue':{setup:()=>()=>h('span')},'./art':art})
type Element={type:string;text:string;props:Record<string,any>;children:Element[];parent:Element|null;focus:()=>void;querySelector:(s:string)=>Element|undefined;querySelectorAll:(s:string)=>Element[];addEventListener:()=>void;removeEventListener:()=>void;getRootNode:()=>unknown;value:string}
function all(node:Element):Element[]{return [node,...node.children.flatMap(all)]}
function text(node:Element):string{return node.text+node.children.map(text).join('')}
function matches(node:Element,selector:string):boolean{return selector.split(',').some(s=>{s=s.trim();if(s==='[aria-pressed="true"]')return node.props['aria-pressed']===true;if(s.startsWith('.'))return String(node.props.class??'').split(' ').includes(s.slice(1));if(s.includes(':not'))return node.type===s.split(':')[0]&&!node.props.disabled;return node.type===s})}
function mount(options:Array<{id:any;label:string;detail?:string}>,initial:any=options[0]?.id){
  class TestDocument{activeElement:Element|null=null}
  const doc=new TestDocument();vi.stubGlobal('document',doc);vi.stubGlobal('Document',TestDocument);vi.stubGlobal('ShadowRoot',class {})
  function element(type:string,text=''):Element{
    const n:Element=markRaw({type,text,props:{},children:[],parent:null,focus:()=>{doc.activeElement=n},querySelector:s=>all(n).find(e=>matches(e,s)),querySelectorAll:s=>all(n).filter(e=>matches(e,s)),addEventListener:()=>{},removeEventListener:()=>{},getRootNode:()=>doc,value:''});return n
  }
  const root=element('root'),body=element('body'),renderer=createRenderer<Element,Element>({
    createElement:type=>element(type),createText:t=>element('#text',t),createComment:t=>element('#comment',t),setText:(n,t)=>{n.text=t},setElementText:(n,t)=>{n.text=t;n.children=[]},
    parentNode:n=>n.parent,nextSibling:n=>n.parent?.children[n.parent.children.indexOf(n)+1]??null,
    insert:(n,p,a)=>{if(n.parent)n.parent.children.splice(n.parent.children.indexOf(n),1);n.parent=p;const index=a?p.children.indexOf(a):-1;p.children.splice(index<0?p.children.length:index,0,n)},remove:n=>{if(n.parent)n.parent.children.splice(n.parent.children.indexOf(n),1);n.parent=null},
    patchProp:(n,key,_old,value)=>{n.props[key]=value;if(key==='value')n.value=value},querySelector:s=>s==='body'?body:null,
  })
  const value=ref(initial),disabled=ref(false),changed=vi.fn(),app=renderer.createApp({setup:()=>()=>h(GameChoice,{label:'测试选择',options,modelValue:value.value,disabled:disabled.value,'onUpdate:modelValue':(v:any)=>{value.value=v;changed(v)}})})
  app.mount(root)
  return {app,root,body,value,disabled,changed,doc,trigger:()=>root.querySelector('.choice-trigger')!,panel:()=>body.querySelector('.choice-panel'),tiles:()=>body.querySelectorAll('.choice-tile')}
}
afterEach(()=>vi.unstubAllGlobals())
describe('游戏风格选择面板',()=>{
  it('选择字符串、数字及空值原样回传，按钮不提交外层表单',async()=>{
    const view=mount([{id:'HERO',label:'英雄'},{id:6,label:'六星'},{id:null,label:'不选择'},{id:undefined,label:'非宝石'}])
    try{
      for(const [index,value] of [[1,6],[2,null],[3,undefined],[0,'HERO']] as const){
        await view.trigger().props.onClick();await nextTick();expect(view.panel()?.props.role).toBe('dialog');expect(view.tiles().every(t=>t.props.type==='button')).toBe(true)
        view.tiles()[index].props.onClick();await nextTick();expect(view.value.value).toBe(value);expect(view.panel()).toBeUndefined();expect(view.doc.activeElement).toBe(view.trigger())
      }
      expect(view.changed).toHaveBeenCalledTimes(4)
    }finally{view.app.unmount()}
  })
  it('长列表可搜索，取消不改变原值，重新打开清空搜索',async()=>{
    const options=Array.from({length:12},(_,n)=>({id:n,label:n===8?'天赋水':'物品'+n})),view=mount(options,3)
    try{
      await view.trigger().props.onClick();await nextTick();const input=view.body.querySelector('input')!;expect(view.doc.activeElement).toBe(input)
      input.props['onUpdate:modelValue']('天赋');await nextTick();expect(view.tiles()).toHaveLength(1);expect(text(view.tiles()[0])).toContain('天赋水')
      const shade=view.body.querySelector('.choice-shade')!,preventDefault=vi.fn()
      shade.props.onKeydown({key:'Escape',preventDefault,stopPropagation:vi.fn()});await nextTick();expect(view.value.value).toBe(3);expect(view.changed).not.toHaveBeenCalled();expect(view.panel()).toBeUndefined()
      await view.trigger().props.onClick();await nextTick();expect(view.tiles()).toHaveLength(12)
      view.body.querySelector('input')!.props['onUpdate:modelValue']('无匹配');await nextTick();expect(text(view.body)).toContain('没有匹配的选项')
      view.body.querySelector('.choice-close')!.props.onClick();await nextTick();expect(view.panel()).toBeUndefined()
    }finally{view.app.unmount()}
  })
  it('禁用时不能打开或选择，Tab焦点不会离开已打开的面板',async()=>{
    const view=mount([{id:1,label:'一'},{id:2,label:'二'}])
    try{
      view.disabled.value=true;await nextTick();expect(view.trigger().props.disabled).toBe(true);await view.trigger().props.onClick();expect(view.panel()).toBeUndefined()
      view.disabled.value=false;await nextTick();await view.trigger().props.onClick();await nextTick()
      const first=view.body.querySelector('.choice-close')!,last=view.tiles().at(-1)!,shade=view.body.querySelector('.choice-shade')!,preventDefault=vi.fn()
      shade.props.onKeydown({key:'Tab',target:last,preventDefault});expect(view.doc.activeElement).toBe(first)
      shade.props.onKeydown({key:'Tab',shiftKey:true,target:first,preventDefault});expect(view.doc.activeElement).toBe(last)
      view.disabled.value=true;await nextTick();expect(view.panel()).toBeUndefined();expect(view.changed).not.toHaveBeenCalled()
    }finally{view.app.unmount()}
  })
  it('空选项禁用，所有界面无原生下拉，数字框隐藏上下微调箭头',()=>{
    const view=mount([]);try{expect(view.trigger().props.disabled).toBe(true);expect(text(view.root)).toContain('暂无选项')}finally{view.app.unmount()}
    for(const file of readdirSync('web').filter(f=>f.endsWith('.vue')))expect(readFileSync('web/'+file,'utf8'),file).not.toMatch(/<select\b|<option\b/)
    const css=readFileSync('web/game-controls.css','utf8');expect(css).toContain('appearance:textfield');expect(css).toContain('::-webkit-inner-spin-button');expect(css).toContain('-webkit-appearance:none')
    expect(readFileSync('web/main.ts','utf8')).toContain("import './game-controls.css'")
  })
})
