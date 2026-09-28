<script setup lang="ts">
import {computed,ref,watch} from 'vue'
import type {OwnedHero} from '../shared/contracts'
import type {InventoryEntry} from '../shared/items'
import {label,talentLabels} from '../shared/labels'
import {actionId} from './api'
import GameModal from './GameModal.vue'
import AssetIcon from './AssetIcon.vue'
const props=defineProps<{entry:InventoryEntry;heroes:OwnedHero[];initialHeroId?:number;busy:boolean;error?:string}>()
const emit=defineEmits<{close:[];use:[body:{heroId:number;itemId:number;clientActionId:string}]}>()
const selected=ref(props.initialHeroId??0),pending=ref(false)
const hero=computed(()=>props.heroes.find(h=>h.id===selected.value)),kind=computed(()=>props.entry.item.effectConfig.kind)
const blocked=computed(()=>props.busy||pending.value||props.entry.quantity<1||!props.entry.item.enabled||Boolean(props.entry.item.deletedAt)||!['TALENT','EXPERIENCE','STAMINA'].includes(kind.value??''))
watch(()=>props.busy,value=>{if(!value)pending.value=false})
function choose(h:OwnedHero){if(blocked.value||h.busy)return;selected.value=h.id;submit()}
function close(){if(!props.busy&&!pending.value)emit('close')}
function submit(){if(blocked.value||!hero.value||hero.value.busy)return;pending.value=true;emit('use',{heroId:hero.value.id,itemId:props.entry.item.id,clientActionId:actionId()})}
</script>
<template><GameModal :title="'使用'+entry.item.name" @close="close">
  <p class="item-use-intro">点击英雄立即使用，每次消耗 1 件 · 持有 {{entry.quantity}} 件</p>
  <div class="item-hero-list" role="group" aria-label="选择使用道具的英雄"><button v-for="h in heroes" :key="h.id" type="button" :class="{selected:selected===h.id}" :aria-pressed="selected===h.id" :disabled="blocked||h.busy" @click="choose(h)"><AssetIcon :name="h.name" :icon-key="h.portraitKey" hero :rarity="h.star" :quality="h.qualityTier" size="tiny"/><span><b>{{h.name}}</b><small>{{h.busy?'出征中':h.level+'级 · '+label(talentLabels,h.talentGrade)}}</small></span></button></div>
  <p v-if="!heroes.length" class="item-use-note">还没有英雄，请先到酒馆招募。</p>
  <template v-if="hero"><p class="item-use-note" v-if="kind==='TALENT'">为「{{hero.name}}」重新抽取天赋，可能提升、降低或不变；英雄等级不变。</p><p class="item-use-warning" v-if="kind==='TALENT'&&hero.talentGrade==='PERFECT'">当前已是完美天赋，继续使用仍会重新抽取，可能降低。</p><p class="item-use-note" v-else-if="kind==='EXPERIENCE'">为「{{hero.name}}」增加 {{entry.item.effectConfig.amount}} 点经验。</p><p class="item-use-note" v-else-if="kind==='STAMINA'">为「{{hero.name}}」恢复 {{entry.item.effectConfig.amount}} 点体力，不超过上限。</p></template>
  <p v-if="error" role="alert" class="item-use-warning">{{error}}</p>
  <template #footer><span v-if="busy||pending">正在使用…</span><button type="button" :disabled="busy||pending" @click="close">返回</button></template>
</GameModal></template>
<style scoped>.item-use-intro,.item-use-note{font-size:13px;line-height:1.8;color:#c7b990}.item-use-intro{margin:0 0 14px}.item-hero-list{display:grid;grid-template-columns:1fr 1fr;gap:10px}.item-hero-list button{display:flex;align-items:center;gap:10px;padding:10px;text-align:left;min-width:0;background:#191f15}.item-hero-list button.selected{border-color:#d1b75f;box-shadow:inset 0 0 0 1px #d1b75f;background:#3a3c22}.item-hero-list b{display:block;font-size:14px;overflow-wrap:anywhere}.item-hero-list small{display:block;font-size:11px;color:#a5a586;margin-top:5px}.item-use-warning{color:#e5ab78;font-size:13px;line-height:1.8;padding:10px;border:1px solid #805b36;background:#342819}@media(max-width:420px){.item-hero-list{grid-template-columns:1fr}}</style>
