<script setup lang="ts">
import {computed} from 'vue'
import {armyStats,stackFromDefinition,durationText,type MilitaryState,type ArmyStack} from '../shared/military'
import type {OwnedHero,MapNode} from '../shared/contracts'
import {travelSeconds} from '../server/domain/travel'
import {marchRoute,routeDistance} from '../shared/map-routes'
import UnitBadge from './UnitBadge.vue'
const props=defineProps<{state:MilitaryState;selection:Record<string,number>;hero?:OwnedHero;node:MapNode;busy:boolean}>()
const emit=defineEmits<{'update:selection':[Record<string,number>]}>()
const troops=computed(()=>props.state.definitions.filter(d=>d.kind==='TROOP'&&d.enabled))
const stats=computed(()=>{const army:ArmyStack[]=troops.value.map(d=>stackFromDefinition(d,props.selection[d.code]??0));if(props.hero)army.push({code:'hero',name:props.hero.name,kind:'HERO',quantity:1,stats:props.hero.stats});return armyStats(army)})
const travel=computed(()=>stats.value.speed?Math.ceil(travelSeconds(routeDistance(marchRoute(props.node)),stats.value.speed)):0)
const roundTrip=computed(()=>travel.value?durationText(travel.value*2):'未选择部队')
function set(code:string,n:number){emit('update:selection',{...props.selection,[code]:Math.max(0,Math.min(props.state.stock[code]??0,1000000,Math.floor(n)||0))})}
</script>
<template><div class="dispatch-troops"><div class="report-toolbar"><h4>随军兵力</h4><button type="button" :disabled="busy" @click="emit('update:selection',{})">清空兵力</button></div><div class="troop-pick-grid"><label v-for="d in troops" :key="d.code" :class="['troop-pick',{selected:(selection[d.code]??0)>0,empty:!state.stock[d.code]}]"><UnitBadge :code="d.code" :name="d.name"/><div><b>{{d.name}}</b><small>可用 {{(state.stock[d.code]??0).toLocaleString()}} · 速度 {{d.speed}}</small><div><input type="number" min="0" :max="Math.min(1000000,state.stock[d.code]??0)" :value="selection[d.code]??0" :disabled="busy||!state.stock[d.code]" :aria-label="d.name+'出征数量'" @input="set(d.code,Number(($event.target as HTMLInputElement).value))"><button type="button" :disabled="busy||!state.stock[d.code]" @click="set(d.code,state.stock[d.code]??0)">全选</button></div></div></label></div><div class="military-summary"><span>近攻 <b>{{(stats.meleeAttack*2).toLocaleString()}}</b></span><span>远攻 <b>{{(stats.rangedAttack*2).toLocaleString()}}</b></span><span>负重 <b>{{stats.loadCapacity.toLocaleString()}}</b></span><span>行军速度 <b>{{stats.speed}}</b></span><span>单程 <b>{{travel?durationText(travel):'未选择部队'}}</b></span><span>往返一轮 <b>{{roundTrip}}</b></span><small>近远攻已含满科技，未计随机技能。混编按最慢单位行军；自动出征每次返城才计一轮，并按幸存编队重新计算下一轮耗时。</small></div></div></template>
