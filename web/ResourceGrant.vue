<script setup lang="ts">
import {computed,onMounted,ref} from 'vue'
import type {Wallet} from '../shared/contracts'
import {emptyResources,resourceKeys,MAX_RESOURCE_GRANT,type ResourceAdminState} from '../shared/resources'
import {currencyLabels} from '../shared/labels'
import {api,actionId} from './api'
import {useTimedNotice} from './timed-notice'
defineProps<{wallet:Wallet}>()
const emit=defineEmits<{changed:[]}>(),amounts=ref(emptyResources()),recent=ref<ResourceAdminState['recent']>([]),busy=ref(false),error=useTimedNotice(),message=useTimedNotice()
let pending:{key:string;fingerprint:string}|null=null
const valid=computed(()=>resourceKeys.every(k=>Number.isSafeInteger(amounts.value[k])&&amounts.value[k]>=0&&amounts.value[k]<=MAX_RESOURCE_GRANT)&&resourceKeys.some(k=>amounts.value[k]>0))
const summary=(a:Wallet)=>resourceKeys.filter(k=>a[k]>0).map(k=>currencyLabels[k]+' +'+a[k].toLocaleString()).join(' · ')
async function load(){recent.value=(await api<ResourceAdminState>('/api/admin/resources')).recent}
function basic(n:number){for(const k of ['food','wood','stone','iron'] as const)amounts.value[k]=n}
async function grant(){if(!valid.value||busy.value)return;busy.value=true;error.value='';message.value='';const data={...amounts.value},fingerprint=JSON.stringify(data);if(pending?.fingerprint!==fingerprint)pending={key:actionId(),fingerprint};try{await api('/api/admin/resources/grant',{method:'POST',body:JSON.stringify({amounts:data,clientActionId:pending.key})});pending=null;amounts.value=emptyResources();message.value='已添加：'+summary(data);emit('changed');await load()}catch(e){error.value=e instanceof Error?e.message:String(e)}finally{busy.value=false}}
onMounted(()=>void load().catch(e=>{error.value=e instanceof Error?e.message:String(e)}))
</script>
<template><form class="resource-grant controls" @submit.prevent="grant"><div class="report-toolbar"><h3>添加资源</h3><small>直接加入当前存档，不覆盖原有余额</small></div><div class="resource-grant-grid"><label v-for="k in resourceKeys" :key="k"><b>{{currencyLabels[k]}}</b><small>当前 {{wallet[k].toLocaleString()}}</small><input v-model.number="amounts[k]" type="number" min="0" :max="MAX_RESOURCE_GRANT" step="1" :disabled="busy" :aria-label="'添加'+currencyLabels[k]" required><button type="button" :disabled="busy" @click="amounts[k]=Math.min(MAX_RESOURCE_GRANT,(Number(amounts[k])||0)+100000)">＋10万</button></label></div><div class="button-row"><button type="button" :disabled="busy" @click="basic(1000000)">四项基础资源各填100万</button><button type="button" :disabled="busy" @click="amounts=emptyResources()">清空输入</button><button class="primary" :disabled="busy||!valid">{{busy?'正在添加…':'添加资源'}}</button></div><p v-if="error" class="error">{{error}}</p><p v-if="message" class="grant-success">{{message}}</p><p class="fineprint">每项单次最多十亿；只增加资源，不扣减。提交失败后可原样重试，不会重复到账。</p><details class="grant-history"><summary>最近添加记录（显示20条）</summary><p v-if="!recent.length">暂无记录</p><p v-for="r in recent" :key="r.clientActionId"><small>{{new Date(r.appliedAt).toLocaleString()}}</small> {{summary(r.amounts)}}</p></details></form></template>
<style scoped>
.resource-grant{margin-bottom:24px}.resource-grant .report-toolbar h3{margin-top:0}.resource-grant .report-toolbar small{color:#a19679;font-size:12px}.resource-grant-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:14px;margin:15px 0 20px}.resource-grant-grid label{padding:12px;background:#101a14;border:1px solid #4b5137;border-radius:4px}.resource-grant-grid b{color:#e0c47f;font-size:15px}.resource-grant-grid small{display:block;font:11px system-ui;margin:8px 0;color:#b1b694}.resource-grant-grid input{margin-bottom:8px}.resource-grant-grid button{width:100%;padding:5px;font-size:12px}.resource-grant .primary{margin:0}.resource-grant .fineprint{text-align:left}.grant-success{color:#b1d591;font-size:14px}.grant-history{border-top:1px solid #484c35;padding-top:12px;font-size:12px}.grant-history summary{cursor:pointer;color:#c6bd8e}.grant-history p{padding:8px 0;border-bottom:1px solid #3c422e}.grant-history small{color:#969981;margin-right:12px}
@media(max-width:1150px){.resource-grant-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
</style>
