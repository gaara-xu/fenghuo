import {createRenderer,h,markRaw,reactive} from 'vue'
import {vi} from 'vitest'
export type TestNode={type:string;text:string;props:Record<string,any>;style:Record<string,any>;scrollTop:number;children:TestNode[];parent:TestNode|null}
export const nodes=(n:TestNode):TestNode[]=>[n,...n.children.flatMap(nodes)]
export const content=(n:TestNode):string=>n.text+n.children.map(content).join('')
export function renderClient(component:any,initial:Record<string,any>){
  class TestDocument {activeElement=null}
  vi.stubGlobal('Document',TestDocument)
  vi.stubGlobal('ShadowRoot',class {})
  vi.stubGlobal('document',new TestDocument())
  const element=(type:string,text=''):TestNode=>markRaw({type,text,props:{},style:{},scrollTop:0,children:[],parent:null,addEventListener(){},removeEventListener(){},getRootNode(){return document},tagName:type.toUpperCase()} as TestNode)
  const root=element('root'),body=element('body'),listeners=new Map<string,Set<(e:any)=>void>>()
  vi.stubGlobal('window',{innerWidth:1200,innerHeight:800,addEventListener:(key:string,fn:any)=>{if(!listeners.has(key))listeners.set(key,new Set());listeners.get(key)!.add(fn)},removeEventListener:(key:string,fn:any)=>listeners.get(key)?.delete(fn)})
  const renderer=createRenderer<TestNode,TestNode>({
    createElement:type=>element(type),createText:t=>element('#text',t),createComment:t=>element('#comment',t),setText:(n,t)=>{n.text=t},setElementText:(n,t)=>{n.text=t;n.children=[]},
    parentNode:n=>n.parent,nextSibling:n=>n.parent?.children[n.parent.children.indexOf(n)+1]??null,
    insert:(n,p,a)=>{if(n.parent)n.parent.children.splice(n.parent.children.indexOf(n),1);n.parent=p;const i=a?p.children.indexOf(a):-1;p.children.splice(i<0?p.children.length:i,0,n)},remove:n=>{if(n.parent)n.parent.children.splice(n.parent.children.indexOf(n),1);n.parent=null},
    patchProp:(n,k,_old,v)=>{n.props[k]=v},querySelector:s=>s==='body'?body:null,
    // Static SVG symbol sheets have no handlers; keep them as one opaque host node.
    insertStaticContent:(html,parent,anchor)=>{const n=element('#static',html);n.parent=parent;const i=anchor?parent.children.indexOf(anchor):-1;parent.children.splice(i<0?parent.children.length:i,0,n);return [n,n]},
  })
  const props=reactive(initial),app=renderer.createApp({setup:()=>()=>h(component,props)});app.mount(root)
  const find=(type:string,name?:string)=>nodes(root).find(n=>n.type===type&&(name===undefined||content(n)===name))
  return {root,body,props,app,find,byClass:(s:string)=>nodes(root).find(n=>String(n.props.class??'').split(' ').includes(s)),all:()=>nodes(root),dispatch:(key:string,e:any)=>listeners.get(key)?.forEach(fn=>fn(e))}
}
