export async function api<T>(url:string,options?:RequestInit):Promise<T>{
  const response=await fetch(url,{...options,headers:{...(options?.body?{'Content-Type':'application/json'}:{}),...(options?.headers??{})}})
  const payload=await response.json().catch(()=>({error:`请求失败（${response.status}）`}))
  if(!response.ok) throw new Error(payload.error??`请求失败（${response.status}）`)
  return payload as T
}

// 支持通过内网普通地址访问，避免依赖仅安全上下文提供的 randomUUID。
export function actionId():string{
  const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128
  const h=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`
}
