<script setup lang="ts">
import GameSelect from './GameSelect.vue'
import {labelOptions,qualityOptions} from './select-options'
import {computed,onMounted,onUnmounted,reactive,ref,watch} from 'vue'
import type {BootstrapPayload,HeroDefinition,SkillDefinition,WorldStatus} from '../shared/contracts'
import {api,actionId} from './api'
import {useTimedNotice} from './timed-notice'
import {label,attackLabels,sourceLabels,effectLabels,targetLabels,modeLabels} from '../shared/labels'
import {portraitNames,iconNames} from './art'
import {qualityLabels} from '../shared/quality'
import AssetIcon from './AssetIcon.vue'
import ItemManager from './ItemManager.vue'
import ScheduledTasks from './ScheduledTasks.vue'
import MilitaryManager from './MilitaryManager.vue'
import ResourceGrant from './ResourceGrant.vue'
import WorldBossSettings from './WorldBossSettings.vue'
import TavernRecording from './TavernRecording.vue'
import type {ItemDefinition} from '../shared/items'
import {itemTypes} from '../shared/items'
import {eligibleTreasureItem,currencyNames} from '../shared/tavern'
type Tab='controls'|'catalog'|'items'|'tasks'|'military'
const tabNames={controls:'城主控制台',catalog:'英雄与技能',items:'物品与培养',military:'兵种与城防',tasks:'定时任务接口'}
const initialTab=window.location.hash.slice(1)
const tab=ref<Tab>(initialTab in tabNames?initialTab as Tab:'controls')
const data=ref<BootstrapPayload|null>(null),world=ref<WorldStatus|null>(null),heroes=ref<HeroDefinition[]>([]),skills=ref<SkillDefinition[]>([]),entries=ref<any[]>([])
const items=ref<ItemDefinition[]>([]),eligibleItems=computed(()=>items.value.filter(eligibleTreasureItem))
const selectedEntryPool=computed(()=>data.value?.pools.find(p=>p.id===entryForm.poolId))
const poolSettings=reactive({refreshCost:0,candidateCount:3,selectLimit:1})
const busy=ref(false),error=useTimedNotice(),message=useTimedNotice()
const heroForm=reactive<any>({id:0,code:'',name:'',star:4,attackType:'BALANCED',meleeAttack:80,rangedAttack:80,meleeDefense:70,rangedDefense:70,speed:80,loadCapacity:100,staminaMax:100,enabled:true,sourceStatus:'DIY',description:''})
const skillForm=reactive<any>({id:0,code:'',name:'',rarity:4,effectType:'ATTACK_PERCENT',targetScope:'SELF',triggerRate:0.18,maxLevel:10,enabled:true,sourceStatus:'DIY',description:''})
const entryForm=reactive<any>({poolId:0,rewardType:'HERO',heroDefinitionId:0,skillDefinitionId:null,itemDefinitionId:null,weight:100,enabled:true})
watch(()=>entryForm.poolId,()=>{const p=selectedEntryPool.value;if(p){Object.assign(poolSettings,{refreshCost:p.refreshCost,candidateCount:p.candidateCount,selectLimit:p.selectLimit});if(p.poolType!=='MIXED')entryForm.rewardType=p.poolType==='ITEM'?'ITEM':p.poolType==='SKILL'?'SKILL_BOOK':'HERO'}})
heroForm.qualityTier=4
skillForm.qualityTier=4
heroForm.portraitKey='youxia'
skillForm.iconKey='xueyuan'
skillForm.effectConfig={base:10,perLevel:5,ratePerLevel:0.04,mode:'ATTACK'}
const heroFields:Record<string,string>={meleeAttack:'近攻',rangedAttack:'远攻',meleeDefense:'近防',rangedDefense:'远防',speed:'速度',loadCapacity:'负重',staminaMax:'体力上限'}
async function load(){const [b,w]=await Promise.all([api<BootstrapPayload>('/api/bootstrap'),api<WorldStatus>('/api/world/status')]);if(error.value==="后台连接中断，请检查服务")error.value='';data.value=b;world.value=w;entryForm.poolId ||= b.pools[0]?.id??0}
async function loadAdmin(){ [heroes.value,skills.value,entries.value,items.value]=await Promise.all([api<HeroDefinition[]>('/api/admin/heroes'),api<SkillDefinition[]>('/api/admin/skills'),api<any[]>('/api/admin/pool-entries'),api<ItemDefinition[]>('/api/admin/items')]) }
async function act(fn:()=>Promise<void>){busy.value=true;error.value='';message.value='';try{await fn()}catch(e){error.value=e instanceof Error?e.message:String(e)}finally{busy.value=false}}
function stars(n:number){return '★'.repeat(n)}
function editHero(h:HeroDefinition){Object.assign(heroForm,h);tab.value='controls'}
function editSkill(s:SkillDefinition){Object.assign(skillForm,{...s,effectConfig:{...s.effectConfig}});tab.value='controls'}
async function saveHero(){await act(async()=>{const id=heroForm.id;const body={...heroForm,code:heroForm.code||'hero_'+actionId()};delete body.id;const r=await api<{id:number}>(id?`/api/admin/heroes/${id}`:'/api/admin/heroes',{method:id?'PUT':'POST',body:JSON.stringify(body)});heroForm.id=r.id;heroForm.code=body.code;message.value='英雄资料已保存';await loadAdmin();await load()})}
async function saveSkill(){await act(async()=>{const id=skillForm.id;const body={...skillForm,code:skillForm.code||'skill_'+actionId()};delete body.id;const r=await api<{id:number}>(id?`/api/admin/skills/${id}`:'/api/admin/skills',{method:id?'PUT':'POST',body:JSON.stringify(body)});skillForm.id=r.id;skillForm.code=body.code;message.value='技能资料已保存';await loadAdmin();await load()})}
async function saveEntry(){await act(async()=>{const body={...entryForm,heroDefinitionId:entryForm.rewardType==='HERO'?Number(entryForm.heroDefinitionId):null,skillDefinitionId:entryForm.rewardType==='SKILL_BOOK'?Number(entryForm.skillDefinitionId):null,itemDefinitionId:entryForm.rewardType==='ITEM'?Number(entryForm.itemDefinitionId):null};await api('/api/admin/pool-entries',{method:'POST',body:JSON.stringify(body)});message.value='卡池权重已添加';await loadAdmin()})}
async function saveSettings(){await act(async()=>{await api('/api/admin/tavern-pools/'+entryForm.poolId,{method:'PUT',body:JSON.stringify(poolSettings)});message.value='卡池规则已保存，下次刷新生效';await load()})}
async function changeClock(multiplier:number,jumpSeconds=0){await act(async()=>{await api('/api/admin/clock',{method:'POST',body:JSON.stringify({multiplier,jumpSeconds})});message.value='游戏时间已调整';await load()})}
async function regenerateMap(){await act(async()=>{await api('/api/admin/map/refresh',{method:'POST'});message.value='据点、野地和随机城池已刷新';await load()})}
function editItemSkill(id:number){const s=skills.value.find(s=>s.id===id);if(s)editSkill(s)}
function entryChance(e:any){const total=entries.value.filter(x=>x.pool_id===e.pool_id&&x.enabled&&x.reward_enabled).reduce((n,x)=>n+Number(x.weight),0);return e.enabled&&e.reward_enabled&&total?(Number(e.weight)*100/total).toFixed(4)+'%':'未参与抽取'}
async function updateEntry(e:any){await act(async()=>{await api('/api/admin/pool-entries/'+e.id,{method:'PUT',body:JSON.stringify({poolId:Number(e.pool_id),rewardType:e.reward_type,heroDefinitionId:e.hero_definition_id?Number(e.hero_definition_id):null,skillDefinitionId:e.skill_definition_id?Number(e.skill_definition_id):null,itemDefinitionId:e.item_definition_id?Number(e.item_definition_id):null,weight:Number(e.weight),enabled:Boolean(e.enabled)})});message.value='卡池权重已保存';await loadAdmin()})}
function syncHash(){const value=window.location.hash.slice(1);if(value in tabNames)tab.value=value as Tab}
watch(tab,value=>{if(window.location.hash!==('#'+value))window.location.hash=value;if(value==='controls')void act(loadAdmin)})
let poll:ReturnType<typeof setInterval>,polling=false
onMounted(()=>{document.title='烽火战国 · 管理后台';window.addEventListener('hashchange',syncHash);void act(async()=>{await load();await loadAdmin()});poll=setInterval(async()=>{if(busy.value||polling)return;polling=true;try{await load()}catch{error.value='后台连接中断，请检查服务'}finally{polling=false}},5000)})
onUnmounted(()=>{clearInterval(poll);window.removeEventListener('hashchange',syncHash)})
</script>
<template>
  <div class="shell admin-shell">
    <header class="topbar"><div><div class="brand">烽火战国 · 管理后台</div><div class="era">数据目录 · 世界控制 · 外部调度</div></div><a class="context-link" href="/">返回游戏</a></header>
    <nav aria-label="后台导航"><button v-for="(name,key) in tabNames" :key="key" :class="{active:tab===key}" @click="tab=key">{{name}}</button></nav>
    <p class="admin-context-note">当前为管理环境，修改将影响同一份游戏存档。/admin 仅分离操作界面，无用户登录或权限隔离，请仅在受信内网使用。</p>
    <div v-if="error" class="toast error">{{error}}</div><div v-if="message" class="toast">{{message}}</div>
    <main v-if="data">
      <section v-if="tab==='tasks'" class="catalog"><ScheduledTasks/></section>
      <section v-if="tab==='military'" class="catalog"><MilitaryManager/></section>
      <section v-if="tab==='items'&&world" class="catalog"><div class="section-title"><div><small>仓库 · 目录 · 掉落 · 成长</small><h1>物品与培养管理</h1></div></div><ItemManager :world="world" @changed="load" @edit-skill="editItemSkill" /></section>
      <section v-if="tab==='catalog'" class="catalog">
        <div class="section-title"><div><small>完整数据目录</small><h1>英雄与技能</h1></div></div>
        <h3>英雄图鉴 · {{heroes.length}} 位</h3><div class="grid-table"><div v-for="h in heroes" :key="h.id" class="record"><AssetIcon :name="h.name" :icon-key="h.portraitKey" hero :rarity="h.star" :quality="h.qualityTier"/><div class="record-copy"><b>{{h.name}}</b><span>{{stars(h.star)}} · {{label(attackLabels,h.attackType)}}</span><small>近攻 {{h.meleeAttack}}　远攻 {{h.rangedAttack}}<br>近防 {{h.meleeDefense}}　远防 {{h.rangedDefense}}<br>速度 {{h.speed}}　负重 {{h.loadCapacity}}</small><p class="skill-description">{{h.description}}</p><em>{{label(sourceLabels,h.sourceStatus)}}</em></div><button @click="editHero(h)">编辑</button></div></div>
        <h3>技能书 · {{skills.length}} 种</h3><div class="grid-table"><div v-for="s in skills" :key="s.id" class="record skill"><AssetIcon :name="s.name" :icon-key="s.iconKey" :rarity="s.rarity" :quality="s.qualityTier"/><div class="record-copy"><b>{{s.name}}</b><span>{{label(effectLabels,s.effectType)}} · {{label(modeLabels,s.effectConfig?.mode??'BOTH')}}</span><small>初学触发 {{Math.round(s.triggerRate*100)}}%　最高 {{s.maxLevel}} 级 · 库存 {{world?.skillBooks.find(b=>b.skillDefinitionId===s.id)?.quantity??0}}</small><p class="skill-description">{{s.description}}</p><em>{{label(sourceLabels,s.sourceStatus)}}</em></div><button @click="editSkill(s)">编辑</button></div></div>
      </section>


      <section v-if="tab==='controls'" class="admin">
        <div class="section-title"><div><small>内网管理 · 操作留痕</small><h1>城主控制台</h1></div></div>
        <ResourceGrant :wallet="data.player.wallet" @changed="load"/>
        <TavernRecording/>
        <WorldBossSettings/>
        <div class="admin-grid">
          <form @submit.prevent="saveHero">
            <h3>{{heroForm.id?'编辑':'新增'}}英雄</h3>
            <div class="fields">
              <label>名称<input v-model="heroForm.name" required maxlength="64"></label>
              <label>星级<input v-model.number="heroForm.star" type="number" min="1" max="6" required></label>
              <label>定位<GameSelect v-model="heroForm.attackType" label="定位" :options="labelOptions(attackLabels)"/></label>
              <label v-for="(name,key) in heroFields" :key="key">{{name}}<input v-model.number="heroForm[key]" type="number" :min="key==='staminaMax'?1:0" required></label>
              <label>品质<GameSelect v-model="heroForm.qualityTier" label="品质" :options="qualityOptions"/></label>
              <label>头像<GameSelect v-model="heroForm.portraitKey" label="头像" :options="labelOptions(portraitNames).map(o=>({...o,iconKey:o.id,hero:true}))"/></label>
              <label>考证<GameSelect v-model="heroForm.sourceStatus" label="资料状态" :options="labelOptions(sourceLabels)"/></label>
              <label><input v-model="heroForm.enabled" type="checkbox"> 启用英雄</label>
            </div>
            <label>说明<textarea v-model="heroForm.description"></textarea></label>
            <button class="primary" :disabled="busy">保存英雄</button><button type="button" @click="Object.assign(heroForm,{id:0,code:'',name:'',sourceStatus:'DIY',description:'',portraitKey:'youxia'})">新增另一位</button>
          </form>
          <form @submit.prevent="saveSkill">
            <h3>{{skillForm.id?'编辑':'新增'}}技能</h3>
            <div class="fields">
              <label>名称<input v-model="skillForm.name" required maxlength="64"></label>
              <label>稀有度<input v-model.number="skillForm.rarity" type="number" min="1" max="6" required></label>
              <label>效果<GameSelect v-model="skillForm.effectType" label="技能效果" :options="labelOptions(effectLabels)"/></label>
              <label>目标<GameSelect v-model="skillForm.targetScope" label="技能目标" :options="labelOptions(targetLabels)"/></label>
              <label>发动时机<GameSelect v-model="skillForm.effectConfig.mode" label="发动时机" :options="labelOptions(modeLabels)"/></label>
              <label>初始触发率（0 至 1）<input v-model.number="skillForm.triggerRate" type="number" step="0.01" min="0" max="1" required></label>
              <label>每级触发率增加<input v-model.number="skillForm.effectConfig.ratePerLevel" type="number" step="0.01" min="0" max="1" required></label>
              <label>初始效果（百分比）<input v-model.number="skillForm.effectConfig.base" type="number" step="0.1" min="0" max="1000" required></label>
              <label>每级效果增加<input v-model.number="skillForm.effectConfig.perLevel" type="number" step="0.1" min="0" max="100" required></label>
              <label>最高等级<input v-model.number="skillForm.maxLevel" type="number" min="1" max="10" required></label>
              <label>品质<GameSelect v-model="skillForm.qualityTier" label="品质" :options="qualityOptions"/></label>
              <label>图标<GameSelect v-model="skillForm.iconKey" label="技能图标" :options="[...(skillForm.iconKey&&!iconNames[skillForm.iconKey]?[{id:skillForm.iconKey,label:'独立图标'}]:[]),...labelOptions(iconNames).map(o=>({...o,iconKey:o.id}))]"/></label>
              <label>考证<GameSelect v-model="skillForm.sourceStatus" label="资料状态" :options="labelOptions(sourceLabels)"/></label>
              <label><input v-model="skillForm.enabled" type="checkbox"> 启用技能</label>
            </div>
            <label>技能说明<textarea v-model="skillForm.description" required></textarea></label>
            <button class="primary" :disabled="busy">保存技能</button><button type="button" @click="Object.assign(skillForm,{id:0,code:'',name:'',sourceStatus:'DIY',description:'',iconKey:'xueyuan'})">新增另一本</button>
          </form>
          <form @submit.prevent="saveEntry">
            <h3>酒馆卡池 · 英雄 / 技能 / 藏宝阁</h3><div class="fields">
              <label>卡池<GameSelect v-model="entryForm.poolId" label="酒馆卡池" :options="data.pools.map(p=>({id:p.id,label:p.name}))"/></label>
              <label>类型<GameSelect v-model="entryForm.rewardType" label="奖励类型" :options="labelOptions({HERO:'英雄',SKILL_BOOK:'技能书',ITEM:'装备、宝物与道具'})" :disabled="selectedEntryPool?.poolType!=='MIXED'"/></label>
              <label v-if="entryForm.rewardType==='HERO'">英雄<GameSelect v-model="entryForm.heroDefinitionId" label="英雄" :options="heroes.map(h=>({id:h.id,label:h.name,iconKey:h.portraitKey,hero:true,quality:h.qualityTier}))"/></label>
              <label v-else-if="entryForm.rewardType==='SKILL_BOOK'">技能<GameSelect v-model="entryForm.skillDefinitionId" label="技能" :options="skills.map(s=>({id:s.id,label:s.name,iconKey:s.iconKey,quality:s.qualityTier}))"/></label>
              <label v-else>物品<GameSelect v-model="entryForm.itemDefinitionId" label="物品" :options="[{id:null,label:'选择物品'},...eligibleItems.map(i=>({id:i.id,label:i.name,detail:itemTypes[i.itemType],imageUrl:i.effectConfig.icon,quality:i.qualityTier}))]"/></label>
              <label>权重<input v-model.number="entryForm.weight" type="number" min="1" max="1000000" required></label>
            </div><button class="primary" :disabled="busy">添加权重项</button>
            <p class="fineprint">权重越低越稀有，概率指单个候选位。各位置独立抽取，可重复，无保底。停用或回收物品后不再刷出；已抽出的候选仍可领取。新物品在此手动加入卡池。</p>
            <button type="button" :disabled="busy" @click="act(loadAdmin)">刷新物品与卡池列表</button>
            <div class="weight-list"><label v-for="e in entries.filter(e=>Number(e.pool_id)===entryForm.poolId)" :key="e.id">{{e.reward_name}} · 单位概率 {{entryChance(e)}}<div class="learn-row"><input :aria-label="e.reward_name+'权重'" v-model.number="e.weight" type="number" min="1" max="1000000"><label><input v-model="e.enabled" type="checkbox" :true-value="1" :false-value="0">启用</label><button type="button" :disabled="busy" @click="updateEntry(e)">保存</button></div></label></div>
            <h3>刷新规则</h3><div class="fields"><label>刷新费用（{{currencyNames[selectedEntryPool?.currencyCode??'gold']}}）<input v-model.number="poolSettings.refreshCost" type="number" min="0" max="1000000000"></label><label>每轮候选数<input v-model.number="poolSettings.candidateCount" type="number" min="1" max="6"></label><label>每轮可选数<input v-model.number="poolSettings.selectLimit" type="number" min="1" :max="poolSettings.candidateCount"></label></div><button type="button" :disabled="busy" @click="saveSettings">保存刷新规则</button>
            <p class="fineprint">新规则下次刷新生效，不改变已经付费的候选与可选数量。</p>
          </form>
          <div class="controls"><h3>世界控制</h3><p>当前倍率 ×{{data.clock.multiplier}}</p><div class="button-row"><button @click="changeClock(1)">正常 ×1</button><button @click="changeClock(5)">×5</button><button @click="changeClock(20)">×20</button><button @click="changeClock(data.clock.multiplier,3600)">前进 1 小时</button><button @click="changeClock(data.clock.multiplier,86400)">前进 1 天</button></div><button class="primary" @click="regenerateMap">刷新据点、野地与随机城</button><p class="fineprint">倍率保存在服务端；浏览器关闭后，游戏时间和后台任务仍按该倍率推进。</p></div>
        </div>
      </section>

    </main><div v-else class="loading">正在读取管理数据…</div>
  </div>
</template>
