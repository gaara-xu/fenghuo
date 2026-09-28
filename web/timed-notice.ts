import {customRef,onScopeDispose} from 'vue'

export const NOTICE_DURATION_MS=1000

// Each distinct notice expires independently of requests, polling and pointer position.
// Reassigning the visible text must not keep the same banner alive indefinitely.
export function useTimedNotice(){
  let value='',timer:ReturnType<typeof setTimeout>|undefined,disposed=false
  const cancel=()=>{if(timer!==undefined){clearTimeout(timer);timer=undefined}}
  onScopeDispose(()=>{disposed=true;cancel()})
  return customRef<string>((track,trigger)=>({
    get(){track();return value},
    set(next){
      if(disposed||next===value)return
      cancel();value=next;trigger()
      if(value)timer=setTimeout(()=>{timer=undefined;value='';trigger()},NOTICE_DURATION_MS)
    },
  }))
}
