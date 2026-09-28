<script setup lang="ts">
import {computed} from 'vue'
const props=defineProps<{code:string;name:string}>()
const glyphs:Record<string,string>={supply:'粮',cart:'辎',spear_guard:'盾',crossbow_guard:'弩',pikeman:'枪',archer:'弓',lance_cavalry:'骑',mounted_archer:'射',heavy_general:'甲',elite_cavalry:'骁',wall:'垣',trap:'阱',tower:'塔',advanced_trap:'阱',advanced_tower:'塔',fire_box:'焰'}
const tone=computed(()=>props.code==='elite_cavalry'?'elite':props.code==='fire_box'?'fire':props.code.includes('guard')||props.code==='heavy_general'?'guard':props.code.includes('archer')||props.code.includes('tower')?'ranged':'')
</script>
<template><span class="unit-badge" :class="tone" aria-hidden="true"><i></i><b>{{glyphs[code]??name.slice(0,1)}}</b><i></i></span></template>
<style scoped>
.unit-badge{width:58px;height:66px;display:inline-flex;align-items:center;justify-content:center;gap:3px;flex-shrink:0;position:relative;border:1px solid #9f8150;border-radius:5px 5px 17px 17px;background:radial-gradient(ellipse at top,#6d5934,#24251d 75%);box-shadow:inset 0 0 0 3px #201d15,inset 0 0 18px #060a07,0 3px 6px #0008;color:#efd5a3;text-shadow:0 2px 2px #000}.unit-badge b{font-size:29px;font-family:serif;z-index:1}.unit-badge i{height:42px;width:1px;background:#ccb17b66;transform:rotate(20deg)}.unit-badge i:last-child{transform:rotate(-20deg)}.guard{background:radial-gradient(ellipse at top,#516557,#172a24 75%)}.ranged{background:radial-gradient(ellipse at top,#4c606e,#17222d 75%)}.elite{border-color:#df995b;background:radial-gradient(ellipse at top,#995130,#35211b 75%);box-shadow:inset 0 0 0 3px #26130b,0 0 10px #b6762233}.fire{background:radial-gradient(ellipse at top,#a74729,#34130d 75%)}
</style>
