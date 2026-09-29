<script setup lang="ts">
import {computed,onMounted,onUnmounted,ref} from 'vue'
import {taskPath,type TaskCatalog,type TaskDescriptor,type TaskRunResult,type ScheduledTaskId} from '../shared/scheduled-tasks'
import {api,actionId} from './api'
import {useTimedNotice} from './timed-notice'
const catalog=ref<TaskCatalog>(),error=useTimedNotice(),notice=useTimedNotice(),origin=ref(window.location.origin),loading=ref(false)
const running=ref<ScheduledTaskId|null>(null),token=ref(''),retryIds=ref<Partial<Record<ScheduledTaskId,string>>>({})
const base=computed(()=>{try{const url=new URL(origin.value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/'?url.origin:null}catch{return null}})
function url(task:TaskDescriptor){return (base.value??window.location.origin)+task.path}
function command(task:TaskDescriptor){return `curl --fail-with-body --request GET '${url(task)}'`+(catalog.value?.authRequired?` \\\n  --header 'Authorization: Bearer <你的调度令牌>'`:'')}
async function copy(value:string){notice.value='';try{await navigator.clipboard.writeText(value);notice.value='已复制'}catch{notice.value='当前浏览器不支持自动复制，请选中地址或命令后手动复制。'}}
async function load(){if(loading.value||running.value)return;loading.value=true;try{catalog.value=await api<TaskCatalog>('/api/admin/tasks');error.value=''}catch(e){error.value=e instanceof Error?e.message:'任务列表加载失败'}finally{loading.value=false}}
async function run(task:TaskDescriptor){
  if(loading.value||running.value||!catalog.value||(catalog.value.authRequired&&!token.value.trim()))return
  running.value=task.id;error.value='';notice.value=''
  try{
    const requestId=retryIds.value[task.id]??actionId();retryIds.value[task.id]=requestId
    const result=await api<TaskRunResult>(taskPath(task.id)+'?requestId='+encodeURIComponent(requestId),{method:'GET',cache:'no-store',signal:AbortSignal.timeout(30000),headers:catalog.value.authRequired?{Authorization:'Bearer '+token.value.trim()}: {}})
    if(result?.ok!==true||result.taskId!==task.id||result.requestId!==requestId)throw Error('任务未确认成功，请重试本次请求')
    task.lastSuccess=result;delete retryIds.value[task.id];notice.value=task.name+'已执行'
  }catch(e){error.value=e instanceof Error?(e.name==='TimeoutError'?'请求超时，请重试本次请求':e instanceof TypeError?'连接中断，请重试本次请求':e.message):'任务请求失败，请重试本次请求'}
  finally{running.value=null}
}
let poll:ReturnType<typeof setInterval>
onMounted(()=>{void load();poll=setInterval(load,10000)})
onUnmounted(()=>clearInterval(poll))
</script>
<template>
  <div class="section-title"><div><small>供你的调度系统调用 · 不内置定时器</small><h1>定时任务地址</h1></div><button :disabled="loading||!!running" @click="load">更新执行状态</button></div>
  <p v-if="error" class="toast error">{{error}}</p><p v-if="notice" class="toast">{{notice}}</p>
  <div class="scheduler-guide">
    <label>调度系统可访问的游戏地址<input v-model="origin" placeholder="例如 http://192.168.3.23:5173" aria-label="调度访问根地址"></label>
    <p v-if="!base" class="error">请输入完整的 http 或 https 根地址，不含路径、参数或密码。</p>
    <p>调度时使用下方 <b>GET</b> 地址，无需请求体。此处只提供接口，你的调度系统决定实际执行时间，游戏时间加速不影响外部定时。</p>
    <p>本地开发默认地址中的 localhost 只适用于本机调度器。内网调度器应填写这台开发电脑的内网 IP；部署到服务器后再填写服务器的游戏访问地址。</p>
    <p v-if="catalog?.authRequired">已启用调度令牌，请发送 <code>Authorization: Bearer &lt;你的调度令牌&gt;</code>。令牌在服务器的 .env 中配置，本页不会读取已配置的值，也不要放进 URL。</p>
    <p v-else>当前未配置调度令牌，仅供受信内网使用。可在服务器 .env 中设置至少24位的 <code>SCHEDULER_TOKEN</code>，重启服务后启用 Bearer 校验；这不会为 /admin 增加登录。</p>
    <label v-if="catalog?.authRequired">手动执行使用的调度令牌<input v-model="token" :disabled="!!running" autocomplete="off" :spellcheck="false" aria-label="手动执行调度令牌" placeholder="填写已配置的 SCHEDULER_TOKEN，仅本页临时使用"></label>
    <p>“执行一次”直接调用当前游戏，无需确认；上方地址只影响复制内容。失败后点击“重试本次”会复用请求编号，防止重复执行。</p>
    <p>需要重试去重时在 URL 末尾添加 <code>?requestId=本轮唯一编号</code>（也支持 Idempotency-Key 请求头）：同一轮重试复用编号，下一个周期必须换新编号。每项保留最近 {{catalog?.retainedRunsPerTask??50}} 次成功记录，去重在这段记录范围内有效。</p>
  </div>
  <div class="scheduler-list">
    <article v-for="task in catalog?.tasks" :key="task.id" class="scheduler-card" :aria-busy="running===task.id">
      <header><h2>{{task.name}}</h2><span>{{task.suggestion}}</span></header><p>{{task.description}}</p>
      <div class="task-url"><b>{{task.method}}</b><input readonly :value="url(task)" :aria-label="task.name+'调用地址'"><button :disabled="!base" @click="copy(url(task))">复制地址</button></div>
      <pre>{{command(task)}}</pre><div class="task-actions"><button class="primary task-run" :disabled="loading||!!running||(catalog?.authRequired&&!token.trim())" :aria-label="task.name+(retryIds[task.id]?'重试本次':'执行一次')" @click="run(task)">{{running===task.id?'执行中…':retryIds[task.id]?'重试本次':'执行一次'}}</button><button :disabled="!base" @click="copy(command(task))">复制调用示例</button></div>
      <p class="task-last">最近成功：{{task.lastSuccess?new Date(task.lastSuccess.completedAt).toLocaleString():'尚未执行'}}<template v-if="task.lastSuccess"> · {{task.lastSuccess.summary}}</template></p>
    </article>
  </div>
  <p class="fineprint">返回 HTTP 200 且 ok=true 表示成功；replayed=true 表示复用了上次结果。直接打开 GET 地址就会执行，请勿作为普通链接随意访问；本页仅点击执行按钮才会触发任务，状态轮询不会执行。HEAD 与预取请求不执行任务。行军与自动刷野仍由游戏服务正常结算，无需添加调度任务。</p>
</template>
<style scoped>
.task-actions{display:flex;flex-wrap:wrap;align-items:center;gap:10px}.task-run{min-width:120px}
</style>
