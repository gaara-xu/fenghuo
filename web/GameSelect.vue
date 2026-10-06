<script setup lang="ts" generic="T extends string|number|null|undefined">
import {computed,nextTick,ref,useId,watch} from 'vue'
import AssetIcon from './AssetIcon.vue'
import {itemArt} from './art'
const props=defineProps<{modelValue?:T;label:string;placeholder?:string;disabled?:boolean;options:Array<{id:T;label:string;detail?:string;iconKey?:string|null;imageUrl?:string;quality?:number;hero?:boolean}>}>()
const emit=defineEmits<{'update:modelValue':[T]}>()
const open=ref(false),search=ref(''),trigger=ref<HTMLButtonElement>(),panel=ref<HTMLElement>(),id=useId()
const current=computed(()=>props.options.find(o=>o.id===props.modelValue))
const filtered=computed(()=>props.options.filter(o=>(o.label+' '+(o.detail??'')).toLowerCase().includes(search.value.trim().toLowerCase())))
async function show(){if(props.disabled||!props.options.length)return;search.value='';open.value=true;await nextTick();(panel.value?.querySelector<HTMLElement>('input')??panel.value?.querySelector<HTMLElement>('[aria-pressed="true"]')??panel.value?.querySelector<HTMLElement>('.choice-tile')??panel.value?.querySelector<HTMLElement>('.choice-close'))?.focus()}
async function close(){open.value=false;await nextTick();trigger.value?.focus()}
function choose(value:T){if(props.disabled)return;emit('update:modelValue',value);void close()}
function keys(e:KeyboardEvent){
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();void close()}
  if(e.key==='Tab'){
    const controls=Array.from(panel.value?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)')??[]),first=controls[0],last=controls.at(-1)
    if(e.shiftKey&&e.target===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&e.target===last){e.preventDefault();first?.focus()}
  }
}
watch(()=>props.disabled,value=>{if(value)open.value=false})
</script>
<template>
  <div class="game-select game-choice">
    <button ref="trigger" type="button" class="choice-trigger" :aria-label="label+'：'+(current?.label??placeholder??'请选择')" aria-haspopup="dialog" :aria-expanded="open" :aria-controls="open?id:undefined" :disabled="disabled||!options.length" @click="show"><span>{{current?.label??(options.length?placeholder??'请选择':'暂无选项')}}</span><small aria-hidden="true">选择</small></button>
  </div>
  <Teleport to="body"><div v-if="open" class="choice-shade" @click.self="close" @keydown="keys">
    <section :id="id" ref="panel" class="choice-panel" role="dialog" aria-modal="true" :aria-labelledby="id+'-title'">
      <header><div><small>烽火战国 · 选择面板</small><h2 :id="id+'-title'">{{label}}</h2></div><button type="button" class="choice-close" @click="close" :aria-label="'关闭'+label+'选择'">关闭</button></header>
      <div v-if="options.length>8" class="choice-search"><input v-model="search" type="search" :aria-label="'搜索'+label" placeholder="输入名称查找…" @keydown.enter.prevent><span>{{filtered.length}} 项</span></div>
      <div class="choice-grid" :aria-label="label+'选项'">
        <button v-for="(o,index) in filtered" :key="String(o.id)+'-'+index" type="button" class="choice-tile" :class="['quality-'+(o.quality??0),{selected:o.id===modelValue}]" :aria-pressed="o.id===modelValue" @click="choose(o.id)">
          <AssetIcon v-if="o.iconKey||o.imageUrl||itemArt(o.label)" :name="o.label" :hero="o.hero" :icon-key="o.iconKey" :image-url="o.imageUrl" :quality="o.quality" size="tiny"/>
          <span v-else class="choice-seal" aria-hidden="true">{{o.label.slice(0,1)}}</span><span class="choice-copy">{{o.label}}<small v-if="o.detail">{{o.detail}}</small></span><b v-if="o.id===modelValue" aria-hidden="true">✓</b>
        </button><p v-if="!filtered.length" class="choice-empty">没有匹配的选项</p>
      </div><footer>点击选用 · Esc 返回</footer>
    </section>
  </div></Teleport>
</template>
<style scoped>
.game-choice{min-width:0;width:100%;margin-top:5px}.game-choice .choice-trigger{min-height:40px;border:1px solid #7e8055;border-radius:3px;color:#e0d3ae;font-family:inherit;font-size:13px;cursor:pointer}.choice-trigger>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.choice-trigger>small{flex:none;color:#c5ab62;border-left:1px solid #777444;padding-left:10px;font-size:11px}.choice-trigger:disabled{opacity:.5;cursor:default}.choice-shade{position:fixed;inset:0;z-index:180;display:grid;place-items:center;padding:20px;background:#060b08c9;backdrop-filter:blur(3px)}.choice-panel{display:flex;flex-direction:column;width:min(740px,100%);max-height:calc(100dvh - 40px);border:1px solid #bc9e55;border-radius:7px;background:linear-gradient(135deg,#2b3022,#121a14 70%);color:#e5d6ad;box-shadow:0 20px 80px #000,inset 0 0 0 4px #060c0870;font-family:inherit;overflow:hidden}.choice-panel header{display:flex;align-items:center;justify-content:space-between;padding:20px 24px;border-bottom:1px solid #665832;background:linear-gradient(#44442b70,#242918)}.choice-panel header small{font-size:11px;letter-spacing:2px;color:#b2a273}.choice-panel h2{font-size:22px;letter-spacing:3px;font-weight:normal;margin:8px 0 0;color:#f0d184}.choice-panel button{font:inherit;cursor:pointer}.choice-close{padding:7px 16px;border:1px solid #8c713d;border-radius:3px;background:#211f14;color:#ddc892;font-size:12px!important}.choice-search{display:flex;align-items:center;gap:16px;padding:15px 24px 0}.choice-search input{margin:0;padding:10px 12px;background:#101910;border:1px solid #635c37;color:#eddfb4;border-radius:3px;font-size:13px;min-width:0}.choice-search span{white-space:nowrap;font-size:12px;color:#b5a87b}.choice-grid{min-height:100px;overflow:auto;overscroll-behavior:contain;display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px;padding:20px 24px;scrollbar-color:#6f6740 #111a12}.choice-tile{display:flex;align-items:center;gap:12px;min-width:0;min-height:66px;padding:12px;border:1px solid var(--quality,#545f3d);border-radius:3px;color:var(--quality,#e0d3ac);text-align:left;background:linear-gradient(130deg,#303827,#1a2319);box-shadow:inset 0 1px #aaa75d1f}.choice-copy{flex:1;font-size:13px;overflow-wrap:anywhere}.choice-copy small{display:block;color:#b5ad90;font-size:11px;line-height:1.6;margin-top:5px}.choice-seal{display:grid;place-items:center;width:32px;height:32px;flex:none;background:#11180e;border:1px solid var(--quality,#666f42);color:var(--quality,#c0b278);font-size:18px}.choice-tile:hover,.choice-tile:focus-visible{background:linear-gradient(135deg,#514d2b,#2e3622);outline:2px solid #d8bc63;outline-offset:1px}.choice-tile.selected{border-color:#e4c96b;background:linear-gradient(125deg,#4b4723,#2b341e);box-shadow:inset 3px 0 #d8bb5a}.choice-tile b{color:#eed474}.choice-panel footer{padding:12px;text-align:center;border-top:1px solid #454b2f;color:#a99c70;font-size:11px}.choice-empty{color:#b6a879;grid-column:1/-1;text-align:center}
</style>
