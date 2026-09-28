<script setup lang="ts">
import {computed} from 'vue'
import {artUrl,iconNames,portraitNames,portraitStyle,itemArt} from './art'
import {qualityTier,qualityLabels} from '../shared/quality'
const props=withDefaults(defineProps<{name:string;iconKey?:string|null;imageUrl?:string;hero?:boolean;rarity?:number;quality?:number;size?:'tiny'|'small'|'large'}>(),{rarity:1,size:'small'})
const tier=computed(()=>qualityTier(props.rarity,props.quality))
const sprite=computed(()=>props.hero?portraitStyle(props.iconKey):null)
const src=computed(()=>itemArt(props.name,props.imageUrl)??(props.iconKey&&Object.hasOwn(props.hero?portraitNames:iconNames,props.iconKey)?artUrl(props.iconKey,!props.hero,props.size==='large'?'large':'small'):null))
</script>
<template><span class="asset-icon" :class="['quality-'+tier,'icon-'+size]" :aria-label="name+' · '+qualityLabels[tier]+'品质'"><span v-if="sprite" class="official-portrait" :style="sprite"/><img v-else-if="src" :src="src" :alt="name"><span v-else class="missing-art">{{name.slice(0,2)}}<small v-if="size!=='tiny'">待配图</small></span></span></template>
<style scoped>.official-portrait{display:block;width:100%;height:100%;background-repeat:no-repeat;flex:none}</style>
