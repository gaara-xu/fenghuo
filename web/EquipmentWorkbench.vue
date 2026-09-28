<script setup lang="ts">
import {computed,ref,watch} from 'vue'
import type {OwnedHero} from '../shared/contracts'
import {equipmentSlots,inventoryKey,slotMatches,type EquipmentSlot,type InventoryEntry} from '../shared/items'
import {inventoryChoice} from './item-choices'
import IconInventoryPicker from './IconInventoryPicker.vue'
import EquipmentForge from './EquipmentForge.vue'
const props=defineProps<{hero:OwnedHero;slot:EquipmentSlot;inventory:InventoryEntry[];locked:boolean}>()
const emit=defineEmits<{equip:[body:{slot:EquipmentSlot;itemId:number|null;instanceId?:number}];forge:[body:object]}>()
const choice=ref<number>(),mode=ref<'change'|'forge'>('change'),pending=ref(false)
const strength=computed(()=>props.hero.star*5+props.hero.level)
const equipment=computed(()=>props.hero.equipment.find(e=>e.slot===props.slot))
const current=computed(()=>equipment.value?inventoryChoice({...equipment.value,quantity:1},props.hero.equipment):undefined)
const candidates=computed(()=>props.inventory.filter(e=>e.quantity>0&&e.item.enabled&&!e.item.deletedAt&&slotMatches(e.item,props.slot)).map(e=>{
  const option=inventoryChoice(e),required=e.item.effectConfig.requiredStrength??0
  return {...option,disabled:required>strength.value,lines:[...option.lines??[],...(required>strength.value?['实力不足：当前 '+strength.value+' / 需要 '+required]:[])]}
}).sort((a,b)=>(b.quality??1)-(a.quality??1)))
const selected=computed(()=>candidates.value.find(e=>e.id===choice.value))
const blocked=computed(()=>props.locked||pending.value)
watch([()=>props.hero.id,()=>props.slot],()=>{choice.value=undefined;pending.value=false})
watch(()=>props.locked,value=>{if(!value)pending.value=false})
watch(()=>equipment.value?.gear?.instanceId,()=>{pending.value=false})
function equip(id=choice.value){
  if(blocked.value||id===undefined||!candidates.value.some(e=>e.id===id&&!e.disabled))return
  const entry=props.inventory.find(e=>inventoryKey(e)===id)
  if(!entry)return
  pending.value=true;emit('equip',{slot:props.slot,itemId:entry.item.id,instanceId:entry.gear?.instanceId});choice.value=undefined
}
function unequip(){if(blocked.value||!equipment.value)return;pending.value=true;emit('equip',{slot:props.slot,itemId:null})}
</script>
<template>
  <section class="armory" aria-label="英雄行装">
    <header class="armory-title"><h3>行装 <span>· {{equipmentSlots[slot]}}</span></h3><small>实力 {{strength}}</small></header>
    <div class="worn-item" :class="'quality-'+(current?.quality??1)">
      <IconInventoryPicker v-if="current" class="worn-icon" :options="[current]" :label="'当前穿戴：'+current.name" compact :preview="false" :heading="false" @activate="unequip"/>
      <span v-else class="vacant-slot" aria-hidden="true">{{equipmentSlots[slot]}}</span>
      <div class="worn-copy"><small>当前穿戴</small><h4>{{current?.name??'尚未装备'}}</h4><span v-if="current">精炼 +{{equipment?.gear?.refineLevel??0}}</span><span v-else>从下方包裹选择物品</span></div>
      <button v-if="equipment" type="button" class="unwear" :disabled="blocked" @click="unequip">卸下</button>
    </div>
    <div class="armory-tabs" role="group" aria-label="行装操作"><button type="button" :class="{active:mode==='change'}" :aria-pressed="mode==='change'" @click="mode='change'">换装 <small>{{candidates.length}}</small></button><button type="button" :class="{active:mode==='forge'}" :aria-pressed="mode==='forge'" @click="mode='forge'">装备工坊</button></div>
    <div v-if="mode==='change'" class="armory-bag">
      <div class="armory-caption"><span>{{equipmentSlots[slot]}}包裹</span><small>悬停详情 · 右键穿戴</small></div>
      <IconInventoryPicker v-model="choice" :options="candidates" :label="equipmentSlots[slot]+'包裹'" compact :preview="false" :heading="false" :disabled="blocked" empty-text="尚无可替换物品，可前往酒馆或征战获取。" @activate="equip"/>
      <div class="equip-action"><span :class="'quality-'+(selected?.quality??1)">{{selected?.name??'选择一件物品'}}<small>{{selected?'可替换当前部位':'仅显示该部位可用物品'}}</small></span><button type="button" class="primary" :disabled="blocked||!selected||selected.disabled" @click="equip()">{{pending?'穿戴中…':equipment?'换上':'穿戴'}}</button></div>
    </div>
    <template v-else><EquipmentForge v-if="equipment?.gear" :key="hero.id+'-'+equipment.gear.instanceId" :equipment="equipment" :inventory="inventory" :locked="blocked" @forge="body=>emit('forge',body)"/><div v-else class="armory-empty"><span>炉火待启</span><p>先在此部位穿戴装备或宝物</p><button type="button" @click="mode='change'">前往换装</button></div></template>
    <footer class="armory-footer"><span>{{hero.busy?'英雄出征中，暂不可调整行装':'点击左侧装备槽切换部位'}}</span><span>右键已穿戴物品可卸下</span></footer>
  </section>
</template>
<style scoped>
.armory{min-width:0;align-self:start;border:1px solid #6b6040;border-radius:4px;background:linear-gradient(135deg,#25281c,#101711 80%);box-shadow:inset 0 0 0 3px #080d0970,0 6px 18px #0005;color:#d7c89f}.armory-title{display:flex;justify-content:space-between;align-items:center;padding:13px 16px;background:linear-gradient(#42412a,#25291c);border-bottom:1px solid #6b6040}.armory .armory-title h3{border:0;padding:0;margin:0;font-size:17px;letter-spacing:3px;color:#f0d285}.armory-title h3 span{letter-spacing:1px;font-size:13px;color:#b8ab81}.armory-title>small{font-size:11px;color:#c6b47d}.worn-item{display:flex;gap:12px;align-items:center;margin:16px;padding-bottom:16px;border-bottom:1px solid #484934;min-width:0}.worn-icon{width:56px;flex:none}.worn-icon :deep(.picker-grid){padding:0;overflow:visible;background:none;border:0;box-shadow:none}.worn-copy{flex:1;min-width:0}.worn-copy small{font-size:10px;letter-spacing:2px;color:#999477}.worn-copy h4{font-size:16px;font-weight:normal;margin:5px 0;color:var(--quality,#ddc58a);overflow-wrap:anywhere}.worn-copy>span{font-size:11px;color:#a99c79}.shell .armory .unwear{padding:4px 7px;min-height:28px;font-size:11px;background:#191d14;border-color:#514c34;box-shadow:none;color:#b7a477}.vacant-slot{display:grid;place-items:center;width:54px;height:54px;flex:none;border:1px solid #595c3c;background:radial-gradient(#323820,#11170f);box-shadow:inset 0 0 0 4px #121710;color:#7e856a;font-size:12px}.armory-tabs{display:flex;margin:0 16px;border-bottom:1px solid #777047}.shell .armory-tabs>button{flex:1;border:1px solid transparent;border-radius:3px 3px 0 0;background:none;box-shadow:none;color:#a69e7a;min-height:36px;padding:7px 10px;font-size:13px}.shell .armory-tabs>button.active{color:#f2d98a;border-color:#777047;background:linear-gradient(#48492d,#262f1d);border-bottom-color:#262f1d}.armory-tabs small{font:10px system-ui;color:#a6a67a;margin-left:5px}.armory-bag{padding:16px}.armory-caption{display:flex;justify-content:space-between;gap:10px;font-size:12px;color:#c0b17d;margin-bottom:10px}.armory-caption small{color:#8e9278;font-size:10px}.equip-action{display:flex;align-items:center;gap:10px;justify-content:space-between;margin-top:14px;min-height:43px}.equip-action>span{font-size:13px;color:var(--quality,#c3b27f);min-width:0;overflow-wrap:anywhere}.equip-action small{display:block;color:#8f937b;font-size:10px;margin-top:4px}.shell .equip-action>button{white-space:nowrap;padding:8px 20px;min-width:82px;font-size:13px}.armory-footer{display:flex;justify-content:space-between;gap:10px;padding:11px 16px;border-top:1px solid #3e422c;font-size:10px;color:#8d9076}.armory-empty{text-align:center;padding:35px 16px}.armory-empty>span{font-size:24px;letter-spacing:6px;color:#8e8651}.armory-empty p{font-size:12px;color:#a29a77}.armory :deep(.forge-panel){margin:0;border:0;padding:16px}
</style>
