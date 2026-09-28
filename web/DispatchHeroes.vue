<script setup lang="ts">
import type {OwnedHero} from '../shared/contracts'
import AssetIcon from './AssetIcon.vue'
defineProps<{heroes:OwnedHero[];selected:number;busy:boolean}>()
const emit=defineEmits<{select:[id:number]}>()
</script>
<template><div class="dispatch-picker"><h4>出征英雄 <small>{{heroes.length}} / 6</small></h4><div class="dispatch-row" role="group" aria-label="选择出征英雄"><button type="button" class="dispatch-hero" :class="{selected:selected===0}" :aria-pressed="selected===0" :disabled="busy" @click="emit('select',0)"><span class="troops-only-flag" aria-hidden="true">⚑</span><b>仅派士兵</b><small>不选英雄</small><span v-if="selected===0" class="dispatch-check" aria-hidden="true">✓</span></button><button v-for="h in heroes" :key="h.id" type="button" class="dispatch-hero" :class="{selected:selected===h.id}" :aria-pressed="selected===h.id" :disabled="busy||h.busy" @click="emit('select',h.id)"><AssetIcon :name="h.name" :icon-key="h.portraitKey" hero :rarity="h.star" :quality="h.qualityTier"/><b>{{h.name}}</b><small>{{h.busy?'执行任务中':h.level+'级 · 战力 '+h.power.toLocaleString()}}</small><span v-if="selected===h.id" class="dispatch-check" aria-hidden="true">✓</span></button></div></div></template>
