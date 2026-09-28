<script setup lang="ts">
import {computed,ref,watch} from 'vue'
import {activeDialog,finishDialog,noticeRequest} from './game-dialog'
import {useTimedNotice} from './timed-notice'
import GameModal from './GameModal.vue'
const value=ref(''),error=computed(()=>activeDialog.value?.validate?.(value.value.trim())??''),notice=useTimedNotice()
watch(noticeRequest,request=>{if(request)notice.value=request.text})
watch(()=>activeDialog.value?.id,()=>{value.value=activeDialog.value?.initial??''},{immediate:true})
function close(){if(activeDialog.value)finishDialog(activeDialog.value.id,null)}
function accept(){if(activeDialog.value&&!error.value)finishDialog(activeDialog.value.id,value.value)}
</script>
<template><GameModal v-if="activeDialog" :key="activeDialog.id" :title="activeDialog.title" @close="close"><p class="war-message">{{activeDialog.message}}</p><label class="war-input-label">{{activeDialog.placeholder??'请输入'}}<input v-model="value" data-initial-focus :aria-label="activeDialog.placeholder??'请输入'" :maxlength="activeDialog.maxLength??32" @keydown.enter.prevent="accept"><small v-if="error">{{error}}</small></label><template #footer><button type="button" @click="close">取消</button><button type="button" class="war-primary" :disabled="Boolean(error)" @click="accept">{{activeDialog.submitText??'提交'}}</button></template></GameModal><Teleport to="body"><p v-if="notice" class="game-notice" role="status">{{notice}}</p></Teleport></template>
<style scoped>.game-notice{position:fixed;z-index:1500;top:24px;left:50%;transform:translateX(-50%);max-width:min(520px,90vw);margin:0;padding:12px 24px;border:1px solid #aa8548;background:#282819;color:#ebcd8a;box-shadow:0 6px 25px #0009;white-space:pre-line;pointer-events:none}</style>
