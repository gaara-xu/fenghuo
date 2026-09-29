<script setup lang="ts">
import {computed,onMounted,onUnmounted,ref} from 'vue'
import {api,actionId} from './api'
import {useTimedNotice} from './timed-notice'
import {updatePhases,type GameUpdateStatus} from '../shared/game-update'
const state=ref<GameUpdateStatus>(),sending=ref(false),loading=ref(false),disconnected=ref(false),notice=useTimedNotice()
const busy=computed(()=>sending.value||Boolean(state.value?.busy)),steps=['checking','fetching','dependencies','building','switching','verifying'] as const
const currentStep=computed(()=>steps.findIndex(s=>s===state.value?.phase))
const short=(value?:string)=>value&&/^[a-f0-9]{40}$/.test(value)?value.slice(0,8):value||'尚未检查'
let timer:ReturnType<typeof setInterval>|undefined,alive=true,lastRevision:string|undefined
const requests=new Set<AbortController>()
async function updateApi(url:string,options:RequestInit={}){
  const controller=new AbortController();requests.add(controller)
  const timeout=setTimeout(()=>controller.abort(),10000)
  try{return await api<GameUpdateStatus>(url,{...options,signal:controller.signal})}
  finally{clearTimeout(timeout);requests.delete(controller)}
}
function accept(next:GameUpdateStatus){
  if(!alive)return
  // A late poll must not replace a newer terminal state with an old busy snapshot.
  if(state.value?.supported&&next.supported&&Date.parse(next.updatedAt)<Date.parse(state.value.updatedAt))return
  state.value=next;disconnected.value=false
  if(lastRevision&&lastRevision!==next.currentRevision&&next.phase==='succeeded')window.location.reload()
  lastRevision=next.currentRevision
}
async function load(){
  if(!alive||loading.value)return;loading.value=true
  try{
    accept(await updateApi('/api/admin/game-update/status'))
  }catch{if(alive)disconnected.value=true}finally{loading.value=false}
}
async function act(action:'check'|'run'){
  if(!alive||busy.value||!state.value?.supported)return
  sending.value=true
  try{accept(await updateApi('/api/admin/game-update/'+action,{method:'POST',headers:{'X-Fenghuo-Update':'1'},body:JSON.stringify({requestId:actionId()})}))}
  catch(e){if(alive){notice.value=e instanceof Error&&e.name!=='AbortError'?e.message:'连接超时，正在重新读取更新状态';await load()}}
  finally{sending.value=false}
}
onMounted(()=>{void load();timer=setInterval(()=>void load(),2000)})
onUnmounted(()=>{alive=false;clearInterval(timer);for(const request of requests)request.abort();requests.clear()})
</script>
<template>
  <section class="game-updater" aria-label="游戏更新">
    <div class="section-title"><div><small>版本维护 · 自动构建 · 安全切换</small><h1>更新游戏</h1></div><span class="update-emblem">烽</span></div>
    <p class="update-intro">点击更新游戏，自动检查并拉取新版、准备依赖、编译测试和重启。关闭此页后更新仍继续，重新进入可查看进度。构建期间继续游玩，切换时短暂维护。</p>
    <div v-if="state" class="update-versions"><div><small>当前版本</small><strong>{{short(state.currentRevision)}}</strong></div><div><small>最新版本</small><strong>{{short(state.latestRevision)}}</strong></div><div><small>版本状态</small><strong>{{state.busy?updatePhases[state.phase]:state.available?'发现新版':state.checkedAt?'已检查':'等待检查'}}</strong></div></div>
    <div class="update-actions"><button class="primary" :disabled="busy||!state?.supported||disconnected" @click="act('run')">{{busy?'更新处理中…':'更新游戏'}}</button><button :disabled="busy||!state?.supported||disconnected" @click="act('check')">检查更新</button><button v-if="disconnected" :disabled="loading" @click="load">重新连接</button></div>
    <p v-if="disconnected" class="update-connection">正在重新连接更新服务…</p>
    <div v-if="state" class="update-progress" :aria-busy="state.busy"><h3>{{updatePhases[state.phase]}}</h3><p>{{state.message}}</p>
      <ol v-if="state.supported"><li v-for="(step,index) in steps" :key="step" :class="{active:state.phase===step,done:state.phase==='succeeded'||currentStep>index}"><span>{{index+1}}</span>{{updatePhases[step]}}</li></ol>
      <p v-if="state.checkedAt" class="fineprint">最近检查 {{new Date(state.checkedAt).toLocaleString()}}</p>
    </div>
    <details v-if="state?.events.length" class="update-history"><summary>本次更新记录</summary><p v-for="(event,index) in state.events" :key="index"><time>{{new Date(event.at).toLocaleTimeString()}}</time>{{event.message}}</p></details>
    <p class="fineprint">挂载目录 /gaara/fenghuo · 只更新游戏代码，不备份、不升级或重置数据库。不会自动定时更新。</p>
    <p v-if="notice" class="toast error" role="status">{{notice}}</p>
  </section>
</template>
<style scoped>
.game-updater{max-width:1050px;margin:22px auto;padding:26px;border:1px solid #8b7746;background:linear-gradient(125deg,#292c1d,#141a13);box-shadow:inset 0 0 0 4px #12170f,0 12px 32px #0005}.update-emblem{display:grid;place-items:center;width:58px;height:58px;border:2px solid #a5833e;color:#e4c277;background:#352c19;font-size:30px}.update-intro{color:#bcb08c;font-size:13px;line-height:1.9}.update-versions{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:22px 0}.update-versions>div{padding:15px;background:#11180f;border:1px solid #4b5131}.update-versions small{display:block;color:#aaa280;margin-bottom:8px}.update-versions strong{color:#e6c985;font-size:17px}.update-actions{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:22px}.update-actions .primary{min-width:150px}.update-progress{border-top:1px solid #655a34;padding-top:10px}.update-progress p{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;line-height:1.8;color:#d3c39b}.update-progress ol{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:9px}.update-progress li{display:flex;align-items:center;gap:8px;padding:9px 12px;border:1px solid #424b33;color:#858e71;font-size:12px}.update-progress li>span{border:1px solid currentColor;border-radius:50%;padding:1px 5px}.update-progress li.active{border-color:#d2a955;color:#f3d080;background:#3b321d}.update-progress li.done{border-color:#708a46;color:#b6cd8c}.update-history{border-top:1px solid #4f4e31;padding-top:14px;color:#baa779}.update-history summary{cursor:pointer}.update-history p{font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.8}.update-history time{margin-right:14px;color:#8d9c7a}.update-connection{color:#e0b477;font-size:12px}@media(max-width:600px){.game-updater{padding:16px}.update-versions{grid-template-columns:1fr}.update-emblem{display:none}}
</style>
