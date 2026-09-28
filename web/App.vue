<script setup lang="ts">
import { computed,onMounted,onUnmounted,ref } from 'vue'
import type { BootstrapPayload,HeroDefinition,MapNode,SkillDefinition,TavernRefreshResult,WorldStatus } from '../shared/contracts'
import { api,actionId } from './api'
import {useTimedNotice} from './timed-notice'
import { label,attackLabels,talentLabels,nodeLabels,statusLabels,effectLabels,modeLabels } from '../shared/labels'
import HeroRoster from './HeroRoster.vue'
import GameModal from './GameModal.vue'
import GameWorkshop from './GameWorkshop.vue'
import type {ItemDefinition} from '../shared/items'
import AssetIcon from './AssetIcon.vue'
import QuietReports from './QuietReports.vue'
import WorldMap from './WorldMap.vue'
import {worldBossCountdown} from '../shared/world-boss'
import DispatchHeroes from './DispatchHeroes.vue'
import InventoryBag from './InventoryBag.vue'
import HeroItemUse from './HeroItemUse.vue'
import Treasury from './Treasury.vue'
import MilitaryPanel from './MilitaryPanel.vue'
import DispatchTroops from './DispatchTroops.vue'
import AutoFarmRecord from './AutoFarmRecord.vue'
import FoodStatus from './FoodStatus.vue'
import TavernCandidates from './TavernCandidates.vue'
import {currencyNames} from '../shared/tavern'
import type {MilitaryState} from '../shared/military'

type Tab='workshop'|'tavern'|'map'|'barracks'|'defense'|'roster'|'catalog'|'bag'|'treasury'
const tab=ref<Tab>('tavern'), data=ref<BootstrapPayload|null>(null), heroes=ref<HeroDefinition[]>([]), skills=ref<SkillDefinition[]>([])
const gems=ref<ItemDefinition[]>([]),bagItemId=ref<number|null>(null),bagHeroId=ref<number>()
const workshopInitialTab=ref<'equipment'|'gems'>('equipment'),forgeFocus=ref(0)
const bagEntry=computed(()=>world.value?.inventory.find(e=>e.item.id===bagItemId.value))
function openItemUse(itemId:number,heroId?:number){if(busy.value||bagEntry.value)return;error.value='';const target=heroId??(world.value?.ownedHeroes.length===1?world.value.ownedHeroes[0].id:undefined);if(target){void useBagItem({heroId:target,itemId,clientActionId:actionId()});return}bagHeroId.value=undefined;bagItemId.value=itemId}
async function useBagItem(body:{heroId:number;itemId:number;clientActionId:string}){if(busy.value)return;await act(async()=>{await api('/api/heroes/'+body.heroId+'/items/use',{method:'POST',body:JSON.stringify({itemId:body.itemId,clientActionId:body.clientActionId})});bagItemId.value=null;message.value='道具已使用';await load()})}
const world=ref<WorldStatus|null>(null),selectedNode=ref<MapNode|null>(null),selectedHero=ref(-1)
const military=ref<MilitaryState>({ready:false,definitions:[],stock:{},orders:[],defense:{melee:0,ranged:0}}),troopSelection=ref<Record<string,number>>({})
const selectedTroops=computed(()=>Object.entries(troopSelection.value).filter(([,quantity])=>quantity>0).map(([code,quantity])=>({code,quantity})))
const canDispatch=computed(()=>!busy.value&&!(selectedNode.value?.worldBoss&&selectedNode.value.expiresGameAt&&Date.parse(selectedNode.value.expiresGameAt)<=gameTimeMs.value)&&(selectedHero.value>0||selectedTroops.value.length>0)&&!world.value?.ownedHeroes.find(h=>h.id===selectedHero.value)?.busy)
const busy=ref(false),message=useTimedNotice(),error=useTimedNotice(),selectedPool=ref(0),clockTick=ref(Date.now()),clockLoadedAt=ref(Date.now())
const currentPool=computed(()=>data.value?.pools.find(p=>p.id===selectedPool.value))
const currentRefresh=computed(()=>data.value?.latestRefreshes?.find(r=>r.pool.id===selectedPool.value)??(data.value?.latestRefresh?.pool.id===selectedPool.value?data.value.latestRefresh:null))
const gameTimeMs=computed(()=>data.value?new Date(data.value.clock.gameNow).getTime()+(clockTick.value-clockLoadedAt.value)*data.value.clock.multiplier:Date.now())
const liveGameTime=computed(()=>data.value?new Date(new Date(data.value.clock.gameNow).getTime()+(clockTick.value-clockLoadedAt.value)*data.value.clock.multiplier).toLocaleString():'--')

async function load(){ const [payload,status,army]=await Promise.all([api<BootstrapPayload>('/api/bootstrap'),api<WorldStatus>('/api/world/status'),api<MilitaryState>('/api/military')]);if(error.value==="连接中断，正在重试…")error.value='';data.value=payload;world.value=status;military.value=army;selectedPool.value ||= payload.pools[0]?.id??0;if(selectedHero.value!==0&&!status.ownedHeroes.some(h=>h.id===selectedHero.value))selectedHero.value=status.ownedHeroes.find(h=>!h.busy)?.id??0;if(selectedNode.value)selectedNode.value=payload.mapNodes.find(n=>n.id===selectedNode.value!.id)??null; clockLoadedAt.value=Date.now();clockTick.value=clockLoadedAt.value }
async function loadCatalog(){[heroes.value,skills.value,gems.value]=await Promise.all([api<HeroDefinition[]>('/api/catalog/heroes'),api<SkillDefinition[]>('/api/catalog/skills'),api<ItemDefinition[]>('/api/catalog/gems')])}
async function combineGem(body:object){await act(async()=>{const result=await api<{message:string}>('/api/gems/combine',{method:'POST',body:JSON.stringify(body)});message.value=result.message;await load()})}
async function salvaged(text:string){await act(async()=>{message.value=text;await load()})}
async function workshopForge(body:object){await act(async()=>{const result=await api<{message:string;gear:{instanceId:number}}>('/api/forge/equipment',{method:'POST',body:JSON.stringify(body)});message.value=result.message;await load();forgeFocus.value=result.gear.instanceId})}
async function act(fn:()=>Promise<void>){busy.value=true;error.value='';message.value='';try{await fn()}catch(e){error.value=e instanceof Error?e.message:String(e)}finally{busy.value=false}}
async function refresh(){await act(async()=>{const result=await api<TavernRefreshResult>('/api/tavern/refresh',{method:'POST',body:JSON.stringify({poolId:selectedPool.value,clientActionId:actionId()})});if(data.value){data.value.latestRefresh=result;data.value.latestRefreshes=[...(data.value.latestRefreshes??[]).filter(r=>r.pool.id!==result.pool.id),result];data.value.player.wallet[result.pool.currencyCode]=result.remainingCurrency}})}
async function recruit(id:number){await act(async()=>{const r=await api<{name:string;rewardType:string}>('/api/tavern/candidates/'+id+'/recruit',{method:'POST'});message.value=`${r.name} ${r.rewardType==='HERO'?'已收入麾下':'已收入包裹'}`;await load()})}
function stars(n:number){return '★'.repeat(n)}
async function march(){if(!selectedNode.value)return;await act(async()=>{const r=await api<{arriveGameAt:string}>('/api/world/marches',{method:'POST',body:JSON.stringify({heroId:selectedHero.value||null,nodeId:selectedNode.value!.id,troops:selectedTroops.value,clientActionId:actionId()})});troopSelection.value={};message.value=`行军已出发，预计游戏时间 ${new Date(r.arriveGameAt).toLocaleTimeString()} 抵达`;selectedNode.value=null;await load()})}
async function autoFarm(){if(!selectedNode.value||selectedNode.value.worldBoss)return;await act(async()=>{await api('/api/world/auto-farm',{method:'POST',body:JSON.stringify({heroId:selectedHero.value||null,troops:selectedTroops.value,nodeId:selectedNode.value!.id,nodeType:selectedNode.value!.nodeType,minLevel:selectedNode.value!.level,maxLevel:selectedNode.value!.level,runs:10})});troopSelection.value={};message.value='自动出征已锁定当前目标：每次返城完成一轮，再次出发；最多 10 轮，目标耗尽或兵力耗尽时停止';selectedNode.value=null;await load()})}
async function pauseFarm(id:number){await act(async()=>{await api(`/api/world/auto-farm/${id}/pause`,{method:'POST'});message.value='自动刷野已暂停';await load()})}
async function orderMilitary(code:string,quantity:number){await act(async()=>{await api('/api/military/orders',{method:'POST',body:JSON.stringify({code,quantity,clientActionId:actionId()})});message.value=`${military.value.definitions.find(d=>d.code===code)?.name??'生产'} × ${quantity} 已加入队列，完成后逐个入城`;await load()})}
async function heroCommand(url:string,body?:object){await act(async()=>{const r=await api<any>(url,{method:'POST',body:body?JSON.stringify(body):undefined});message.value=r?.message??(r?.before&&r?.after?'天赋洗练：'+label(talentLabels,r.before)+' → '+label(talentLabels,r.after):url.endsWith('/retire')?'英雄已从名册移除，装备宝物已退回仓库':'英雄操作已完成');await load()})}
async function clearReports(){await act(async()=>{await api('/api/world/reports',{method:'DELETE'});message.value='主动出征战报已从数据库清空；被攻击记录永久保留';await load()})}
let timer:ReturnType<typeof setInterval>,poll:ReturnType<typeof setInterval>,polling=false
onMounted(()=>{void act(async()=>{await load();await loadCatalog()});timer=setInterval(()=>clockTick.value=Date.now(),250);poll=setInterval(async()=>{if(busy.value||polling)return;polling=true;try{await load();await loadCatalog()}catch{error.value='连接中断，正在重试…'}finally{polling=false}},2000)})
onUnmounted(()=>{clearInterval(timer);clearInterval(poll)})
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <div><div class="brand">烽火战国</div><div class="era">二〇一二 · 单机重制</div></div>
      <div v-if="data" class="resources">
        <span>粮 {{data.player.wallet.food.toLocaleString()}}</span><span>木 {{data.player.wallet.wood.toLocaleString()}}</span><span>石 {{data.player.wallet.stone.toLocaleString()}}</span><span>铁 {{data.player.wallet.iron.toLocaleString()}}</span><span class="gold">金 {{data.player.wallet.gold.toLocaleString()}}</span>
      </div>
      <div class="clock">×{{data?.clock.multiplier??1}} · {{liveGameTime}}</div>
    </header>
    <nav><button v-for="item in ([['tavern','酒馆'],['roster','我的英雄'],['map','天下'],['barracks','军营'],['defense','城防'],['bag','我的物品'],['workshop','工坊'],['treasury','藏宝阁'],['catalog','英雄技能']] as const)" :key="item[0]" :class="{active:tab===item[0]}" @click="tab=item[0];if(item[0]==='workshop')workshopInitialTab='equipment'">{{item[1]}}</button><a class="context-link" href="/admin">管理后台 ↗</a></nav>
    <div v-if="error" class="toast error">{{error}}</div><div v-if="message" class="toast">{{message}}</div>
    <FoodStatus :upkeep="military.upkeep"/>
    <main v-if="data">
      <section v-if="tab==='tavern'" class="tavern">
        <div class="section-title"><div><small>招贤纳士 · 秘术奇卷 · 名器异宝</small><h1>{{currentPool?.poolType==='ITEM'?'藏宝阁':currentPool?.poolType==='SKILL'?'藏书阁':'聚贤馆'}}</h1></div><div class="pool-tabs"><button v-for="p in data.pools" :key="p.id" :disabled="busy" :class="{active:selectedPool===p.id}" @click="selectedPool=p.id">{{p.name}}</button></div></div>
        <TavernCandidates v-if="currentRefresh" :result="currentRefresh" :heroes="heroes" :skills="skills" :busy="busy" :hero-count="world?.ownedHeroes.length??0" @claim="recruit" @bag="tab='bag'"/>
        <div v-else class="empty"><div class="bronze">{{currentPool?.poolType==='ITEM'?'宝':'鼎'}}</div><p>{{currentPool?.poolType==='ITEM'?'奇珍随缘而至，刷新寻觅装备、宝物与道具。':currentPool?.poolType==='SKILL'?'秘术奇卷，静候有缘之人。':'刷新酒馆，看看今夜谁会投奔你的烽火城。'}}</p></div>
        <button class="primary refresh" :disabled="busy||!currentPool||data.player.wallet[currentPool.currencyCode]<currentPool.refreshCost" @click="refresh">{{busy?'请稍候…':`刷新 · ${currentPool?.refreshCost.toLocaleString()??0} ${currencyNames[currentPool?.currencyCode??'gold']}`}}</button>
        <p class="fineprint">每次刷新 {{currentPool?.candidateCount??3}} 个候选，可选 {{currentPool?.selectLimit??1}} 个。{{currentPool?.poolType==='ITEM'?'选中的珍品直接收入包裹。':''}}<br>刷新会替换当前候选；切换分页或关闭浏览器不会重置结果。<template v-if="data.tavernRecordingEnabled===false">当前为临时候选，游戏服务重启后清空。</template></p>
      </section>

      <section v-if="tab==='roster'&&world" class="catalog"><div class="section-title"><div><small>招募 · 修习 · 出征</small><h1>我的英雄</h1></div></div><HeroRoster :world="world" :skills="skills" :busy="busy" @command="heroCommand" @use-item="openItemUse" /></section>

      <section v-if="tab==='map'" class="map-panel">
        <div class="section-title"><div><small>据点 · 野地 · 副本 · 系统城</small><h1>天下舆图</h1></div><p>服务端持续结算，关闭浏览器也不会停止</p></div>
        <WorldMap :nodes="data.mapNodes" :world="world" :game-time="gameTimeMs" :selected-id="selectedNode?.id" @select="selectedNode=$event" />
        <div class="legend"><span>◆ 据点</span><span>▲ 野地</span><span>● 副本</span><span>▣ 系统城</span><span>★ 随机城</span></div>
        <GameModal v-if="selectedNode" title="调兵遣将" wide @close="!busy&&(selectedNode=null)"><div class="shell dispatch-shell"><div class="campaign army-campaign"><div><small>{{selectedNode.worldBoss?'世界首领':label(nodeLabels,selectedNode.nodeType)}} · {{selectedNode.level}} 级</small><h3>{{selectedNode.name}}</h3><p>守军倾向 {{label(attackLabels,selectedNode.defenseBias)}}　战利品 {{selectedNode.rewardHint}}</p><p>守军近防 {{selectedNode.meleeDefense?.toLocaleString()}}　远防 {{selectedNode.rangedDefense?.toLocaleString()}}</p><p v-if="selectedNode.worldBoss">世界首领 · 剩余 {{worldBossCountdown(selectedNode.expiresGameAt,gameTimeMs)}}（游戏时间）<br>首次获胜或到期即消失 · 战败不降级<br>全目录豪华掉落，数量与掉率大幅提升；只可单次挑战。</p><p v-else>每战降 1 级 · 0 级消失 · 自动出征锁定此目标<template v-if="selectedNode.nodeType==='OUTPOST'"><br>最高 20 级 · 当前掉落池生效概率：基础概率 × {{Math.round((selectedNode.dropFactor??1)*100)}}%</template></p></div><template v-if="world"><DispatchHeroes :heroes="world.ownedHeroes" :selected="selectedHero" :busy="busy" @select="selectedHero=$event"/><DispatchTroops :state="military" v-model:selection="troopSelection" :hero="world.ownedHeroes.find(h=>h.id===selectedHero)" :node="selectedNode" :busy="busy"/><div class="button-row"><button class="primary" :disabled="!canDispatch" @click="march">普通出征</button><button v-if="!selectedNode.worldBoss" :disabled="!canDispatch" @click="autoFarm">自动刷 10 次</button></div><p v-if="error" class="toast error">{{error}}</p></template></div></div></GameModal>
        <p class="fineprint">近攻对近防，远攻对远防；混合攻击按近远攻击占比计算有效防御。可由英雄带兵，也可只派士兵。</p>
        <div class="activity" v-if="world">
          <div class="task-list"><h3>当前行军</h3><p v-if="!world.marches.length">暂无行军；普通任务返城后自动清理</p><p v-for="m in world.marches" :key="m.id">{{m.heroName}} → {{m.targetName}} · {{label(statusLabels,m.status)}} <b v-if="m.result">{{label(statusLabels,m.result)}}</b><small v-if="m.troops?.length">{{m.troops.filter(t=>t.quantity>0).map(t=>t.name+" × "+t.quantity).join(" · ")}}</small></p><h3>自动出征记录</h3><p v-if="!world.autoFarmJobs.length">暂无自动出征记录</p><AutoFarmRecord v-for="j in world.autoFarmJobs" :key="j.id" :job="j" :busy="busy" :game-time="gameTimeMs" @pause="pauseFarm"/><h3>被攻击记录 · 永久保留</h3><p v-if="!world.incoming?.total">暂无被攻击记录</p><p v-for="r in world.incoming?.reports" :key="r.id">{{r.title}} · {{label(statusLabels,r.result)}}<small>{{new Date(r.occurredGameAt).toLocaleString()}}</small></p><p v-if="(world.incoming?.total??0)>20">共 {{world.incoming.total}} 条，可在右侧被攻击战报中查看完整记录。</p></div>
          <div><QuietReports :reports="world.reports" :incoming="world.incoming" :busy="busy" @clear="clearReports" /></div>
        </div>
      </section>

      <section v-if="tab==='bag'&&world" class="catalog"><InventoryBag :inventory="world.inventory" :skills="skills" @forge="workshopInitialTab='gems';tab='workshop'" @use-item="openItemUse"/></section>
      <section v-if="tab==='workshop'&&world" class="catalog"><GameWorkshop :world="world" :gems="gems" :busy="busy" :focus-instance-id="forgeFocus" :initial-tab="workshopInitialTab" @bag="tab='bag'" @forge="workshopForge" @combine="combineGem" @salvaged="salvaged"/></section>
      <section v-if="tab==='treasury'&&world" class="catalog"><Treasury :world="world"/></section>
      <section v-if="tab==='barracks'||tab==='defense'" class="defense-panel"><MilitaryPanel :key="tab" :state="military" :kind="tab==='barracks'?'TROOP':'DEFENSE'" :wallet="data.player.wallet" :game-time="gameTimeMs" :busy="busy" @order="orderMilitary"/></section>

      <section v-if="tab==='catalog'" class="catalog">
        <div class="section-title"><div><small>完整数据目录</small><h1>英雄与技能</h1></div></div>
        <h3>英雄图鉴 · {{heroes.length}} 位</h3><div class="grid-table"><div v-for="h in heroes" :key="h.id" class="record"><AssetIcon :name="h.name" :icon-key="h.portraitKey" hero :rarity="h.star" :quality="h.qualityTier"/><div class="record-copy"><b>{{h.name}}</b><span>{{stars(h.star)}} · {{label(attackLabels,h.attackType)}}</span><small>近攻 {{h.meleeAttack}}　远攻 {{h.rangedAttack}}<br>近防 {{h.meleeDefense}}　远防 {{h.rangedDefense}}<br>速度 {{h.speed}}　负重 {{h.loadCapacity}}</small><p class="skill-description">{{h.description}}</p></div></div></div>
        <h3>技能书 · {{skills.length}} 种</h3><div class="grid-table"><div v-for="s in skills" :key="s.id" class="record skill"><AssetIcon :name="s.name" :icon-key="s.iconKey" :rarity="s.rarity" :quality="s.qualityTier"/><div class="record-copy"><b>{{s.name}}</b><span>{{label(effectLabels,s.effectType)}} · {{label(modeLabels,s.effectConfig?.mode??'BOTH')}}</span><small>初学触发 {{Math.round(s.triggerRate*100)}}%　最高 {{s.maxLevel}} 级 · 库存 {{world?.skillBooks.find(b=>b.skillDefinitionId===s.id)?.quantity??0}}</small><p class="skill-description">{{s.description}}</p></div></div></div>
      </section>

    </main>
    <HeroItemUse v-if="bagEntry&&world" :key="bagEntry.item.id" :entry="bagEntry" :heroes="world.ownedHeroes" :initial-hero-id="bagHeroId" :busy="busy" :error="error" @close="!busy&&(bagItemId=null)" @use="useBagItem"/>
  </div>
</template>
