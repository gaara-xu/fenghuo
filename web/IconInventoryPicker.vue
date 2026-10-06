<script setup lang="ts">
import {computed,onMounted,onUnmounted,ref,useId,watch} from 'vue'
import type {IconChoice} from './item-choices'
import {artUrl,itemArt} from './art'
import ItemGlyph from './ItemGlyph.vue'
import {tooltipPosition} from './tooltip-position'
const props=withDefaults(defineProps<{modelValue?:number;selectedIds?:number[];options:IconChoice[];label:string;disabled?:boolean;emptyText?:string;compact?:boolean;preview?:boolean;heading?:boolean}>(),{emptyText:'包裹中暂无可选物品',preview:true,heading:true})
const emit=defineEmits<{'update:modelValue':[value:number|undefined];activate:[value:number]}>()
const selected=computed(()=>props.options.find(o=>o.id===props.modelValue))
const hovered=ref<number>(),tip=computed(()=>props.options.find(o=>o.id===hovered.value)),position=ref({left:'0px',top:'0px'}),tooltipId=useId()
const tooltip=ref<HTMLElement>()
const src=(o:IconChoice,size:'small'|'large'='small')=>itemArt(o.name,o.imageUrl,size)??(o.iconKey?artUrl(o.iconKey,true,size):null)
function show(event:Event,id:number){hovered.value=id;position.value=tooltipPosition((event.currentTarget as HTMLElement).getBoundingClientRect(),{width:window.innerWidth,height:window.innerHeight})}
function close(){hovered.value=undefined}
function scroll(event:Event){if(event.target!==tooltip.value)close()}
function scrollDetail(event:WheelEvent){if(tooltip.value&&tip.value){event.preventDefault();tooltip.value.scrollTop+=event.deltaY}}
function scrollKeys(event:KeyboardEvent){if(!tooltip.value||!tip.value||!['PageDown','PageUp'].includes(event.key))return;event.preventDefault();tooltip.value.scrollTop+=event.key==='PageDown'?240:-240}
function escape(e:KeyboardEvent){if(e.key==='Escape')close()}
function choose(o:IconChoice){if(!props.disabled&&!o.disabled)emit('update:modelValue',o.id)}
function activate(o:IconChoice){if(!props.disabled&&!o.disabled)emit('activate',o.id)}
watch(()=>props.options.map(o=>o.id),ids=>{if(props.modelValue!==undefined&&!ids.includes(props.modelValue))emit('update:modelValue',undefined);if(hovered.value!==undefined&&!ids.includes(hovered.value))close()})
onMounted(()=>{window.addEventListener('scroll',scroll,true);window.addEventListener('resize',close);window.addEventListener('keydown',escape)})
onUnmounted(()=>{window.removeEventListener('scroll',scroll,true);window.removeEventListener('resize',close);window.removeEventListener('keydown',escape)})
</script>
<template><section class="icon-picker" :class="{'compact-picker':compact}" :aria-label="label">
  <div v-if="heading" class="picker-heading"><h4>{{label}}</h4><small>悬停查看 · 点击选择</small></div>
  <div class="bag-grid picker-grid" role="group" :aria-label="label">
    <button v-for="o in options" :key="o.id" type="button" class="asset-icon bag-slot" :class="['quality-'+(o.quality??1),{chosen:selectedIds?selectedIds.includes(o.id):modelValue===o.id,unavailable:disabled||o.disabled}]" :aria-disabled="disabled||o.disabled||undefined" :aria-label="o.name+(o.badge?'，'+o.badge:'')" :aria-pressed="selectedIds?selectedIds.includes(o.id):modelValue===o.id" :aria-describedby="hovered===o.id?tooltipId:undefined" @click="choose(o)" @dblclick="activate(o)" @contextmenu.prevent="activate(o)" @mouseenter="show($event,o.id)" @mouseleave="close" @focus="show($event,o.id)" @blur="close" @wheel="scrollDetail" @keydown="scrollKeys">
      <img v-if="src(o)" :src="src(o)!" alt="" loading="lazy"><ItemGlyph v-else :kind="o.glyph"/><span v-if="o.badge" class="bag-count">{{o.badge}}</span><span v-if="selectedIds?selectedIds.includes(o.id):modelValue===o.id" class="picker-check" aria-hidden="true">✓</span>
    </button><span v-for="n in compact?0:Math.max(0,12-options.length)" :key="'empty-'+n" class="bag-empty" aria-hidden="true"></span>
  </div>
  <p v-if="!options.length" class="bag-empty-caption">{{emptyText}}</p>
  <article v-if="selected&&preview" class="picker-preview" :class="'quality-'+(selected.quality??1)" aria-live="polite">
    <span class="asset-icon icon-large preview-art"><img v-if="src(selected,'large')" :src="src(selected,'large')!" :alt="selected.name"><ItemGlyph v-else :kind="selected.glyph"/></span>
    <div><h3>{{selected.name}}</h3><p>{{selected.detail}}</p><div class="picker-facts"><span v-for="line in selected.lines" :key="line">{{line}}</span></div></div>
  </article>
  <Teleport to="body"><div v-if="tip" :id="tooltipId" ref="tooltip" role="tooltip" class="bag-tooltip picker-tooltip" :class="'quality-'+(tip.quality??1)" :style="position"><h3>{{tip.name}}</h3><p>{{tip.detail}}</p><p v-for="line in tip.lines" :key="line">{{line}}</p><p v-for="tier in tip.setTiers" :key="tier.text" :class="{'set-inactive':!tier.active}">{{tier.text}}</p></div></Teleport>
</section></template>
<style scoped>
.icon-picker.compact-picker{margin:0}.compact-picker .picker-heading h4{margin:0;font-size:13px}.compact-picker .picker-heading{margin-bottom:10px}.compact-picker .picker-heading small{font-size:10px}.compact-picker .picker-grid{grid-template-columns:repeat(auto-fill,54px);gap:12px;min-height:0;max-height:190px;padding:12px;scrollbar-gutter:auto;border-color:#494932;border-radius:2px}.shell .compact-picker .picker-grid .bag-slot{width:54px;height:54px}.compact-picker .bag-slot svg{width:42px;height:42px}.compact-picker .bag-empty-caption{padding:20px 12px;margin:0;font-size:12px;line-height:1.8}.shell .picker-grid .bag-slot.unavailable{opacity:.5;cursor:help}.bag-tooltip.picker-tooltip{pointer-events:none}
</style>
<style scoped>
.icon-picker{width:100%;min-width:0;margin:16px 0}.picker-heading{display:flex;justify-content:space-between;align-items:center;gap:12px}.picker-heading h4{margin:0 0 12px;color:#d5b879}.picker-heading small{color:#aaa081;font-size:12px}.picker-grid{min-height:150px;max-height:390px;overflow-y:auto;align-content:start;scrollbar-gutter:stable;padding:20px}.shell .picker-grid .bag-slot{cursor:pointer;position:relative}.shell .picker-grid .bag-slot.chosen{outline:2px solid #f5d682;outline-offset:4px}.picker-check{position:absolute;top:-4px;right:-4px;background:#e4c57a;color:#241e0d;padding:0 4px;border-radius:50%;font:bold 13px/19px system-ui;box-shadow:0 1px 4px #000}.picker-preview{display:flex;align-items:flex-start;gap:20px;margin-top:18px;padding:18px;border:1px solid var(--quality);background:#141a13}.picker-preview h3{margin:0;color:var(--quality)}.picker-preview small{font-size:12px;color:#b7aa8d;margin-left:10px}.picker-preview p{white-space:pre-wrap;font-size:13px;line-height:1.8}.picker-facts{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:12px;color:#cabd97}.preview-art{flex:none;width:100px;height:100px}.preview-art svg{width:100%;height:100%;stroke:var(--quality);stroke-width:2;fill:#39442c}.picker-tooltip{pointer-events:none}@media(max-width:620px){.picker-preview{gap:12px;padding:12px}.preview-art{width:64px;height:64px}.picker-grid{padding:18px}}
</style>

<style scoped>.picker-tooltip .set-inactive{color:#858585}</style>
