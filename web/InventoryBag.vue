<script setup lang="ts">
import {computed,onMounted,onUnmounted,ref,watch} from 'vue'
import type {InventoryEntry,ItemDefinition} from '../shared/items'
import type {SkillDefinition} from '../shared/contracts'
import {itemStatBonuses,equipmentSlots,itemTypes,inventoryKey,itemSetBonuses} from '../shared/items'
import {bagCategories,bagCategory,type BagCategory} from '../shared/inventory'
import {qualityTier} from '../shared/quality'
import {gemBonuses,gemSummary} from '../shared/gems'
import {statLabels} from '../shared/hero-growth'
import {artUrl,iconNames,itemArt} from './art'
const props=defineProps<{inventory:InventoryEntry[];skills:SkillDefinition[]}>()
const emit=defineEmits<{forge:[];'use-item':[itemId:number]}>()
const category=ref<BagCategory>('EQUIPMENT'),hovered=ref<number|null>(null),position=ref({left:'0px',top:'0px'}),tip=ref<HTMLElement>()
const entries=computed(()=>props.inventory.filter(e=>e.quantity>0&&bagCategory(e.item)===category.value).slice().sort((a,b)=>qualityTier(b.item.rarity,b.item.qualityTier)-qualityTier(a.item.rarity,a.item.qualityTier)||a.item.id-b.item.id))
const detail=computed(()=>props.inventory.find(e=>inventoryKey(e)===hovered.value))
function src(i:ItemDefinition){const key=props.skills.find(s=>s.id===i.effectConfig.skillId)?.iconKey??i.code.replace('skill_book_','');return itemArt(i.name,i.effectConfig.icon)??(i.itemType==='SKILL_BOOK'&&Object.hasOwn(iconNames,key)?artUrl(key,true):null)}
function activate(entry:InventoryEntry,event:Event){if(entry.quantity>0&&entry.item.enabled&&!entry.item.deletedAt&&entry.item.itemType==='CONSUMABLE'&&['TALENT','EXPERIENCE','STAMINA'].includes(entry.item.effectConfig.kind??'')){close();emit('use-item',entry.item.id)}else show(event,inventoryKey(entry))}
function glyph(i:ItemDefinition){return i.itemType==='SKILL_BOOK'||i.effectConfig.kind==='EXPERIENCE'?'book':i.itemType==='TREASURE'?'treasure':i.itemType==='MATERIAL'?'material':i.itemType==='CONSUMABLE'?'bottle':i.effectConfig.slot==='HELMET'?'helmet':i.effectConfig.slot==='BOOTS'?'boots':['RING','BRACELET','NECKLACE'].includes(i.effectConfig.slot??'')?'jewel':'armor'}
function close(){hovered.value=null}
function show(e:Event,id:number){hovered.value=id;const rect=(e.currentTarget as HTMLElement).getBoundingClientRect();position.value={left:Math.max(8,Math.min(rect.right+12,window.innerWidth-332))+'px',top:Math.max(8,Math.min(rect.top,window.innerHeight-360))+'px'}}
function onScroll(e:Event){if(e.target!==tip.value)close()}
watch(category,close)
onMounted(()=>{window.addEventListener('scroll',onScroll,true);window.addEventListener('resize',close);window.addEventListener('keydown',escape)})
function scrollDetail(event:WheelEvent){if(tip.value&&detail.value){event.preventDefault();tip.value.scrollTop+=event.deltaY}}
function scrollKeys(event:KeyboardEvent){if(!tip.value||!detail.value||!['PageDown','PageUp'].includes(event.key))return;event.preventDefault();tip.value.scrollTop+=event.key==='PageDown'?240:-240}
function escape(e:KeyboardEvent){if(e.key==='Escape')close()}
onUnmounted(()=>{window.removeEventListener('scroll',onScroll,true);window.removeEventListener('resize',close);window.removeEventListener('keydown',escape)})
</script>
<template>
  <svg class="bag-symbols" aria-hidden="true"><defs>
    <symbol id="bag-book" viewBox="0 0 64 64"><path d="M14 12h35v39H16q-7 0-7-6V18q0-6 5-6Z"/><path d="M18 12v33h31M18 45q-9-4-9 2M25 21h17M25 28h17M25 35h10"/></symbol>
    <symbol id="bag-bottle" viewBox="0 0 64 64"><path d="M25 8h14v9h-3v8q17 9 13 23-3 11-17 11T15 48q-4-14 13-23v-8h-3Z"/><path d="M20 38q12 7 24 0M26 8h12M26 16h12"/><path d="m32 34 5 9-5 8-5-8Z"/></symbol>
    <symbol id="bag-treasure" viewBox="0 0 64 64"><path d="M15 14q17-7 34 0v16q0 11-17 21-17-10-17-21Z"/><path d="m32 18 10 12-10 13-10-13ZM23 51l-4 9M32 51v11M41 51l4 9"/></symbol>
    <symbol id="bag-material" viewBox="0 0 64 64"><path d="m10 32 13-20 26 3 7 25-20 14-23-7Z"/><path d="m23 12 9 22 17-19M32 34l4 20M13 47l19-13 24 6"/></symbol>
    <symbol id="bag-helmet" viewBox="0 0 64 64"><path d="M13 36Q13 10 32 10T51 36v19H40V39H24v16H13Z"/><path d="M32 8v23M13 32q19-10 38 0M23 40l-3 12M41 40l3 12"/></symbol>
    <symbol id="bag-boots" viewBox="0 0 64 64"><path d="M18 8h24l-3 30 13 8v9H11V43l8-7Z"/><path d="M18 17h22M18 25h21M12 48h39M21 39l10 6"/></symbol>
    <symbol id="bag-jewel" viewBox="0 0 64 64"><circle cx="32" cy="35" r="19"/><circle cx="32" cy="35" r="11"/><path d="m32 4 10 11-10 12-10-12Z"/></symbol>
    <symbol id="bag-armor" viewBox="0 0 64 64"><path d="m24 10-15 7 6 14 6-3-5 27h32l-5-27 6 3 6-14-15-7q-8 12-16 0Z"/><path d="M25 24h14M22 33h20M21 42h22M32 23v28"/></symbol>
  </defs></svg>
  <div class="bag-heading"><div><small>珍藏随身 · 征战所得</small><h1>我的物品</h1></div><div><span>{{inventory.length}} 种物品</span> <button type="button" @click="emit('forge')">宝石工坊</button></div></div>
  <div class="detail-tabs bag-tabs" role="group" aria-label="包裹类别"><button v-for="(name,key) in bagCategories" :key="key" :class="{active:category===key}" :aria-pressed="category===key" @click="category=key">{{name}} <small>{{inventory.filter(e=>bagCategory(e.item)===key).length}}</small></button></div>
  <p class="fineprint">悬停图标查看详情，离开立即收起；鼠标留在图标上可用滚轮翻阅。点击天赋水、经验书或体力道具，选择英雄使用。</p>
  <div class="bag-grid" :aria-label="bagCategories[category]+'包裹'">
    <button v-for="entry in entries" :key="inventoryKey(entry)" type="button" class="asset-icon bag-slot" :class="'quality-'+qualityTier(entry.item.rarity,entry.item.qualityTier)" :aria-label="entry.item.name+'，数量'+entry.quantity" :aria-describedby="hovered===inventoryKey(entry)?'bag-item-tooltip':undefined" @mouseenter="show($event,inventoryKey(entry))" @mouseleave="close" @focus="show($event,inventoryKey(entry))" @blur="close" @click="activate(entry,$event)" @contextmenu.prevent="activate(entry,$event)" @wheel="scrollDetail" @keydown="scrollKeys">
      <img v-if="src(entry.item)" :src="src(entry.item)!" alt=""><svg v-else viewBox="0 0 64 64" aria-hidden="true"><use :href="'#bag-'+glyph(entry.item)"/></svg><span class="bag-count">{{entry.gear?'+'+entry.gear.refineLevel:entry.quantity.toLocaleString()}}</span>
    </button>
    <span v-for="n in Math.max(0,48-entries.length)" :key="'empty-'+n" class="bag-empty" aria-hidden="true"></span>
  </div><p v-if="!entries.length" class="bag-empty-caption">尚无{{bagCategories[category]}}</p>
  <Teleport to="body"><div v-if="detail" id="bag-item-tooltip" ref="tip" role="tooltip" class="bag-tooltip" :class="'quality-'+qualityTier(detail.item.rarity,detail.item.qualityTier)" :style="position">
    <h3>{{detail.item.name}} <span v-if="detail.gear">+{{detail.gear.refineLevel}}</span></h3><p v-if="detail.gear">孔位 {{detail.gear.gems.length}} / {{detail.gear.sockets}}<br><span v-for="gem in detail.gear.gems" :key="gem.itemId">{{gem.name}}：{{gemSummary(gem)}}　</span></p><p v-if="detail.item.effectConfig.requiredStrength">实力要求：{{detail.item.effectConfig.requiredStrength}}</p><p v-for="(value,key) in itemStatBonuses(detail.item,detail.gear)" :key="key">{{statLabels[key]}} +{{(value??0).toLocaleString()}}</p><small>{{itemTypes[detail.item.itemType]}} · 数量 {{detail.quantity}}</small>
    <p v-if="['EQUIPMENT','TREASURE'].includes(detail.item.itemType)">{{'★'.repeat(detail.item.rarity)}}</p><p>{{detail.item.description}}</p><p v-for="(value,key) in gemBonuses(detail.item)" :key="key">{{statLabels[key]}} +{{value?.toLocaleString()}}</p>
    <p v-if="detail.item.effectConfig.slot">部位：{{equipmentSlots[detail.item.effectConfig.slot]}}</p>
    <p v-for="(value,key) in itemStatBonuses(detail.item,detail.gear,true)" :key="key">{{statLabels[key]}} +{{value}}%</p>
    <p v-if="detail.item.effectConfig.kind==='EXPERIENCE'">使用后增加 {{detail.item.effectConfig.amount}} 点英雄经验。</p>
    <p v-if="detail.item.effectConfig.kind==='TALENT'">重新洗练英雄天赋，可能提升或降低。</p>
    <p v-if="detail.item.effectConfig.kind==='STAMINA'">恢复 {{detail.item.effectConfig.amount}} 点体力，不超过上限。</p>

    <p v-for="tier in itemSetBonuses(detail.item)" :key="tier.count">套装 {{tier.count}} 件：<span v-for="(value,key) in tier.bonuses" :key="key">{{statLabels[key]}} +{{value}}%　</span></p><p v-if="!detail.item.enabled">已停用，暂不可使用。</p>
  </div></Teleport>
</template>
