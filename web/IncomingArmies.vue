<script setup lang="ts">
import {raidCountdown,type IncomingRaid} from '../shared/incoming-raids'
import {label,attackLabels} from '../shared/labels'
defineProps<{armies:IncomingRaid[];gameTime:number}>()
</script>
<template><section v-if="armies.length" class="incoming-armies" aria-label="来袭军情"><b>⚑ 敌军来袭 · {{armies.length}} 支</b><div v-for="army in armies" :key="army.id"><span>{{army.name}} · {{label(attackLabels,army.attackType)}} · 攻击 {{army.attackPower.toLocaleString()}} · {{army.troopCount.toLocaleString()}} 人</span><strong>{{raidCountdown(army.arriveGameAt,gameTime)}}</strong><small>抵达 {{new Date(army.arriveGameAt).toLocaleTimeString()}}（游戏时间）</small></div></section></template>
<style scoped>.incoming-armies{margin:12px 0;padding:12px 18px;border:1px solid #ac623f;background:linear-gradient(100deg,#361f19,#20251b);box-shadow:inset 0 0 0 2px #171811;color:#e8be87}.incoming-armies>b{color:#ffcc81}.incoming-armies>div{display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding-top:8px;font-size:13px}.incoming-armies strong{color:#ffc18e}.incoming-armies small{color:#b4a384;margin-left:auto}</style>
