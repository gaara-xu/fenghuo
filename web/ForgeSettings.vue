<script setup lang="ts">
import {onMounted,ref} from 'vue'
import {defaultForgeRules,type ForgeRules} from '../shared/forge'
import {api} from './api'
import {useTimedNotice} from './timed-notice'
const rules=ref<ForgeRules>(structuredClone(defaultForgeRules)),busy=ref(false),message=useTimedNotice(),ready=ref(false)
onMounted(async()=>{try{rules.value=await api('/api/admin/forge-rules');ready.value=true}catch(e){message.value=String(e)}})
async function save(){busy.value=true;try{await api('/api/admin/forge-rules',{method:'PUT',body:JSON.stringify({...rules.value,sourceStatus:'DIY'})});message.value='工坊规则已保存'}catch(e){message.value=String(e)}finally{busy.value=false}}
</script>
<template><form class="hero-detail-pane" @submit.prevent="save"><h3>精炼与打孔规则</h3><p class="fineprint">官网确认精炼失败可能降级、装备最多三孔；原始概率表未取得，下列为可调整的单机配置，不是官方概率。所有概率填写 0—1。</p><div class="fields"><label v-for="(_,i) in rules.refineRates" :key="i">+{{i}} → +{{i+1}} 成功率<input v-model.number="rules.refineRates[i]" type="number" min="0" max="1" step="0.01" required></label><label>精炼神石额外成功率<input v-model.number="rules.divineBonus" type="number" min="0" max="1" step="0.01" required></label><label>失败后降一级的概率<input v-model.number="rules.downgradeChance" type="number" min="0" max="1" step="0.01" required></label><label v-for="(_,i) in rules.drillRates" :key="'hole'+i">第 {{i+1}} 孔成功率<input v-model.number="rules.drillRates[i]" type="number" min="0" max="1" step="0.01" required></label><label>每次打孔耗天工神石<input v-model.number="rules.drillCost" type="number" min="1" max="100" required></label></div><button class="primary" :disabled="busy||!ready">保存工坊规则</button><p>{{message}}</p></form></template>
