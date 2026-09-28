<script setup lang="ts">
import {computed,ref,watch} from 'vue'
import type {InventoryEntry} from '../shared/items'
import {inventoryKey} from '../shared/items'
import {salvageBlockReason,salvageRules,type SalvageTarget} from '../shared/salvage'
import {inventoryChoice} from './item-choices'

import {api,actionId} from './api'
import {useTimedNotice} from './timed-notice'
import IconInventoryPicker from './IconInventoryPicker.vue'
const props=defineProps<{inventory:InventoryEntry[];busy:boolean}>(),emit=defineEmits<{changed:[message:string]}>()
const chosen=ref<Record<number,number>>({}),search=ref(''),quality=ref(0),pending=ref(false),error=useTimedNotice()
const blocked=computed(()=>props.busy||pending.value)
const entries=computed(()=>props.inventory.filter(e=>e.item.itemType==='EQUIPMENT'&&e.quantity>0))
const visible=computed(()=>entries.value.filter(e=>e.item.name.includes(search.value)&&(!quality.value||(e.item.qualityTier??e.item.rarity)===quality.value)))
const options=computed(()=>visible.value.map(e=>{const c=inventoryChoice(e),reason=salvageBlockReason(e);return {...c,disabled:Boolean(reason),lines:[...c.lines??[],reason||'点击选入分解炉，再次点击取消']}}))
const selected=computed(()=>entries.value.filter(e=>chosen.value[inventoryKey(e)]>0))
const count=computed(()=>Object.values(chosen.value).reduce((n,q)=>n+q,0))
const common=computed(()=>selected.value.reduce((n,e)=>n+(e.item.rarity+(e.gear?.refineLevel??0))*chosen.value[inventoryKey(e)],0))
const valid=computed(()=>count.value>0&&count.value<=salvageRules.maxPieces&&selected.value.length<=100&&selected.value.every(e=>!salvageBlockReason(e)&&Number.isInteger(chosen.value[inventoryKey(e)])&&chosen.value[inventoryKey(e)]<=e.quantity))
const targets=computed<SalvageTarget[]>(()=>selected.value.map(e=>e.gear?{kind:'INSTANCE',instanceId:e.gear.instanceId}:{kind:'STACK',itemId:e.item.id,quantity:chosen.value[inventoryKey(e)]}))
let request:{fingerprint:string;key:string}|undefined
watch(entries,()=>{const next:Record<number,number>={};for(const e of entries.value){const key=inventoryKey(e);if(chosen.value[key]&&!salvageBlockReason(e))next[key]=Math.min(e.quantity,chosen.value[key])}chosen.value=next})
function toggle(key:number|undefined){if(blocked.value||key===undefined)return;const e=entries.value.find(e=>inventoryKey(e)===key);if(!e||salvageBlockReason(e))return;if(chosen.value[key])delete chosen.value[key];else chosen.value[key]=1}
function quick(){if(blocked.value)return;const next:Record<number,number>={};let remaining=salvageRules.maxPieces;for(const e of visible.value){if(salvageBlockReason(e)||(e.gear?.refineLevel??0)>0||Object.keys(next).length>=100||!remaining)continue;const n=Math.min(e.quantity,remaining);next[inventoryKey(e)]=n;remaining-=n}chosen.value=next}
async function salvage(){
  if(blocked.value||!valid.value)return
  const fingerprint=JSON.stringify(targets.value),batch=structuredClone(targets.value)
  pending.value=true
  try{
    if(request?.fingerprint!==fingerprint)request={fingerprint,key:actionId()}
    error.value=''
    const result=await api<{message:string}>('/api/forge/salvage',{method:'POST',body:JSON.stringify({targets:batch,clientActionId:request.key})})
    chosen.value={};request=undefined;emit('changed',result.message)
  }catch(e){error.value=e instanceof Error?e.message:'分解失败，请重试'}finally{pending.value=false}
}
</script>
<template><section class="salvage-panel">
  <p>只分解包裹中的装备；已穿戴装备不在此列。镶有宝石的装备请先到工坊免费取石。</p>
  <div class="salvage-tools"><input v-model="search" :disabled="blocked" aria-label="搜索待分解装备" placeholder="搜索装备"><button :disabled="blocked" @click="quick">选中可见未精炼装备</button><button :disabled="blocked" @click="chosen={}">清空选择</button></div>
  <div class="salvage-filters"><button v-for="(name,key) in {0:'全部',1:'白色',2:'蓝色',3:'黄色',4:'绿色',5:'蓝紫',6:'橙黄',7:'红色'}" :key="key" :class="{active:quality===Number(key)}" :disabled="blocked" @click="quality=Number(key)">{{name}}</button></div>
  <div class="salvage-layout"><IconInventoryPicker :options="options" :selected-ids="selected.map(inventoryKey)" :disabled="blocked" compact :preview="false" label="选择分解装备" @update:model-value="toggle"/>
    <aside><h3>分解炉 · {{count}} 件</h3><p v-if="!selected.length" class="fineprint">点击左侧图标加入</p><div v-for="e in selected" :key="inventoryKey(e)" class="salvage-row"><span>{{e.item.name}} <b>+{{e.gear?.refineLevel??0}}</b></span><input v-if="!e.gear" v-model.number="chosen[inventoryKey(e)]" type="number" min="1" :max="Math.min(e.quantity,1000)" :aria-label="e.item.name+'分解数量'" :disabled="blocked"><small v-else>1 件</small><button :disabled="blocked" :aria-label="'取消分解'+e.item.name" @click="toggle(inventoryKey(e))">移除</button></div>
    <p class="salvage-yield">必得精炼石 <b>{{common}}</b> 枚<br>每件另有 <b>10%</b> 概率获得高级精炼石</p><button class="primary" :disabled="blocked||!valid" @click="salvage">{{pending?'正在分解…':'分解选中装备'}}</button><small class="fineprint">点击后直接分解，装备及培养进度不可恢复。每批最多100种、1000件；高精炼装备需手动选择。</small></aside></div>
  <p v-if="error" class="toast error">{{error}}</p>
</section></template>
<style scoped>.salvage-panel>p{font-size:12px;color:#b8aa81;line-height:1.8}.salvage-tools,.salvage-filters{display:flex;gap:8px;align-items:center;margin:10px 0}.salvage-tools input{max-width:280px;margin:0}.salvage-filters button{padding:5px 10px}.salvage-filters .active{border-color:#d0b564;color:#f2d586}.salvage-layout{display:grid;grid-template-columns:1.1fr 1fr;gap:20px;align-items:start}.salvage-layout aside{padding:14px;background:#121a11;border:1px solid #615235}.salvage-layout h3{margin-top:0;color:#e0bd72}.salvage-row{display:flex;align-items:center;gap:8px;border-bottom:1px solid #3a422b;padding:8px 0;font-size:12px}.salvage-row>span{flex:1}.salvage-row input{width:70px;margin:0}.salvage-row button{padding:4px 8px}.salvage-row b{color:#dfbc6c}.salvage-yield{font-size:12px;color:#b9c59a;line-height:2}.salvage-yield b{color:#f3ce77}.salvage-layout .fineprint{display:block;text-align:left;margin-top:10px}.salvage-layout :deep(.picker-grid){max-height:450px}@media(max-width:780px){.salvage-layout{grid-template-columns:1fr}}</style>
