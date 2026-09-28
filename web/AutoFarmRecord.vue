<script setup lang="ts">
import type {WorldStatus} from '../shared/contracts'
import {durationText} from '../shared/military'
import {label,nodeLabels,statusLabels} from '../shared/labels'
defineProps<{job:WorldStatus['autoFarmJobs'][number];busy:boolean;gameTime:number}>()
defineEmits<{pause:[number]}>()
</script>
<template>
  <p>
    {{job.heroName}} → {{job.targetName??label(nodeLabels,job.nodeType)}} · {{label(statusLabels,job.status)}}
    <template v-if="job.completedRuns!=null"> · 已往返 {{job.completedRuns}}{{job.totalRuns!=null?' / '+job.totalRuns:''}} 次</template>
    <template v-else> · 余 {{job.runsRemaining??'∞'}} 次</template>
    <button v-if="job.status==='ACTIVE'" :disabled="busy" @click="$emit('pause',job.id)">暂停</button>
    <small v-if="job.phase==='MARCHING'||job.phase==='RETURNING'">
      {{label(statusLabels,job.phase)}} · 本轮往返 {{durationText(job.roundTripSeconds??0)}} ·
      {{gameTime>=Date.parse(job.nextRunGameAt)?'返城结算中':durationText(Math.ceil((Date.parse(job.nextRunGameAt)-gameTime)/1000))+' 后返城'}}
    </small>
    <small v-else-if="job.status==='ACTIVE'">准备出发 · 每次返城完成一轮</small>
    <small v-if="job.lastError">{{job.lastError}}</small>
  </p>
</template>
