<script setup lang="ts">
import {onMounted,ref,toRaw} from 'vue'
import type {MilitaryDefinition} from '../shared/military'
import {api} from './api'
import {useTimedNotice} from './timed-notice'
import {currencyLabels} from '../shared/labels'
import {statLabels} from '../shared/hero-growth'
import UnitBadge from './UnitBadge.vue'
const definitions=ref<MilitaryDefinition[]>([]),form=ref<MilitaryDefinition|null>(null),busy=ref(false),message=useTimedNotice(),error=useTimedNotice()
const currencies=['food','wood','stone','iron','gold'] as const
async function load(){definitions.value=await api<MilitaryDefinition[]>('/api/admin/military')}
function select(d:MilitaryDefinition){form.value=structuredClone(toRaw(d));message.value='';error.value=''}
async function save(){if(!form.value)return;busy.value=true;error.value='';try{await api('/api/admin/military/'+form.value.code,{method:'PUT',body:JSON.stringify(form.value)});await load();form.value=structuredClone(toRaw(definitions.value.find(d=>d.code===form.value!.code)!));message.value='已保存；前台目录与驻城属性同步更新。已付款队列保留原耗时，出征士兵保留出发时属性。'}catch(e){error.value=e instanceof Error?e.message:String(e)}finally{busy.value=false}}
onMounted(async()=>{try{await load()}catch(e){error.value=e instanceof Error?e.message:String(e)}})
</script>
<template><div class="section-title"><div><small>兵营 · 城防 · 时间与资源</small><h1>兵种与城防管理</h1></div></div><p class="error" v-if="error">{{error}}</p><p class="toast" v-if="message">{{message}}</p><div class="military-manager"><aside><button v-for="d in definitions" :key="d.code" :class="{active:form?.code===d.code}" @click="select(d)"><UnitBadge :code="d.code" :name="d.name"/><span>{{d.name}}<small>{{d.kind==='TROOP'?'兵种':'城防'}} · {{d.enabled?'启用':'停用'}}</small></span></button></aside><form v-if="form" class="military-editor" @submit.prevent="save"><h2>{{form.name}}</h2><div class="fields"><label>名称<input v-model="form.name" required maxlength="64"></label><label>定位<input v-model="form.role" required maxlength="64"></label><label v-for="(name,key) in statLabels" :key="key">{{name}}<input v-model.number="form[key]" type="number" :min="key==='speed'&&form.kind==='TROOP'?1:0" max="100000000" :disabled="form.kind==='DEFENSE'&&!['meleeDefense','rangedDefense'].includes(key)" required></label><label v-for="key in currencies" :key="key">每个消耗{{currencyLabels[key]}}<input v-model.number="form.cost[key]" type="number" min="0" max="100000000" required></label><label>每单位每游戏小时耗粮<input v-model.number="form.foodPerHour" type="number" min="0" max="1000000" :disabled="form.kind==='DEFENSE'" required></label><label>单个生产时间（游戏秒）<input v-model.number="form.seconds" type="number" min="1" max="86400" required></label><label><input type="checkbox" v-model="form.enabled">允许招募／建造</label></div><label>前台说明<textarea v-model="form.description" maxlength="2000"></textarea></label><label>考证与调整备注（仅后台）<textarea v-model="form.sourceNote" maxlength="4000"></textarea></label><p class="fineprint">属性为科技加成前的单单位数值。停用不会销毁现有士兵或取消已付款订单；已有出征照常返城。修改记录保存到管理审计日志。</p><button class="primary" :disabled="busy">{{busy?'保存中…':'保存配置'}}</button></form><p v-else>点击左侧兵种或城防开始编辑。</p></div></template>
