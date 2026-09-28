<script setup lang="ts">
import {onMounted,ref} from 'vue'
import {api} from './api'
import {useTimedNotice} from './timed-notice'

const enabled=ref<boolean|null>(null),busy=ref(false),error=useTimedNotice(),loadFailed=ref(false)
async function load(){try{enabled.value=(await api<{enabled:boolean}>('/api/admin/tavern-recording')).enabled;error.value='';loadFailed.value=false}catch(e){loadFailed.value=true;error.value=e instanceof Error?e.message:'读取记录设置失败'}}
async function toggle(){
 if(busy.value||enabled.value===null)return
 busy.value=true;error.value=''
 try{
  const next=!enabled.value
  enabled.value=(await api<{enabled:boolean}>('/api/admin/tavern-recording',{method:'PUT',body:JSON.stringify({enabled:next})})).enabled
 }catch(e){error.value=e instanceof Error?e.message:'保存失败'}finally{busy.value=false}
}
onMounted(load)
</script>
<template><section class="tavern-recording"><div><small>聚贤馆 · 藏书阁 · 藏宝阁</small><h3>酒馆刷新记录 <span :class="{on:enabled}">{{enabled===null?(loadFailed?'未读取': '读取中'):enabled?'已开启':'已关闭'}}</span></h3><p>关闭时只保留内存中的当前候选，不写刷新记录或应用刷新日志。浏览器刷新不丢失，游戏服务重启后清空。余额与领取结果仍存档，旧表与历史不删除。</p></div><button type="button" class="primary" role="switch" :aria-checked="Boolean(enabled)" aria-label="酒馆刷新记录" :disabled="busy||enabled===null" @click="toggle">{{busy?'请稍候…':enabled?'关闭记录':'开启记录'}}</button><button v-if="loadFailed" type="button" :disabled="busy" @click="load">重新读取</button><p v-if="error" class="error" role="alert">{{error}}</p></section></template>
<style scoped>.tavern-recording{display:flex;flex-wrap:wrap;align-items:center;gap:18px;margin:14px 0 22px;padding:16px 20px;border:1px solid #786440;background:linear-gradient(120deg,#27291d,#171c15);box-shadow:inset 0 0 0 3px #10160e}.tavern-recording>div{flex:1;min-width:220px}.tavern-recording h3{margin:5px 0 8px;color:#dbbd71}.tavern-recording small,.tavern-recording p{color:#a99e7c}.tavern-recording p{margin:0;font-size:12px;line-height:1.8;max-width:850px}.tavern-recording h3 span{font-size:12px;margin-left:12px;color:#a9b699}.tavern-recording h3 span.on{color:#f1cc65}.tavern-recording>.error{flex-basis:100%;color:#e89070}</style>
