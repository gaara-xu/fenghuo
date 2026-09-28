import {shallowRef} from 'vue'
export interface DialogOptions {title:string;message:string;submitText?:string;initial?:string;placeholder?:string;maxLength?:number;validate?:(value:string)=>string}
interface PendingDialog extends DialogOptions {id:number;resolve:(value:string|null)=>void}
export const activeDialog=shallowRef<PendingDialog|null>(null)
const queue:PendingDialog[]=[]
let nextId=0
function request(options:DialogOptions):Promise<string|null>{return new Promise(resolve=>{queue.push({...options,id:++nextId,resolve});if(!activeDialog.value)activeDialog.value=queue.shift()??null})}
export const noticeRequest=shallowRef<{id:number;text:string}|null>(null)
export function gameNotice(text:string){noticeRequest.value={id:++nextId,text}}
export function gamePrompt(options:DialogOptions){return request(options)}
export function finishDialog(id:number,value:string|null){const current=activeDialog.value;if(!current||current.id!==id)return;if(value!==null&&current.validate?.(value.trim()))return;activeDialog.value=queue.shift()??null;current.resolve(value===null?null:value.trim())}
