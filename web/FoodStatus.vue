<script setup lang="ts">
import type {UpkeepState} from '../shared/upkeep'
import {durationText} from '../shared/military'
defineProps<{upkeep?:UpkeepState}>()
</script>
<template><div v-if="upkeep" class="food-status" :class="{shortage:upkeep.shortage}" role="status"><b>{{upkeep.shortage?'军粮告急':'军粮供给'}}</b><span>全军耗粮 {{upkeep.hourly.toLocaleString()}} / 游戏小时</span><span v-if="upkeep.hourly>0&&!upkeep.shortage">现粮约可维持 {{durationText(upkeep.food/upkeep.hourly*3600)}}</span><small>{{upkeep.shortage?'粮食已耗尽，仅作提醒，不损兵、不停止行军、不产生欠账。':'驻城、在途与自动编队均计入；缺粮不损兵。'}}</small></div></template>
<style scoped>.food-status{display:flex;gap:12px 24px;flex-wrap:wrap;align-items:center;padding:12px 24px;margin:14px auto 0;max-width:1256px;background:#17241d;border:1px solid #4b5b3b;color:#b6c295;font:12px system-ui}.food-status b{color:#dec58d}.food-status small{color:#99a58b}.food-status.shortage{background:#39251a;border-color:#9b633c;color:#ecc993}.food-status.shortage b{color:#ffbc76}.food-status.shortage small{color:#d9af8d}</style>
