<script setup lang="ts">
import {computed,reactive} from 'vue'
import type {Wallet} from '../shared/contracts'
import {durationText,type MilitaryState,type MilitaryKind,type MilitaryDefinition} from '../shared/military'
import {currencyLabels} from '../shared/labels'
import UnitBadge from './UnitBadge.vue'
const props=defineProps<{state:MilitaryState;kind:MilitaryKind;wallet:Wallet;gameTime:number;busy:boolean}>()
const emit=defineEmits<{order:[code:string,quantity:number]}>(),quantities=reactive<Record<string,number>>({})
const definitions=computed(()=>props.state.definitions.filter(d=>d.kind===props.kind&&(d.enabled||props.state.stock[d.code]>0)))
const orders=computed(()=>props.state.orders.filter(o=>o.kind===props.kind))
const verb=computed(()=>props.kind==='TROOP'?'招募':'建造')
const quantity=(code:string)=>quantities[code]??1
const maxAffordable=(d:MilitaryDefinition)=>Math.min(100000,...Object.entries(d.cost).filter(([,n])=>n!>0).map(([k,n])=>Math.floor((props.wallet[k as keyof Wallet]??0)/n!)))
const valid=(d:MilitaryDefinition)=>Number.isSafeInteger(quantity(d.code))&&quantity(d.code)>0&&quantity(d.code)<=maxAffordable(d)
function waiting(start:string){return new Date(start).getTime()>props.gameTime}
</script>
<template>
 <div class="section-title"><div><small>{{kind==='TROOP'?'军营满级 · 科技全满':'城内建筑满级 · 城防逐座营造'}}</small><h1>{{kind==='TROOP'?'军营点兵':'城防营造'}}</h1></div><p>关闭浏览器后继续生产 · 按游戏时间结算</p></div>
 <p v-if="!state.ready" class="error">兵种数据库尚未更新，请先运行 npm run db:update:military。</p>
 <template v-else>
 <div v-if="kind==='DEFENSE'" class="military-summary"><span>驻城总近防 <b>{{state.defense.melee.toLocaleString()}}</b></span><span>驻城总远防 <b>{{state.defense.ranged.toLocaleString()}}</b></span><small>城内士兵与已建城防合计，含满科技；不含英雄与技能。出征部队不计入驻城防御。</small></div>
 <div class="production-queue"><h3>{{verb}}队列 <small>{{orders.length}} / 50</small></h3><p v-if="!orders.length" class="fineprint">队列空闲，选择下方{{kind==='TROOP'?'兵种':'城防'}}安排{{verb}}。</p><article v-for="o in orders" :key="o.id"><div><b>{{o.name}} × {{o.quantity.toLocaleString()}}</b><span>{{waiting(o.startGameAt)?'排队中':'生产中'}} · 已完成 {{o.completed}} / {{o.quantity}}</span></div><progress :value="o.completed" :max="o.quantity" :aria-label="o.name+'生产进度'"></progress><small>{{waiting(o.startGameAt)?'等待 '+durationText((new Date(o.startGameAt).getTime()-gameTime)/1000)+' 后开始':'下一单位 '+durationText(Math.max(0,(new Date(o.startGameAt).getTime()+(o.completed+1)*o.seconds*1000-gameTime)/1000))}} · 全部完成还需 {{durationText((new Date(o.endGameAt).getTime()-gameTime)/1000)}}</small></article><p class="fineprint">同类订单依次生产，士兵逐个入营、城防逐座生效；招募与城防两条队列独立并行。</p></div>
 <div class="military-grid"><article v-for="d in definitions" :key="d.code" class="military-card"><header><UnitBadge :code="d.code" :name="d.name"/><div><small>{{d.role}}</small><h2>{{d.name}}</h2><b class="unit-stock">{{kind==='TROOP'?'城内可用':'已建成'}} {{(state.stock[d.code]??0).toLocaleString()}}</b></div></header><p>{{d.description}}</p><dl class="unit-stats"><template v-if="kind==='TROOP'"><div><dt>近攻</dt><dd>{{d.meleeAttack.toLocaleString()}}</dd></div><div><dt>远攻</dt><dd>{{d.rangedAttack.toLocaleString()}}</dd></div></template><div><dt>近防</dt><dd>{{d.meleeDefense.toLocaleString()}}</dd></div><div><dt>远防</dt><dd>{{d.rangedDefense.toLocaleString()}}</dd></div><template v-if="kind==='TROOP'"><div><dt>速度</dt><dd>{{d.speed.toLocaleString()}}</dd></div><div><dt>负重</dt><dd>{{d.loadCapacity.toLocaleString()}}</dd></div></template></dl><small class="fineprint">单单位基础属性 · 近远攻防享受满科技加成</small><div class="unit-price"><span v-for="(cost,key) in d.cost" v-show="cost" :key="key" :class="{gold:key==='gold'}">{{currencyLabels[key]}} {{cost?.toLocaleString()}}</span><strong v-if="d.kind==='TROOP'">每个耗粮 {{d.foodPerHour??0}} / 游戏小时</strong><strong>单个耗时 {{durationText(d.seconds)}}</strong></div><div class="recruit-row"><label>数量<input :value="quantity(d.code)" type="number" min="1" max="100000" :aria-label="d.name+verb+'数量'" @input="quantities[d.code]=Number(($event.target as HTMLInputElement).value)"></label><button type="button" :disabled="busy||!d.enabled||maxAffordable(d)<1" @click="quantities[d.code]=Math.min(100,Math.max(1,maxAffordable(d)))">最多100</button><button class="primary" :disabled="busy||!d.enabled||!valid(d)||orders.length>=50" @click="emit('order',d.code,quantity(d.code))">{{!d.enabled?'已停用':valid(d)?verb:'资源不足或数量无效'}}</button></div><small>本批耗时 {{durationText(d.seconds*Math.max(0,quantity(d.code)))}}<template v-if="(d.cost.gold??0)>0"> · 共 {{((d.cost.gold??0)*Math.max(0,quantity(d.code))).toLocaleString()}} 金币</template></small></article></div>
 </template>
</template>
