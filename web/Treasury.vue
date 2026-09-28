<script setup lang="ts">
import {computed,onMounted,onUnmounted,reactive,ref} from 'vue'
import type {WorldStatus} from '../shared/contracts'
import type {ItemDefinition} from '../shared/items'
import {filterTreasury,treasuryHoldings} from '../shared/treasury'
import {qualityLabels} from '../shared/quality'
import {api} from './api'
import {useTimedNotice} from './timed-notice'
import {inventoryChoice} from './item-choices'
import IconInventoryPicker from './IconInventoryPicker.vue'
const props=defineProps<{world:WorldStatus}>()
const items=ref<ItemDefinition[]>([]),selected=ref<number>(),error=useTimedNotice(),loaded=ref(false),refreshing=ref(false)
const filter=reactive({search:'',quality:0,ownedOnly:false})
const holdings=computed(()=>treasuryHoldings(props.world.inventory,props.world.ownedHeroes.flatMap(h=>h.equipment)))
const entries=computed(()=>filterTreasury(items.value,filter,holdings.value).map(item=>{
  const h=holdings.value[item.id]??{bag:0,equipped:0},choice=inventoryChoice({item,quantity:h.bag})
  choice.badge=h.bag+h.equipped?String(h.bag+h.equipped):undefined
  choice.lines?.push('包裹 '+h.bag+' 件 · 已穿戴 '+h.equipped+' 件')
  if(item.itemType==='EQUIPMENT')choice.lines?.push('支持精炼至 +9，最多三孔；材料与成功率在装备工坊查看。')
  else choice.lines?.push('可放入任意宝物槽，支持精炼，不可打孔或镶嵌。')
  return choice
}))
let timer:ReturnType<typeof setInterval>,controller:AbortController|undefined,disposed=false
async function refresh(){
  if(refreshing.value||disposed)return
  refreshing.value=true;controller=new AbortController()
  const timeout=setTimeout(()=>controller?.abort(),8000)
  try{const next=await api<ItemDefinition[]>('/api/catalog/items',{cache:'no-store',signal:controller.signal});if(!disposed){items.value=next;loaded.value=true;error.value=''}}
  catch{if(!disposed)error.value='藏宝阁同步失败，保留当前目录，正在重试。'}
  finally{clearTimeout(timeout);refreshing.value=false}
}
function focus(){void refresh()}
onMounted(()=>{void refresh();timer=setInterval(()=>{if(!document.hidden)void refresh()},2000);window.addEventListener('focus',focus)})
onUnmounted(()=>{disposed=true;clearInterval(timer);controller?.abort();window.removeEventListener('focus',focus)})
</script>
<template><div class="bag-heading"><div><small>名器异宝 · 尽藏于此</small><h1>藏宝阁</h1></div><button :disabled="refreshing" @click="refresh">刷新目录</button></div>
  <p class="fineprint">装备与宝物混合陈列，按品质由高到低排列。角标为持有总数，悬停查看属性、套装与穿戴数量，离开立即收起。</p>
  <div class="treasury-tools"><input v-model="filter.search" type="search" aria-label="搜索藏宝阁" placeholder="搜索名称或效果"><label><input v-model="filter.ownedOnly" type="checkbox">仅看已拥有</label><small>{{entries.length}} 件珍藏 · 后台资料自动同步</small></div>
  <div class="detail-tabs quality-filters" role="group" aria-label="品质筛选"><button :class="{active:filter.quality===0}" :aria-pressed="filter.quality===0" @click="filter.quality=0">全部品质</button><button v-for="n in 7" :key="n" :class="['quality-'+(8-n),{active:filter.quality===8-n}]" :aria-pressed="filter.quality===8-n" @click="filter.quality=8-n">{{qualityLabels[8-n]}}</button></div>
  <p v-if="error" role="status" class="toast error">{{error}}</p>
  <p v-if="!loaded&&refreshing" class="fineprint">正在打开藏宝阁…</p>
  <IconInventoryPicker v-model="selected" :options="entries" :preview="false" label="装备与宝物" empty-text="暂无符合条件的珍藏。"/>
</template>
<style scoped>.treasury-tools{display:flex;align-items:center;flex-wrap:wrap;gap:18px;margin:22px 0}.treasury-tools>input{min-width:220px;flex:1}.treasury-tools label{display:flex;flex:none;align-items:center;gap:8px;color:#c9bd97;white-space:nowrap}.treasury-tools label input{width:auto;margin:0}.treasury-tools small{color:#94886a}.quality-filters{flex-wrap:wrap}.quality-filters button{color:var(--quality,#d6c092)}.quality-filters button.active{border-color:var(--quality,#bb9751)}</style>
