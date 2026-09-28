<script setup lang="ts">
import {computed,ref,watch} from 'vue'
import type {InventoryEntry,ItemDefinition} from '../shared/items'
import {gemFamilies} from '../shared/gems'
import {inventoryChoice} from './item-choices'
import IconInventoryPicker from './IconInventoryPicker.vue'

import {actionId} from './api'
const props=defineProps<{inventory:InventoryEntry[];catalog:ItemDefinition[];busy:boolean;embedded?:boolean}>(),emit=defineEmits<{back:[];combine:[body:{itemId:number;quantity:number;clientActionId:string}]}>()
const family=ref('xiuluo'),selected=ref<number>(),quantity=ref(1),pending=ref(false)
const count=(id:number)=>props.inventory.filter(e=>e.item.id===id).reduce((n,e)=>n+e.quantity,0)
const entries=computed(()=>props.catalog.filter(i=>i.enabled&&i.effectConfig.gemFamily===family.value).sort((a,b)=>(a.effectConfig.gemLevel??0)-(b.effectConfig.gemLevel??0)))
const choices=computed(()=>entries.value.map(item=>({...inventoryChoice({item,quantity:count(item.id)}),badge:item.effectConfig.gemLevel+'级',lines:[...inventoryChoice({item,quantity:count(item.id)}).lines??[],'包裹持有 '+count(item.id)+' 颗']})))
const source=computed(()=>entries.value.find(i=>i.id===selected.value)),target=computed(()=>entries.value.find(i=>i.effectConfig.gemLevel===(source.value?.effectConfig.gemLevel??0)+1))
const maximum=computed(()=>Math.min(9999,Math.floor(count(selected.value??0)/4)))
const reason=computed(()=>props.busy||pending.value?'正在处理…':!source.value?'请选择宝石':source.value.effectConfig.gemLevel===8?'已达八级':!target.value?'高一级宝石未上架':maximum.value<1?'需要四颗同类同级宝石':!Number.isInteger(quantity.value)||quantity.value<1||quantity.value>maximum.value?'合成数量不足或无效':'')
watch(entries,()=>{if(!entries.value.some(i=>i.id===selected.value))selected.value=entries.value.find(i=>count(i.id)>=4)?.id??entries.value[0]?.id},{immediate:true})
watch(selected,()=>{quantity.value=1})
watch(()=>props.busy,value=>{if(!value)pending.value=false})
function combine(){if(reason.value||!source.value||!target.value)return;pending.value=true;emit('combine',{itemId:source.value.id,quantity:quantity.value,clientActionId:actionId()})}
</script>
<template><section class="gem-workshop"><header v-if="!embedded"><div><small>淬石成璧 · 百炼神兵</small><h1>宝石工坊</h1></div><button type="button" @click="emit('back')">返回包裹</button></header><div class="gem-family-tabs" aria-label="宝石种类"><button v-for="(name,key) in gemFamilies" :key="key" :class="{active:family===key}" :aria-pressed="family===key" :disabled="busy||pending" @click="family=key">{{name}}宝石</button></div>
  <p class="fineprint">四颗同类同级宝石合成高一级，最高八级。悬停查看属性；切换“装备工坊”即可镶嵌或免费取出宝石。</p>
  <IconInventoryPicker v-model="selected" :options="choices" label="宝石等级" compact :preview="false" :disabled="busy||pending" empty-text="此系宝石暂未上架。"/>
  <div v-if="source" class="gem-combine-stage"><div><IconInventoryPicker :options="[inventoryChoice({item:source,quantity:quantity*4})]" label="合成材料" compact :preview="false" :heading="false"/><b>{{source.name}}</b><small>持有 {{count(source.id)}} 颗</small></div><span class="gem-arrow">四合一<span>→</span></span><div v-if="target"><IconInventoryPicker :options="[inventoryChoice({item:target,quantity})]" label="合成结果" compact :preview="false" :heading="false"/><b>{{target.name}}</b><small>合成后收入包裹</small></div><div v-else class="gem-top">{{source.effectConfig.gemLevel===8?'八级臻品':'尚未上架'}}</div></div>
  <div class="gem-combine-action"><label>合成数量<input v-model.number="quantity" type="number" min="1" :max="maximum||1" :disabled="busy||pending||!maximum" aria-label="宝石合成数量"></label><button :disabled="busy||pending||!maximum" @click="quantity=maximum">最大 {{maximum}}</button><button class="primary" :disabled="Boolean(reason)" @click="combine">{{reason||'合成宝石'}}</button></div>
</section></template>
<style scoped>
.gem-workshop{max-width:760px;margin:auto;padding:22px;border:1px solid #776342;background:linear-gradient(120deg,#2b3020,#111910);box-shadow:inset 0 0 0 4px #111b}.gem-workshop>header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #5d603d;padding-bottom:16px}.gem-workshop h1{font-size:24px;margin:6px 0;color:#e3c375}.gem-workshop header small{color:#9b9c79}.gem-family-tabs{display:flex;gap:7px;margin-top:18px;flex-wrap:wrap}.shell .gem-family-tabs button{font-size:12px;padding:7px 15px;min-height:32px}.shell .gem-family-tabs button.active{border-color:#d8b95f;background:#51502b;color:#ffe296}.gem-workshop .fineprint{text-align:left;font-size:12px;margin:15px 0}.gem-combine-stage{display:flex;justify-content:center;align-items:center;gap:24px;margin:20px 0;border:1px solid #5d5d37;background:radial-gradient(#48452a,#151f14);padding:25px 15px}.gem-combine-stage>div{min-width:115px;text-align:center}.gem-combine-stage :deep(.picker-grid){border:0;background:none;box-shadow:none;justify-content:center;overflow:visible}.gem-combine-stage b{font-size:13px;color:#e6d090}.gem-combine-stage small{display:block;font-size:11px;color:#a4ad85;margin-top:6px}.gem-arrow{font-size:11px;color:#a99351}.gem-arrow span{display:block;text-align:center;font-size:32px}.gem-top{color:#c6aa64;font-size:18px;letter-spacing:2px}.gem-combine-action{display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-wrap:wrap}.gem-combine-action label{display:flex;align-items:center;gap:10px;margin:0;width:auto;font-size:12px}.gem-combine-action input{width:70px;margin:0;padding:7px;text-align:center}.gem-combine-action button{font-size:12px;min-height:34px}
</style>
