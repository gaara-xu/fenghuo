<script setup lang="ts">
import {computed,onMounted,ref,watch} from 'vue'
import type {EquippedItem,InventoryEntry} from '../shared/items'
import {defaultForgeRules,type ForgeRules,type ForgeOperation} from '../shared/forge'
import {gemFitsEquipment,gemSummary} from '../shared/gems'
import {statLabels} from '../shared/hero-growth'
import {actionId,api} from './api'
import IconInventoryPicker from './IconInventoryPicker.vue'
import {inventoryChoice} from './item-choices'
const props=defineProps<{equipment:EquippedItem;inventory:InventoryEntry[];locked:boolean;operations?:ForgeOperation[]}>(),emit=defineEmits<{forge:[body:object]}>()
const operationNames={REFINE:'精炼',DRILL:'打孔',SOCKET:'镶嵌',UNSOCKET:'取出'} as const
const rules=ref<ForgeRules>(defaultForgeRules),loadError=ref(''),loaded=ref(false),operation=ref<ForgeOperation>(props.operations?.[0]??'REFINE'),materialId=ref<number>(),gemSlot=ref<number>(),pending=ref(false)
async function loadRules(){loaded.value=false;loadError.value='';try{rules.value=await api('/api/forge/rules');loaded.value=true}catch{loadError.value='工坊暂未就绪'}}
onMounted(loadRules)
const gear=computed(()=>props.equipment.gear),isEquipment=computed(()=>props.equipment.item.itemType==='EQUIPMENT')
const actionName=computed(()=>operationNames[operation.value])
const modes=computed(()=>(props.operations??['REFINE','DRILL','SOCKET','UNSOCKET'] as ForgeOperation[]).map(key=>({key,name:operationNames[key]})))
const socketChoices=computed(()=>(gear.value?.gems??[]).map((gem,index)=>({id:index+1,name:gem.name,detail:gemSummary(gem),imageUrl:gem.icon,quality:[1,2,4,5,6,7,7,7][Math.min(7,Math.max(0,(gem.level??1)-1))],glyph:'material' as const,badge:(index+1)+'孔',lines:['取出后原样退回包裹，不消耗道具或金币。']})))
const selectedGem=computed(()=>gemSlot.value?gear.value?.gems[gemSlot.value-1]:undefined)
watch(socketChoices,()=>{if(!socketChoices.value.some(g=>g.id===gemSlot.value))gemSlot.value=socketChoices.value[0]?.id},{immediate:true})
const materialEntries=computed(()=>props.inventory.filter(e=>{
  if(e.quantity<=0||!e.item.enabled||e.item.deletedAt)return false
  if(operation.value==='REFINE')return ['refine_common','refine_advanced','refine_stone'].includes(e.item.code)
  if(operation.value==='DRILL')return e.item.code==='drill_stone'
  const c=e.item.effectConfig,slot=props.equipment.item.effectConfig.slot
  return gemFitsEquipment(e.item,props.equipment.item)
}).sort((a,b)=>Number(b.item.code==='refine_common')-Number(a.item.code==='refine_common')))
const materials=computed(()=>materialEntries.value.map(e=>inventoryChoice(e)))
const material=computed(()=>materialEntries.value.find(e=>e.item.id===materialId.value))
const cost=computed(()=>operation.value==='UNSOCKET'?0:operation.value==='DRILL'?rules.value.drillCost:1)
watch(()=>[operation.value,...materialEntries.value.map(e=>e.item.id)],()=>{if(!materialEntries.value.some(e=>e.item.id===materialId.value))materialId.value=materialEntries.value[0]?.item.id},{immediate:true})
const chance=computed(()=>operation.value==='REFINE'?Math.min(1,(rules.value.refineRates[gear.value?.refineLevel??0]??0)+(material.value?.item.code==='refine_stone'?rules.value.divineBonus:material.value?.item.code==='refine_advanced'?.1:0)):operation.value==='DRILL'?rules.value.drillRates[gear.value?.sockets??0]??0:1)
const reason=computed(()=>{
  if(props.locked||pending.value)return '暂不可操作'
  if(!gear.value)return '请先穿戴物品'
  if(operation.value==='UNSOCKET')return !isEquipment.value?'宝物不能取出宝石':!selectedGem.value?'没有已镶嵌的宝石':''
  if(props.equipment.item.deletedAt)return '请先在后台恢复物品'
  if(loadError.value)return loadError.value
  if(!loaded.value)return '正在读取工坊规则…'
  if(operation.value==='REFINE'&&gear.value.refineLevel>=9)return '精炼已满级'
  if(operation.value!=='REFINE'&&!isEquipment.value)return '宝物仅可精炼'
  if(operation.value==='DRILL'&&gear.value.sockets>=3)return '已开启全部孔位'
  if(operation.value==='SOCKET'&&gear.value.gems.length>=gear.value.sockets)return '没有空孔，请先打孔'
  if(!material.value)return operation.value==='SOCKET'?'暂无相容宝石':'缺少培养材料'
  if(material.value.quantity<cost.value)return '材料数量不足'
  return ''
})
const risk=computed(()=>operation.value==='REFINE'?'失败可能不变或降一级。':operation.value==='DRILL'?'失败消耗材料，已有孔位不变。':operation.value==='UNSOCKET'?'免费取出，不消耗道具或金币；孔位保留，宝石退回包裹。':'镶嵌消耗一颗宝石，之后可免费取出。')


watch(()=>props.locked,value=>{if(!value)pending.value=false})
function switchOperation(value:ForgeOperation){if(!props.locked&&!pending.value)operation.value=value}
function submit(){if(reason.value)return;pending.value=true;emit('forge',{slot:props.equipment.slot,operation:operation.value,...(operation.value==='UNSOCKET'?{gemIndex:gemSlot.value!-1,gemItemId:selectedGem.value!.itemId}:{materialId:materialId.value}),clientActionId:actionId()})}
</script>
<template><section v-if="gear" class="forge-panel" aria-label="装备工坊">
  <div class="forge-modes" role="group" aria-label="培养方式"><button v-for="mode in modes" v-show="mode.key==='REFINE'||isEquipment" :key="mode.key" type="button" :class="{active:operation===mode.key}" :aria-pressed="operation===mode.key" :disabled="locked||pending" @click="switchOperation(mode.key)">{{mode.name}}</button></div>
  <div class="forge-stage"><span class="forge-seal" aria-hidden="true">{{{REFINE:'炼',DRILL:'锻',SOCKET:'嵌',UNSOCKET:'取'}[operation]}}</span><div><small>{{actionName}}进度</small><strong v-if="operation==='REFINE'">+{{gear.refineLevel}} <span>→</span> {{gear.refineLevel>=9?'已满级':'+'+(gear.refineLevel+1)}}</strong><strong v-else-if="operation==='DRILL'">{{gear.sockets}} 孔 <span>→</span> {{gear.sockets>=3?'已开满':(gear.sockets+1)+' 孔'}}</strong><strong v-else>{{gear.gems.length}} / {{gear.sockets}} <span>已镶嵌</span></strong></div><div class="forge-rate"><small>{{operation==='UNSOCKET'?'取出费用':'成功率'}}</small><b>{{operation==='UNSOCKET'?'免费':loaded?Math.round(chance*100)+'%':'—'}}</b></div></div>
  <div v-if="isEquipment" class="gem-sockets" aria-label="装备孔位"><span v-for="n in 3" :key="n" :class="{sealed:n>gear.sockets,filled:gear.gems[n-1]}" :data-game-hint="gear.gems[n-1]?gear.gems[n-1].name+' · '+gemSummary(gear.gems[n-1]):undefined"><img v-if="gear.gems[n-1]?.icon" :src="gear.gems[n-1].icon" alt=""><i v-else aria-hidden="true">{{n>gear.sockets?'×':gear.gems[n-1]?'◆':'◇'}}</i><small>{{n>gear.sockets?'未打孔':gear.gems[n-1]?.name??'空孔'}}</small></span></div>
  <template v-if="operation==='UNSOCKET'"><div class="forge-material-heading"><span>选择要取出的宝石</span><small>悬停查看属性</small></div><IconInventoryPicker v-model="gemSlot" label="已镶嵌宝石" :options="socketChoices" compact :preview="false" :heading="false" :disabled="locked||pending" empty-text="装备尚未镶嵌宝石"/></template>
  <template v-else><div class="forge-material-heading"><span>{{operation==='SOCKET'?'相容宝石':'培养材料'}}</span><small>悬停查看详情</small></div>
  <IconInventoryPicker v-model="materialId" :label="operation==='SOCKET'?'相容宝石':'培养材料'" :options="materials" compact :preview="false" :heading="false" :disabled="locked||pending" :empty-text="operation==='SOCKET'?'暂无适合此装备的宝石':'包裹中暂无所需材料'"/>
  <div class="forge-cost"><span>{{material?.item.name??'尚无材料'}}</span><small>消耗 <b>{{cost}}</b> / 持有 {{material?.quantity??0}}</small></div></template>
  <p class="forge-risk">{{risk}}</p>
  <button type="button" class="primary forge-submit" :disabled="Boolean(reason)" @click="submit">{{reason||'开始'+actionName}}</button>
  <button v-if="loadError" type="button" class="forge-retry" @click="loadRules">重试加载</button>
</section></template>
<style scoped>
.forge-panel{min-width:0}.forge-modes{display:flex;gap:6px}.shell .forge-modes button{flex:1;font-size:12px;min-height:32px;padding:6px;background:#151d12;border-color:#434a31;box-shadow:inset 0 1px #77744433;color:#aaa580}.shell .forge-modes button.active{color:#f1d885;border-color:#b09a54;background:linear-gradient(#555330,#2c3420);box-shadow:inset 0 0 8px #c7ab4522}.forge-stage{display:flex;align-items:center;gap:12px;padding:18px 0 14px}.forge-seal{width:46px;height:46px;flex:none;display:grid;place-items:center;border:1px solid #9c8041;background:radial-gradient(#58502b,#171e13);box-shadow:inset 0 0 0 3px #121a13,0 0 18px #ba8e3422;color:#dbbc67;font-size:27px}.forge-stage small{display:block;font-size:10px;color:#969779;margin-bottom:5px}.forge-stage strong{font:19px Georgia,serif;color:#f0d991}.forge-stage strong span{color:#8f9276;font-size:12px;padding:0 4px}.forge-rate{margin-left:auto;text-align:right}.forge-rate b{font:21px Georgia,serif;color:#b3d28a}.gem-sockets{display:flex;gap:8px;margin-bottom:16px}.gem-sockets>span{display:flex;align-items:center;gap:5px;flex:1;min-width:0;padding:5px;border:1px solid #766735;background:#172014;color:#bca96c}.gem-sockets i{font-style:normal;color:#c9b773;font-size:18px}.gem-sockets small{font-size:10px;overflow-wrap:anywhere}.gem-sockets .sealed{border-color:#3f4832;color:#75806b}.gem-sockets .sealed i{color:#4f5945}.gem-sockets .filled{border-color:#89a95b;background:#2b351e;color:#c2d68d}.forge-material-heading,.forge-cost{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:12px;margin:10px 0;color:#beaf7f}.forge-material-heading small,.forge-cost small{font-size:10px;color:#939576}.forge-cost b{color:#e0c575;font-weight:normal}.forge-risk{font-size:11px;color:#b89972;line-height:1.6;margin:12px 0}.shell .forge-submit{width:100%;padding:8px;font-size:13px;min-height:36px}.shell .forge-retry{width:100%;margin-top:8px;font-size:12px}
</style>
