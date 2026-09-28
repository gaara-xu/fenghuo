<script setup lang="ts">
import {onMounted,onUnmounted,ref} from 'vue'
import {tooltipPosition} from './tooltip-position'
const tiers=ref<Array<{text:string;active:boolean}>>([])
const text=ref(''),position=ref({left:'0px',top:'0px'}),panel=ref<HTMLElement>()
let owner:Element|null=null
function hide(){owner=null;text.value='';tiers.value=[]}
function show(e:Event){const el=e.target instanceof Element?e.target.closest('[data-game-hint]'):null;if(!el||!el.getAttribute('data-game-hint'))return;if(owner===el)return;owner=el;try{const parsed=JSON.parse(el.getAttribute('data-game-set-hint')??'[]');tiers.value=Array.isArray(parsed)?parsed.filter(t=>typeof t.text==='string'&&typeof t.active==='boolean'):[]}catch{tiers.value=[]}text.value=el.getAttribute('data-game-hint')!;position.value=tooltipPosition(el.getBoundingClientRect(),{width:innerWidth,height:innerHeight})}
function leave(e:MouseEvent|FocusEvent){if(e.relatedTarget instanceof Node&&owner?.contains(e.relatedTarget))return;hide()}
function wheel(e:WheelEvent){if(panel.value&&e.target instanceof Node&&owner?.contains(e.target)){e.preventDefault();panel.value.scrollTop+=e.deltaY}}
function scroll(e:Event){if(e.target instanceof Node&&panel.value?.contains(e.target))return;hide()}
function escape(e:KeyboardEvent){if(e.key==='Escape')hide();else if(panel.value&&e.target instanceof Node&&owner?.contains(e.target)&&['PageDown','PageUp'].includes(e.key)){e.preventDefault();panel.value.scrollTop+=e.key==='PageDown'?240:-240}}
onMounted(()=>{document.addEventListener('mouseover',show);document.addEventListener('mouseout',leave);document.addEventListener('focusin',show);document.addEventListener('focusout',leave);document.addEventListener('scroll',scroll,true);document.addEventListener('wheel',wheel,{passive:false});window.addEventListener('resize',hide);document.addEventListener('keydown',escape)})
onUnmounted(()=>{hide();document.removeEventListener('mouseover',show);document.removeEventListener('mouseout',leave);document.removeEventListener('focusin',show);document.removeEventListener('focusout',leave);document.removeEventListener('scroll',scroll,true);document.removeEventListener('wheel',wheel);window.removeEventListener('resize',hide);document.removeEventListener('keydown',escape)})
</script>
<template><Teleport to="body"><div v-if="text" ref="panel" class="bag-tooltip game-hint" role="tooltip" :style="position">{{text}}<p v-for="tier in tiers" :key="tier.text" :class="{'set-inactive':!tier.active}">{{tier.text}}</p></div></Teleport></template>
<style scoped>.game-hint{white-space:pre-line;pointer-events:none;font-size:12px;line-height:1.8;color:#e0c995;border-color:#9b864e;max-height:min(350px,calc(100dvh - 16px));overflow:auto;z-index:360}</style>

<style scoped>.game-hint p{margin:4px 0;color:#b9c99a}.game-hint .set-inactive{color:#858585}</style>
