<script setup lang="ts">
import {computed,onMounted,onUnmounted,ref,useId,watch} from 'vue'
import type {HeroDefinition,SkillDefinition,TavernRefreshResult} from '../shared/contracts'
import {MAX_OWNED_HEROES} from '../shared/world-rules'
import {label,talentLabels} from '../shared/labels'
import {qualityTier} from '../shared/quality'
import {itemTypes} from '../shared/items'
import {inventoryChoice} from './item-choices'
import {itemArt} from './art'
import AssetIcon from './AssetIcon.vue'
import ItemGlyph from './ItemGlyph.vue'
import {tooltipPosition} from './tooltip-position'
const props=defineProps<{result:TavernRefreshResult;heroes:HeroDefinition[];skills:SkillDefinition[];busy:boolean;heroCount:number}>()
defineEmits<{claim:[id:number];bag:[]}>()
const remaining=computed(()=>Math.max(0,props.result.pool.selectLimit-props.result.candidates.filter(c=>c.recruited).length))
const cards=computed(()=>props.result.candidates.map(c=>{
  const hero=props.heroes.find(h=>h.id===c.heroDefinitionId),skill=props.skills.find(s=>s.id===c.skillDefinitionId)
  const choice=c.item?inventoryChoice({item:c.item,quantity:1}):undefined
  return {...c,quality:qualityTier(c.rarity,c.item?.qualityTier??hero?.qualityTier??skill?.qualityTier),
    iconKey:hero?.portraitKey??skill?.iconKey,imageUrl:c.item?itemArt(c.item.name,c.item.effectConfig.icon)??undefined:undefined,
    description:c.item?.description??skill?.description,lines:choice?.lines?.slice(1)??[],glyph:choice?.glyph,
    kind:c.item?itemTypes[c.item.itemType]:c.rewardType==='HERO'?'英雄':'技能书',
    full:c.rewardType==='HERO'&&props.heroCount>=MAX_OWNED_HEROES}
}))
const hovered=ref<number>(),detail=computed(()=>cards.value.find(c=>c.id===hovered.value&&c.item))
const tooltipId=useId(),tooltip=ref<HTMLElement>(),position=ref({left:'0px',top:'0px'})
function close(){hovered.value=undefined}
function show(event:Event,id:number){
  if(!cards.value.some(c=>c.id===id&&c.item))return
  hovered.value=id
  position.value=tooltipPosition((event.currentTarget as HTMLElement).getBoundingClientRect(),{width:window.innerWidth,height:window.innerHeight})
}
function scrollDetail(event:WheelEvent){if(tooltip.value&&detail.value){event.preventDefault();tooltip.value.scrollTop+=event.deltaY}}
function scrollKeys(event:KeyboardEvent){if(!tooltip.value||!detail.value||!['PageDown','PageUp'].includes(event.key))return;event.preventDefault();tooltip.value.scrollTop+=event.key==='PageDown'?240:-240}
function escape(event:KeyboardEvent){if(event.key==='Escape')close()}
function scroll(event:Event){if(event.target!==tooltip.value)close()}
watch(()=>props.result.refreshId,close)
watch(()=>cards.value.map(c=>c.id),ids=>{if(hovered.value!==undefined&&!ids.includes(hovered.value))close()})
onMounted(()=>{window.addEventListener('scroll',scroll,true);window.addEventListener('resize',close);window.addEventListener('keydown',escape)})
onUnmounted(()=>{window.removeEventListener('scroll',scroll,true);window.removeEventListener('resize',close);window.removeEventListener('keydown',escape)})
</script>
<template>
  <p class="tavern-limit" aria-live="polite">本轮可选 {{result.pool.selectLimit}} 件 · 还可选 {{remaining}} 件 <button v-if="result.candidates.some(c=>c.recruited&&c.rewardType!=='HERO')" @click="$emit('bag')">查看包裹</button></p>
  <div class="cards tavern-cards">
    <article v-for="c in cards" :key="c.id" class="card tavern-card" :class="['quality-'+c.quality,{claimed:c.recruited}]">
      <span class="tavern-art-target" :tabindex="c.item?0:undefined" :aria-label="c.item?c.name+'，悬停查看详情':undefined" :aria-describedby="detail?.id===c.id?tooltipId:undefined" @mouseenter="show($event,c.id)" @mouseleave="close" @focusin="show($event,c.id)" @focusout="close" @wheel="scrollDetail" @keydown="scrollKeys"><span v-if="c.item&&!c.imageUrl" class="asset-icon icon-large card-art item-art" :class="'quality-'+c.quality" :aria-label="c.name"><ItemGlyph :kind="c.glyph"/></span>
      <AssetIcon v-else class="card-art" :title="c.item?'':undefined" :name="c.name" :icon-key="c.iconKey" :image-url="c.imageUrl" :hero="c.rewardType==='HERO'" :rarity="c.rarity" :quality="c.quality" size="large"/></span>
      <div v-if="c.rewardType==='HERO'" class="stars">{{'★'.repeat(c.rarity)}}</div>
      <div v-else class="item-quality">{{c.kind}} × 1</div>
      <h2>{{c.name}}</h2>
      <p v-if="c.talentGrade">{{label(talentLabels,c.talentGrade)}}天赋</p>
      <p v-if="c.description&&!c.item" class="skill-description">{{c.description}}</p>
      <button :disabled="busy||c.recruited||remaining===0||c.full" @click="$emit('claim',c.id)">{{c.recruited?(c.rewardType==='HERO'?'已招募':'已收入包裹'):remaining===0?'本轮已选完':c.full?'英雄已满（6位）':c.rewardType==='HERO'?'招募英雄':'收入包裹'}}</button>
    </article>
  </div>
  <Teleport to="body"><div v-if="detail" :id="tooltipId" ref="tooltip" role="tooltip" class="bag-tooltip tavern-tooltip" :class="'quality-'+detail.quality" :style="position">
    <h3>{{detail.name}}</h3><small>{{detail.kind}} × 1</small>
    <p>{{detail.description}}</p><p v-for="line in detail.lines" :key="line">{{line}}</p>
  </div></Teleport>
</template>
<style scoped>
.tavern-art-target{display:inline-block;margin-inline:auto}.tavern-art-target[tabindex]{cursor:help}.tavern-card{min-height:330px}.tavern-card>button{margin-top:20px}.tavern-art-target:focus-visible{outline:2px solid #f6e2ad;outline-offset:4px}.tavern-tooltip{pointer-events:none}
.tavern-limit{text-align:center;color:#c8b483;font-size:13px}.tavern-limit button{margin-left:15px}.tavern-cards{grid-template-columns:repeat(3,minmax(0,1fr));margin:25px auto 35px}.tavern-card{border-color:var(--quality);box-shadow:0 16px 40px #0008,inset 0 0 24px color-mix(in srgb,var(--quality) 9%,transparent);overflow:visible}.tavern-card.quality-7{box-shadow:0 0 8px #ff655799,0 0 28px #fb233750,inset 0 0 25px #cb152b22}.tavern-card h2{font-size:23px;color:var(--quality);letter-spacing:2px}.tavern-card .card-art{width:150px;height:150px;border-color:var(--quality);border-radius:3px}.item-art svg{width:80%;height:80%;stroke:var(--quality);stroke-width:2;fill:color-mix(in srgb,var(--quality) 15%,#1c2218)}.item-quality{color:var(--quality);font-size:12px}.tavern-card .skill-description{line-height:1.75;font-size:13px;color:#baab8a;white-space:pre-wrap}.tavern-card button{margin-top:auto;min-width:145px}.tavern-card.claimed{background:linear-gradient(145deg,#283325,#171713 65%,#212919)}
@media(max-width:760px){.tavern-cards{grid-template-columns:1fr}.tavern-card{min-height:350px}}
</style>
