<script setup lang="ts">
import {computed,ref,watch} from 'vue'
import type {WorldStatus} from '../shared/contracts'
import type {ItemDefinition,EquippedItem} from '../shared/items'
import {equipmentSlots} from '../shared/items'
import type {ForgeTarget} from '../shared/forge'
import {inventoryChoice} from './item-choices'
import IconInventoryPicker from './IconInventoryPicker.vue'
import EquipmentForge from './EquipmentForge.vue'
import GemWorkshop from './GemWorkshop.vue'
import EquipmentSalvage from './EquipmentSalvage.vue'
const props=defineProps<{world:WorldStatus;gems:ItemDefinition[];busy:boolean;focusInstanceId?:number;initialTab?:'equipment'|'gems'}>()
const emit=defineEmits<{forge:[body:object];combine:[body:object];bag:[];salvaged:[message:string]}>()
const tab=ref<'equipment'|'gems'|'salvage'>(props.initialTab??'equipment'),source=ref('ALL'),search=ref(''),selected=ref<number>()
type Workpiece={equipment:EquippedItem;target:ForgeTarget;location:string;blocked:boolean;choice:ReturnType<typeof inventoryChoice>}
const entries=computed<Workpiece[]>(()=>[
  ...props.world.inventory.filter(e=>e.item.itemType==='EQUIPMENT'&&e.quantity>0&&e.item.effectConfig.slot).map(e=>({
    equipment:{heroId:0,slot:e.item.effectConfig.slot!,item:e.item,gear:e.gear??{instanceId:0,refineLevel:0,sockets:e.item.effectConfig.initialSockets??0,gems:[]}},
    target:e.gear?{kind:'INSTANCE' as const,instanceId:e.gear.instanceId}:{kind:'STACK' as const,itemId:e.item.id},
    location:'包裹',blocked:false,choice:inventoryChoice(e),
  })),
  ...props.world.ownedHeroes.flatMap(hero=>hero.equipment.filter(e=>e.item.itemType==='EQUIPMENT'&&e.gear).map(e=>({
    equipment:e,target:{kind:'EQUIPPED' as const,heroId:hero.id,slot:e.slot,instanceId:e.gear!.instanceId},location:hero.name,blocked:hero.busy,choice:inventoryChoice({...e,quantity:1},hero.equipment),
  }))),
])
const visible=computed(()=>entries.value.filter(e=>(source.value==='ALL'||(source.value==='BAG')===(e.target.kind!=='EQUIPPED'))&&(e.equipment.item.name+e.location).includes(search.value)))
const choices=computed(()=>visible.value.map(e=>({...e.choice,disabled:e.blocked,lines:[...e.choice.lines??[],'所在：'+e.location,...(e.blocked?['英雄出征中，返城后可操作。']:[])]})))
const current=computed(()=>entries.value.find(e=>e.choice.id===selected.value))
watch(visible,()=>{if(!visible.value.some(e=>e.choice.id===selected.value))selected.value=visible.value.find(e=>!e.blocked)?.choice.id},{immediate:true})
watch(()=>props.initialTab,t=>{if(t)tab.value=t})
watch(()=>props.focusInstanceId,id=>{if(id&&entries.value.some(e=>e.equipment.gear?.instanceId===id)){source.value='ALL';search.value='';selected.value=-id}})
function forge(command:object){if(!current.value||props.busy||current.value.blocked)return;emit('forge',{...command,target:current.value.target})}
</script>
<template>
  <section class="game-workshop">
    <header class="workshop-heading"><div><small>天工开物 · 淬石成璧</small><h1>工坊</h1></div><button type="button" :disabled="busy" @click="emit('bag')">我的物品</button></header>
    <div class="workshop-tabs" role="group" aria-label="工坊功能"><button type="button" :disabled="busy" :class="{active:tab==='equipment'}" :aria-pressed="tab==='equipment'" @click="tab='equipment'">装备工坊</button><button type="button" :disabled="busy" :class="{active:tab==='gems'}" :aria-pressed="tab==='gems'" @click="tab='gems'">宝石合成</button><button type="button" :disabled="busy" :class="{active:tab==='salvage'}" :aria-pressed="tab==='salvage'" @click="tab='salvage'">批量分解</button></div>
    <GemWorkshop v-if="tab==='gems'" :inventory="world.inventory" :catalog="gems" :busy="busy" embedded @combine="emit('combine',$event)"/>
    <EquipmentSalvage v-else-if="tab==='salvage'" :inventory="world.inventory" :busy="busy" @changed="emit('salvaged',$event)"/>
    <div v-else class="workshop-layout">
      <aside class="workshop-stock"><div class="workshop-stock-head"><h3>选择装备</h3><small>{{visible.length}} 件</small></div><input v-model="search" :disabled="busy" aria-label="搜索工坊装备" placeholder="搜索装备或英雄名字"><div class="workshop-filters"><button v-for="(name,key) in {ALL:'全部',BAG:'包裹',WORN:'英雄身上'}" :key="key" type="button" :disabled="busy" :class="{active:source===key}" :aria-pressed="source===key" @click="source=key">{{name}}</button></div>
        <IconInventoryPicker v-model="selected" :options="choices" label="工坊装备" compact :preview="false" :heading="false" :disabled="busy" empty-text="没有符合条件的装备"/>
        <p>包裹装备可直接加工，无需先穿戴。悬停图标查看属性。</p>
      </aside>
      <section class="workshop-anvil" aria-label="装备加工">
        <template v-if="current"><header :class="'quality-'+(current.choice.quality??1)"><IconInventoryPicker :options="[current.choice]" label="当前加工装备" compact :preview="false" :heading="false"/><div><small>{{current.location}} · {{equipmentSlots[current.equipment.slot]}}</small><h3>{{current.equipment.item.name}}</h3><span>{{current.blocked?'英雄出征中，暂不可操作':'打孔 · 镶嵌 · 免费取石'}}</span></div></header>
          <EquipmentForge :key="current.choice.id" :equipment="current.equipment" :inventory="world.inventory" :locked="busy||current.blocked" :operations="['DRILL','SOCKET','UNSOCKET']" @forge="forge"/>
        </template>
        <div v-else class="workshop-empty"><b>炉火待启</b><p>从左侧选择一件装备</p></div>
      </section>
    </div>
  </section>
</template>
<style scoped>
.game-workshop{max-width:1120px;margin:auto;border:1px solid #75613e;background:linear-gradient(130deg,#282b1e,#101811);box-shadow:inset 0 0 0 4px #111b;padding:20px;color:#c7b98b}.workshop-heading{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #665a38;padding-bottom:14px}.workshop-heading small{color:#9b9974;letter-spacing:3px}.workshop-heading h1{margin:6px 0 0;font-size:26px;color:#e8cc7b}.workshop-tabs{display:flex;gap:8px;margin:16px 0}.shell .workshop-tabs button{min-width:128px}.shell .workshop-tabs button.active,.shell .workshop-filters button.active{border-color:#bca25a;color:#f3db90;background:linear-gradient(#595232,#2c341f)}.workshop-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:18px;align-items:start}.workshop-stock,.workshop-anvil{min-width:0;padding:16px;border:1px solid #565337;background:#131c12}.workshop-stock-head{display:flex;align-items:center;justify-content:space-between}.workshop-stock h3{border:0;padding:0;margin:0 0 12px;color:#d5ba70;letter-spacing:2px}.workshop-stock small{font-size:11px;color:#919875}.workshop-stock>input{box-sizing:border-box;width:100%;margin-bottom:10px}.workshop-filters{display:flex;gap:6px;margin-bottom:10px}.shell .workshop-filters button{flex:1;font-size:12px;padding:6px}.workshop-stock>p{font-size:12px;line-height:1.7;color:#909576;margin:12px 0 0}.workshop-stock :deep(.picker-grid){max-height:420px;align-content:start;overflow:auto}.workshop-anvil>header{display:flex;align-items:center;gap:14px;padding-bottom:14px;margin-bottom:14px;border-bottom:1px solid #555035}.workshop-anvil>header>:first-child{width:64px;flex:none}.workshop-anvil>header :deep(.picker-grid){border:0;padding:0;background:none;box-shadow:none;overflow:visible}.workshop-anvil>header h3{border:0;margin:5px 0;padding:0;font-size:19px;color:var(--quality,#d6bd79)}.workshop-anvil>header small,.workshop-anvil>header span{font-size:11px;color:#a9a17d}.workshop-empty{text-align:center;padding:95px 12px;color:#96916a}.workshop-empty b{font-size:27px;font-weight:normal;letter-spacing:8px}.workshop-empty p{font-size:13px}.game-workshop :deep(.gem-workshop){border:0;padding:8px 0;background:none;box-shadow:none}@media(max-width:780px){.workshop-layout{grid-template-columns:1fr}.game-workshop{padding:12px}.workshop-stock :deep(.picker-grid){max-height:230px}}
</style>
