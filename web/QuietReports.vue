<script setup lang="ts">
import {computed,nextTick,ref,watch} from 'vue'
import type {WorldStatus,IncomingReportPage} from '../shared/contracts'
import {label,statusLabels,currencyLabels} from '../shared/labels'
import {api} from './api'
import {useTimedNotice} from './timed-notice'

const props=defineProps<{reports:WorldStatus['reports'];incoming?:IncomingReportPage;busy:boolean}>(),emit=defineEmits<{clear:[]}>()
const view=ref<'OUTGOING'|'INCOMING'>('OUTGOING'),lootOnly=ref(true),older=ref<WorldStatus['reports']>([]),cursor=ref<number|null|undefined>(),loading=ref(false),error=useTimedNotice(),list=ref<HTMLElement>()
const visible=computed(()=>view.value==='OUTGOING'?(lootOnly.value?props.reports.filter(r=>r.loot?.some(item=>item.quantity>0)):props.reports):[...new Map([...(props.incoming?.reports??[]),...older.value].map(r=>[r.id,r])).values()].sort((a,b)=>b.id-a.id))
const nextCursor=computed(()=>cursor.value===undefined?props.incoming?.nextCursor:cursor.value)
async function more(){if(loading.value||!nextCursor.value)return;loading.value=true;error.value='';try{const page=await api<IncomingReportPage>('/api/world/reports/incoming?beforeId='+nextCursor.value);older.value.push(...page.reports);cursor.value=page.nextCursor}catch(e){error.value=e instanceof Error?e.message:'读取失败'}finally{loading.value=false}}
const clearing=ref(false)
watch(()=>props.busy,value=>{if(!value)clearing.value=false})
function clear(){if(props.busy||clearing.value||!props.reports.length)return;clearing.value=true;emit('clear')}
watch([view,lootOnly],()=>{if(list.value)list.value.scrollTop=0},{flush:'sync'})
watch(visible,async()=>{
  const el=list.value;if(!el||el.scrollTop<8)return
  const top=el.getBoundingClientRect().top,anchor=[...el.querySelectorAll<HTMLElement>('[data-report-id]')].find(x=>x.getBoundingClientRect().bottom>top)
  if(!anchor)return
  const id=anchor.dataset.reportId,offset=anchor.getBoundingClientRect().top
  await nextTick()
  const retained=el.querySelector<HTMLElement>('[data-report-id="'+id+'"]')
  if(retained)el.scrollTop+=retained.getBoundingClientRect().top-offset
},{flush:'pre'})
</script>
<template>
  <div class="report-toolbar"><h3>战报</h3><button :disabled="busy||clearing||!reports.length" data-game-hint="直接清空全部主动出征战报（包括隐藏记录）；被攻击战报保留。" @click="clear">清空出征战报</button></div>
  <div class="detail-tabs"><button :class="{active:view==='OUTGOING'}" @click="view='OUTGOING'">主动出征 · {{reports.length}} / 50</button><button :class="{active:view==='INCOMING'}" @click="view='INCOMING'">被攻击 · {{incoming?.total??0}}</button></div>
  <div v-if="view==='OUTGOING'" class="report-filters" role="group" aria-label="战报筛选"><span>筛选</span><button type="button" :class="{active:lootOnly}" :aria-pressed="lootOnly" @click="lootOnly=true">有物品掉落</button><button type="button" :class="{active:!lootOnly}" :aria-pressed="!lootOnly" @click="lootOnly=false">全部战报</button><small>显示 {{visible.length}} / {{reports.length}} 条</small></div>
  <p class="fineprint">{{view==='INCOMING'?'被攻击记录永久保留。':'实时更新，主动出征战报只保留最新50条。'}}</p>
  <div ref="list" class="reports-list">
    <p v-if="!visible.length" class="report-empty">{{view==='INCOMING'?'暂无被攻击记录':lootOnly&&reports.length?'暂无物品掉落战报，可切换“全部战报”查看其他记录。':'暂无出征战报'}}</p>
    <details v-for="r in visible" :key="r.id" :data-report-id="r.id" class="battle-report">
      <summary :class="r.result.toLowerCase()">{{r.title}} · {{label(statusLabels,r.result)}}</summary>
      <small>{{new Date(r.occurredGameAt).toLocaleString()}}</small>
      <p v-if="r.basePower!=null">基础攻击 {{r.basePower}} → 技能后 {{r.finalPower}} · 敌军有效防御 {{r.enemyPower}}</p>
      <p v-if="r.meleeAttack!=null">我军近攻 {{r.meleeAttack.toLocaleString()}} · 远攻 {{r.rangedAttack?.toLocaleString()}}<br>敌军近防 {{r.meleeDefense?.toLocaleString()}} · 远防 {{r.rangedDefense?.toLocaleString()}}</p>
      <table v-if="r.troopLosses?.length" class="casualty-table"><caption>随军兵力</caption><thead><tr><th>兵种</th><th>派出</th><th>阵亡</th><th>幸存返城</th></tr></thead><tbody><tr v-for="t in r.troopLosses" :key="t.code"><th>{{t.name}}</th><td>{{t.sent}}</td><td>{{t.lost}}</td><td>{{t.remaining}}</td></tr></tbody></table>
      <p v-if="r.targetLevelBefore!=null">目标 {{r.targetLevelBefore}} 级 → {{r.targetLevelAfter===0?'已消失':r.targetLevelAfter+'级'}}</p>
      <p v-for="(e,i) in r.skillEvents" :key="i" :class="{triggered:e.triggered}">{{e.triggered?'✦':'·'}} {{e.message}}</p>
      <p v-if="!r.skillEvents.length">本场无技能发动</p>
      <p><span v-for="(amount,key) in r.reward" :key="key">{{label(currencyLabels,key)}} +{{amount}}　</span></p>
      <p v-for="loot in r.loot" :key="loot.itemId" class="triggered">获得 {{loot.name}} ×{{loot.quantity}}</p>
    </details>
    <button v-if="view==='INCOMING'&&nextCursor" :disabled="loading" @click="more">{{loading?'读取中…':'更早的被攻击记录'}}</button>
    <p v-if="error" class="error">{{error}}</p>
  </div>
</template>
<style scoped>
.report-filters{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:12px 0;padding:10px 12px;border:1px solid #514c33;background:linear-gradient(120deg,#252b1d,#141b12);box-shadow:inset 0 0 0 2px #10170e;color:#b7aa7c;font-size:12px}
.shell .report-filters button{padding:6px 10px;min-height:30px;font-size:12px;background:#1b2116;border-color:#55563a;color:#b6b58f;box-shadow:none}
.shell .report-filters button.active{background:linear-gradient(#4c4729,#2d321f);border-color:#c1a753;color:#f6d981;box-shadow:inset 0 -2px #b59c46}
.report-filters small{margin-left:auto;color:#9ea383;font-size:11px}.report-empty{font-size:13px;color:#aaa17f;line-height:1.8}
</style>
