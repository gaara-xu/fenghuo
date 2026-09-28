<script setup lang="ts">
import {nextTick,onMounted,onUnmounted,ref,useId} from 'vue'
defineProps<{title:string;wide?:boolean}>()
const emit=defineEmits<{close:[]}>(),panel=ref<HTMLElement>(),id=useId()
let previous:HTMLElement|null=null
function keys(e:KeyboardEvent){if(e.key==='Escape'){e.preventDefault();e.stopPropagation();emit('close')}else if(e.key==='Tab'){const list=Array.from(panel.value?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]')??[]),first=list[0],last=list.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}}
onMounted(async()=>{previous=document.activeElement instanceof HTMLElement?document.activeElement:null;await nextTick();(panel.value?.querySelector<HTMLElement>('[data-initial-focus]')??panel.value?.querySelector<HTMLElement>('input,button'))?.focus()})
onUnmounted(()=>{if(previous?.isConnected)previous.focus()})
</script>
<template><Teleport to="body"><div class="war-modal-shade" @keydown="keys" @contextmenu.prevent><section ref="panel" class="war-modal" :class="{'war-modal-wide':wide}" role="dialog" aria-modal="true" :aria-labelledby="id"><header><span aria-hidden="true">◆</span><h2 :id="id">{{title}}</h2><button type="button" class="war-close" aria-label="关闭窗口" @click="emit('close')">×</button></header><div class="war-modal-body"><slot/></div><footer v-if="$slots.footer"><slot name="footer"/></footer></section></div></Teleport></template>
