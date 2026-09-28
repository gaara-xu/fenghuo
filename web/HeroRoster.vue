<script setup lang="ts">
import {computed,ref,watch} from 'vue'
import type {OwnedHero,SkillDefinition,WorldStatus} from '../shared/contracts'
import {label,talentLabels,modeLabels} from '../shared/labels'
import {statLabels} from '../shared/hero-growth'
import {equipmentSlots,equipmentBonuses,equipmentFlatBonuses,equipmentSetStates,type EquipmentSlot} from '../shared/items'
import {maxSkillSlots,slotUnlockLevel} from '../server/domain/skills'
import {actionId} from './api'
import AssetIcon from './AssetIcon.vue'
import IconInventoryPicker from './IconInventoryPicker.vue'
import EquipmentWorkbench from './EquipmentWorkbench.vue'
import {inventoryChoice} from './item-choices'
import {gameNotice,gamePrompt} from './game-dialog'
const props=defineProps<{world:WorldStatus;skills:SkillDefinition[];busy:boolean}>(),emit=defineEmits<{command:[url:string,body?:object];'use-item':[itemId:number,heroId:number]}>()
const selectedId=ref(Number(sessionStorage.getItem('fenghuo:selectedHero')??0)),search=ref(''),view=ref<'overview'|'skills'|'equipment'>('overview'),skillSlot=ref(1),gearSlot=ref<EquipmentSlot>('HELMET')
const bookChoice=ref<number>(),renameOpen=ref(false),pending=ref(false)
watch(()=>props.busy,value=>{if(!value)pending.value=false})
const consumables=computed(()=>props.world.inventory.filter(e=>e.quantity>0&&e.item.enabled&&!e.item.deletedAt&&e.item.itemType==='CONSUMABLE'&&['TALENT','EXPERIENCE','STAMINA'].includes(e.item.effectConfig.kind??'')).map(e=>inventoryChoice(e)))
function useFromBag(itemId:number|undefined){if(itemId&&hero.value&&!locked.value&&consumables.value.some(i=>i.id===itemId))command('/items/use',{itemId,clientActionId:actionId()})}
const renameCards=computed(()=>props.world.inventory.filter(i=>i.item.enabled&&i.item.effectConfig.kind==='RENAME').reduce((n,i)=>n+i.quantity,0))
watch(()=>props.world.ownedHeroes.map(h=>h.id),ids=>{if(!ids.includes(selectedId.value))selectedId.value=ids[0]??0},{immediate:true})
watch(selectedId,id=>{sessionStorage.setItem('fenghuo:selectedHero',String(id));skillSlot.value=1;bookChoice.value=undefined;view.value='overview'})
const hero=computed(()=>props.world.ownedHeroes.find(h=>h.id===selectedId.value)),shown=computed(()=>props.world.ownedHeroes.filter(h=>(h.name+' '+h.originalName).includes(search.value)))
const locked=computed(()=>props.busy||pending.value||Boolean(hero.value?.busy)),learned=computed(()=>hero.value?.skills.find(s=>s.slotNo===skillSlot.value))
const water=computed(()=>props.world.inventory.find(i=>i.quantity>0&&i.item.enabled&&!i.item.deletedAt&&i.item.effectConfig.kind==='TALENT'))
const availableBooks=computed(()=>props.world.skillBooks.filter(b=>b.quantity>0&&props.skills.some(s=>s.id===b.skillDefinitionId&&s.enabled)&&!hero.value?.skills.some(s=>s.skillDefinitionId===b.skillDefinitionId)).map(b=>{const s=props.skills.find(s=>s.id===b.skillDefinitionId)!;return {id:s.id,name:s.name,badge:String(b.quantity),detail:s.description,iconKey:s.iconKey,quality:s.qualityTier}}))
const upgradeBookCount=computed(()=>props.world.skillBooks.find(b=>b.skillDefinitionId===learned.value?.skillDefinitionId)?.quantity??0)
const canUpgrade=computed(()=>hero.value&&learned.value&&!locked.value&&learned.value.level<learned.value.maxLevel&&hero.value.experience>=learned.value.upgradeExp&&upgradeBookCount.value>=(learned.value.sameBookCost??1))
function command(path:string,body?:object){if(!hero.value||locked.value)return;pending.value=true;emit('command','/api/heroes/'+hero.value.id+path,body)}
function pickSkill(slot:number){skillSlot.value=slot;view.value='skills';bookChoice.value=undefined}
function pickGear(slot:EquipmentSlot){gearSlot.value=slot;view.value='equipment'}
function learn(){const id=bookChoice.value,slot=skillSlot.value;if(!hero.value||locked.value||!id||!availableBooks.value.some(b=>b.id===id))return;command('/skills/learn',{slot,skillId:id});bookChoice.value=undefined}
function washTalent(){
 const h=hero.value,itemId=water.value?.item.id
 if(!h||locked.value||h.talentGrade==='PERFECT')return
 if(!itemId){gameNotice('缺少天赋水，可从酒馆藏宝阁或据点掉落获得。');return}
 command('/items/use',{itemId,clientActionId:actionId()})
}
function retire(reason:'EXILE'|'EXECUTE'){const h=hero.value;if(!h||locked.value)return;command('/retire',{reason,confirmName:h.name})}
async function rename(){const h=hero.value;if(!h||locked.value||renameOpen.value)return;if(!renameCards.value){gameNotice('缺少改名卡，可从酒馆藏宝阁或据点掉落获得。');return}renameOpen.value=true;try{const name=await gamePrompt({title:'英雄改名',message:'消耗 1 张改名卡，为「'+h.name+'」取一个新名字。持有 '+renameCards.value+' 张。',placeholder:'新的英雄名字',initial:h.name,maxLength:32,submitText:'消耗改名卡',validate:value=>!value||value.length>32?'名字需为 1 至 32 个字符':value===h.name?'请输入不同的新名字':''});if(name===null||hero.value?.id!==h.id||locked.value)return;command('/rename',{name,clientActionId:actionId()})}finally{renameOpen.value=false}}
function gearHint(slot:EquipmentSlot){const e=hero.value?.equipment.find(e=>e.slot===slot);if(!e)return equipmentSlots[slot]+' · 点击选择装备';const c=inventoryChoice({...e,quantity:1},hero.value!.equipment);return [c.name,...c.lines??[],c.detail,'右键卸下'].join('\n')}
function unequip(slot:EquipmentSlot){if(!locked.value&&hero.value?.equipment.some(e=>e.slot===slot))command('/equipment',{slot,itemId:null})}
const gearFlat=computed(()=>equipmentFlatBonuses(hero.value?.equipment??[])),gearPercent=computed(()=>equipmentBonuses(hero.value?.equipment??[])),gearSets=computed(()=>equipmentSetStates(hero.value?.equipment??[]))
function gearSetHint(slot:EquipmentSlot){const e=hero.value?.equipment.find(e=>e.slot===slot);return e?JSON.stringify(inventoryChoice({...e,quantity:1},hero.value!.equipment).setTiers??[]):'[]'}
function gearLevel(slot:EquipmentSlot){return '+'+(hero.value?.equipment.find(e=>e.slot===slot)?.gear?.refineLevel??0)}
function equipped(h:OwnedHero,slot:EquipmentSlot){return h.equipment.find(e=>e.slot===slot)?.item}
const leftSlots:EquipmentSlot[]=['HELMET','SHOULDER','ARMOR','LEGS','BOOTS'],rightSlots:EquipmentSlot[]=['NECKLACE','BRACELET','BRACELET_2','RING','RING_2']
const percent=(n:number|undefined)=>Number(((n??0)*100).toFixed(2))
</script>
<template>
  <div v-if="hero" class="hero-workbench">
    <aside class="hero-sidebar"><h3>英雄名册 <small>{{world.ownedHeroes.length}}</small></h3><input v-model="search" type="search" placeholder="查找英雄" aria-label="查找英雄"><div class="hero-list">
      <button v-for="h in shown" :key="h.id" class="hero-list-item" :class="{chosen:h.id===hero.id}" :aria-pressed="h.id===hero.id" @click="selectedId=h.id"><AssetIcon :name="h.name" :icon-key="h.portraitKey" hero :rarity="h.star" :quality="h.qualityTier" size="tiny"/><span><b>{{h.name}}</b><small>{{h.level}} 级 · {{label(talentLabels,h.talentGrade)}}</small><small :class="{marching:h.busy}">{{h.busy?'正在出征':'待命'}} · {{'★'.repeat(h.star)}}</small></span></button>
      <p v-if="!shown.length" class="fineprint">没有找到该名字</p>
    </div></aside>
    <div class="hero-sheet"><div class="sheet-title"><span>查看英雄 · {{hero.name}}</span><small>{{hero.busy?'行军／刷野中，培养已锁定':'城内待命'}}</small></div>
      <div class="hero-body">
        <div class="hero-doll">
          <div class="gear-column"><button v-for="slot in leftSlots" :key="slot" class="gear-cell" :class="{chosen:view==='equipment'&&gearSlot===slot}" :aria-label="equipmentSlots[slot]" @click="pickGear(slot)" @contextmenu.prevent="unequip(slot)" :data-game-hint="gearHint(slot)" :data-game-set-hint="gearSetHint(slot)"><AssetIcon v-if="equipped(hero,slot)" :name="equipped(hero,slot)!.name" :image-url="equipped(hero,slot)!.effectConfig.icon" :quality="equipped(hero,slot)!.qualityTier"/><small v-if="equipped(hero,slot)" class="gear-level">{{gearLevel(slot)}}</small><span v-else class="empty-gear">{{equipmentSlots[slot]}}</span></button></div>
          <div class="hero-center"><button type="button" class="hero-portrait" aria-label="查看英雄属性与天赋" @click="view='overview'"><AssetIcon :name="hero.name" :icon-key="hero.portraitKey" hero :rarity="hero.star" :quality="hero.qualityTier" size="large"/></button><h2><button class="hero-name" :disabled="locked" aria-label="使用改名卡修改英雄名字" @click="rename" @contextmenu.prevent="rename">{{hero.name}}</button></h2><div class="stars">{{'★'.repeat(hero.star)}} <span>{{hero.level}} 级</span></div><div class="experience-track" role="progressbar" aria-label="升级经验" :aria-valuenow="Math.min(hero.experience,hero.upgradeExp)" :aria-valuemax="hero.upgradeExp" :aria-valuemin="0"><i :style="{width:Math.min(100,hero.experience/hero.upgradeExp*100)+'%'}"></i></div><small>剩余经验 {{hero.experience.toLocaleString()}} / {{hero.upgradeExp}}</small><div class="hero-stats"><div v-for="(name,key) in statLabels" :key="key"><span>{{name}}</span><b>{{hero.stats[key].toLocaleString()}}</b></div></div><div class="hero-talent"><span class="talent-label">天赋：</span><span v-if="hero.talentGrade==='PERFECT'" class="talent-value perfect">完美</span><button v-else type="button" class="talent-value" :disabled="locked" :aria-label="'使用天赋水，当前天赋'+label(talentLabels,hero.talentGrade)" @click="washTalent">{{label(talentLabels,hero.talentGrade)}}</button></div></div>
          <div class="gear-column"><button v-for="slot in rightSlots" :key="slot" class="gear-cell" :class="{chosen:view==='equipment'&&gearSlot===slot}" :aria-label="equipmentSlots[slot]" @click="pickGear(slot)" @contextmenu.prevent="unequip(slot)" :data-game-hint="gearHint(slot)" :data-game-set-hint="gearSetHint(slot)"><AssetIcon v-if="equipped(hero,slot)" :name="equipped(hero,slot)!.name" :image-url="equipped(hero,slot)!.effectConfig.icon" :quality="equipped(hero,slot)!.qualityTier"/><small v-if="equipped(hero,slot)" class="gear-level">{{gearLevel(slot)}}</small><span v-else class="empty-gear">{{equipmentSlots[slot]}}</span></button></div>
          <div class="treasure-row"><button v-for="slot in (['WEAPON','SHIELD','MOUNT','TREASURE_1','TREASURE_2'] as const)" :key="slot" :aria-label="equipmentSlots[slot]" class="gear-cell" :class="{chosen:view==='equipment'&&gearSlot===slot}" @click="pickGear(slot)" @contextmenu.prevent="unequip(slot)" :data-game-hint="gearHint(slot)" :data-game-set-hint="gearSetHint(slot)"><AssetIcon v-if="equipped(hero,slot)" :name="equipped(hero,slot)!.name" :image-url="equipped(hero,slot)!.effectConfig.icon" :quality="equipped(hero,slot)!.qualityTier"/><small v-if="equipped(hero,slot)" class="gear-level">{{gearLevel(slot)}}</small><span v-else class="empty-gear">{{equipmentSlots[slot]}}</span></button></div>
          <div class="hero-skill-bar"><button v-for="slot in maxSkillSlots(hero.star)" :key="slot" class="gear-cell" :class="{chosen:view==='skills'&&skillSlot===slot}" :aria-label="'技能槽'+slot" @click="pickSkill(slot)"><AssetIcon v-if="hero.skills.find(s=>s.slotNo===slot)" :name="hero.skills.find(s=>s.slotNo===slot)!.name" :icon-key="hero.skills.find(s=>s.slotNo===slot)!.iconKey" :quality="hero.skills.find(s=>s.slotNo===slot)!.qualityTier"/><span v-else class="empty-gear">{{slot>hero.unlockedSlots?slotUnlockLevel(hero.star,slot)+'级解锁':'学习技能'}}</span><small v-if="hero.skills.find(s=>s.slotNo===slot)">{{hero.skills.find(s=>s.slotNo===slot)!.level}}级</small></button></div>
        </div>
        <aside class="hero-inspector" aria-label="英雄操作面板">
          <header class="inspector-heading"><h3>{{view==='overview'?'属性与装备':view==='skills'?'技能修习':'装备与宝物'}}</h3><button v-if="view!=='overview'" type="button" @click="view='overview'">返回属性</button><small v-else>点击头像返回此页</small></header>
          <EquipmentWorkbench v-if="view==='equipment'" :key="hero.id+'-'+gearSlot" :hero="hero" :slot="gearSlot" :inventory="world.inventory" :locked="locked" @equip="body=>command('/equipment',body)" @forge="body=>command('/forge',body)"/>
          <section v-else-if="view==='overview'" class="hero-overview">
            <div class="status-line">{{hero.busy?'出征中':'待命中'}} · 体力 {{hero.stamina}}</div>
            <h3>当前装备加成</h3><div class="equipment-summary"><div v-for="(name,key) in statLabels" :key="key"><span>{{name}}</span><b>+{{(gearFlat[key]??0).toLocaleString()}}<small v-if="gearPercent[key]"> / +{{Number(gearPercent[key]!.toFixed(2))}}%</small></b></div></div>
            <div v-for="set in gearSets" :key="set.code" class="set-summary"><h4>{{set.name}} · {{set.count}} 件</h4><p v-for="tier in set.tiers" :key="tier.count" :class="{'set-inactive':!tier.active,'set-active':tier.active}">{{tier.count}} 件：<span v-for="(value,key) in tier.bonuses" :key="key">{{statLabels[key]}} +{{value}}%　</span><small>{{tier.active?'已生效':tier.unlocked?'高档已替代':'未激活'}}</small></p></div>
            <h3>属性成长</h3><div class="upgrade-preview"><div v-for="(name,key) in statLabels" :key="key"><span>{{name}}</span><b>{{hero.stats[key].toLocaleString()}}</b><em v-if="hero.nextStats">+{{(hero.nextStats[key]-hero.stats[key]).toLocaleString()}}</em><em v-else>已满级</em></div></div>
            <button type="button" class="primary train-hero" :disabled="locked||!hero.nextStats||hero.experience<hero.upgradeExp" @click="command('/train')">{{busy?'正在处理…':!hero.nextStats?'英雄已满级':'升至 '+(hero.level+1)+' 级 · '+hero.upgradeExp+' 经验'}}</button>
            <small class="fineprint">绿色数字为升级增长；星级和天赋影响成长。</small>
            <h3>随身道具</h3><IconInventoryPicker :options="consumables" label="随身道具" compact :preview="false" :heading="false" :disabled="locked" empty-text="暂无可用道具" @update:model-value="useFromBag" @activate="useFromBag"/>
            <small class="fineprint">点击道具使用；悬停查看说明。</small>
            <div class="danger-actions"><button type="button" :disabled="locked" data-game-hint="直接流放，等级、经验、天赋及技能不返还；装备宝物退回包裹。" @click="retire('EXILE')">流放</button><button type="button" :disabled="locked" class="danger-button" data-game-hint="直接斩首，等级、经验、天赋及技能不返还；装备宝物退回包裹。" @click="retire('EXECUTE')">斩首</button></div>
          </section>
          <section v-else class="hero-skill-operations" aria-label="技能操作"><h3>技能槽 {{skillSlot}}</h3><p v-if="skillSlot>hero.unlockedSlots" class="fineprint">{{slotUnlockLevel(hero.star,skillSlot)}} 级解锁此槽。六星最多四槽、五星三槽，其余两槽。</p><template v-else><div v-if="learned" class="skill-detail-heading"><AssetIcon :name="learned.name" :icon-key="learned.iconKey" :quality="learned.qualityTier"/><div><h3>{{learned.name}} · {{learned.level}} 级</h3><p>{{label(modeLabels,learned.mode)}} · 触发 {{percent(learned.triggerRate)}}% · 效果 {{Number(learned.effectValue.toFixed(2))}}%</p></div></div><p v-if="learned" class="skill-description">{{learned.description}}</p><div v-if="learned&&learned.level<learned.maxLevel" class="skill-growth"><span>升一级：触发 {{percent(learned.triggerRate)}}% → <b>{{percent(learned.nextTriggerRate)}}%</b></span><span>效果 {{Number(learned.effectValue.toFixed(2))}}% → <b>{{Number(learned.nextEffectValue?.toFixed(2))}}%</b></span><button class="primary" :disabled="!canUpgrade" @click="command('/skills/upgrade',{slot:skillSlot})">升级技能 · {{learned.sameBookCost??1}} 本同名书 ＋ {{learned.upgradeExp}} 经验</button><small>持有同名书 {{upgradeBookCount}} 本 · 可用经验 {{hero.experience}}</small></div><p v-else-if="learned">此技能已满级</p><IconInventoryPicker v-model="bookChoice" label="选择技能书" compact :preview="false" :options="availableBooks" :disabled="locked" empty-text="暂无可学习的技能书，可到酒馆获取。"/><div class="learn-row"><button :disabled="locked||!availableBooks.some(b=>b.id===bookChoice)" @click="learn">{{learned?'替换技能':'学习技能'}}</button><button disabled data-game-hint="技能书交易尚未开放">交易</button></div><p class="fineprint">初学 0 级，最高 10 级。替换会失去原技能等级。缺少兵种、城防或俘虏目标时，战报会说明技能未生效原因。</p></template></section>
        </aside>
      </div>
    </div>

  </div><p v-else class="empty">还没有英雄，先到酒馆招募。</p>
</template>

<style scoped>
/* A readable, medium-size character sheet. Keep the same scale in every tab. */
.hero-workbench{
  --hero-slot-size:60px;
  --hero-portrait-width:146px;
  --hero-portrait-height:162px;
  max-width:1240px;
  margin:auto;
  grid-template-columns:190px minmax(0,1fr);
  gap:14px;
}
.hero-workbench .hero-sheet{min-width:0}
.hero-workbench .hero-body{
  grid-template-columns:minmax(0,7fr) minmax(0,3fr);
  justify-content:center;
  padding:20px;
  gap:22px;
  align-items:start;
}
.hero-workbench .hero-doll{
  max-width:520px;
  grid-template-columns:var(--hero-slot-size) minmax(0,1fr) var(--hero-slot-size);
  gap:8px;
}
.hero-workbench .hero-center{min-width:0;padding:0 5px}
.hero-workbench .hero-center :deep(.icon-large){width:var(--hero-portrait-width);height:var(--hero-portrait-height);max-width:100%}
.hero-workbench .hero-center h2{margin:9px 0 5px;font-size:24px}
.shell .hero-name{border:0;background:none;box-shadow:none;padding:0;min-height:28px;font:inherit;color:#e6d19a;overflow-wrap:anywhere}
.shell .hero-name:hover:not(:disabled){background:none;color:#ffdf81;box-shadow:none}
.hero-workbench .gear-column{padding:0;gap:8px}
.shell .hero-workbench .gear-cell{width:var(--hero-slot-size);min-height:var(--hero-slot-size)}
.hero-workbench .gear-cell :deep(.asset-icon){width:100%;height:calc(var(--hero-slot-size) - 2px)}
.hero-workbench .empty-gear{min-height:calc(var(--hero-slot-size) - 2px);font-size:13px;letter-spacing:0}
.hero-workbench .gear-cell>small{font-size:12px}
.hero-workbench .hero-center .stars{font-size:15px;margin:7px 0;letter-spacing:2px}
.hero-workbench .hero-center .stars span{font-size:13px}
.hero-workbench .hero-stats{font-size:14px;margin:12px 0;gap:10px 14px}
.hero-workbench .hero-stats div{flex-wrap:wrap;column-gap:5px}
.hero-workbench .hero-stats b{white-space:nowrap}
.hero-workbench .experience-track{width:min(220px,100%);margin:9px auto 5px;height:9px}
.hero-workbench .hero-center>small{display:block;font-size:12px;line-height:1.6}

.shell .hero-workbench .hero-portrait{display:inline-flex;padding:0;border:0;background:none;box-shadow:none;min-height:0}
.hero-talent,.inspector-talent{display:flex;align-items:center;justify-content:center;gap:5px;font-size:14px;min-height:30px}
.hero-workbench .talent-label{color:#a6a68a}
.shell .hero-workbench button.talent-value{padding:0 3px;border:0;box-shadow:none;background:none;min-height:24px;font-size:14px;color:#8ecc83;text-decoration:underline;text-underline-offset:4px;text-decoration-color:#8ecc8355}
.shell .hero-workbench button.talent-value:hover:not(:disabled){color:#c6eea5;background:none}
.hero-workbench .talent-value.perfect{color:#f0cf71;font-weight:bold}

.hero-inspector{min-width:0;max-height:660px;overflow:auto;overscroll-behavior:contain;scrollbar-color:#71673f #161b12;border:1px solid #716342;background:linear-gradient(135deg,#262b1e,#121910);box-shadow:inset 0 0 0 2px #10160c}
.hero-inspector .inspector-heading{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:11px 12px;border-bottom:1px solid #75623f;background:linear-gradient(#403e2a,#24291b)}
.hero-inspector .inspector-heading h3{margin:0;padding:0;border:0;font-size:16px}
.hero-inspector .inspector-heading small{font-size:10px;color:#999a7c}
.shell .hero-inspector .inspector-heading button{font-size:11px;padding:4px 7px;min-height:26px;white-space:nowrap}
.hero-overview,.hero-skill-operations{min-width:0;padding:14px;display:flex;flex-direction:column;gap:12px}
.hero-overview>h3,.hero-skill-operations>h3{font-size:15px;margin:0}
.inspector-talent{justify-content:flex-start;flex-wrap:wrap}
.inspector-talent small{margin-left:auto;color:#9fa487;font-size:11px}
.hero-inspector .talent-odds{display:grid;grid-template-columns:1fr 1fr;gap:7px 12px;font-size:11px;margin:0}
.hero-inspector .talent-odds span{display:flex;justify-content:space-between;gap:4px}
.hero-inspector .status-line{font-size:13px}
.hero-inspector .upgrade-preview{display:block;font-size:13px}
.hero-inspector .upgrade-preview>div{grid-template-columns:30px minmax(0,1fr) minmax(0,1fr);padding:7px 0;gap:5px}
.hero-inspector .fineprint{margin:0;text-align:left;font-size:11px;line-height:1.7}
.shell .hero-inspector .train-hero{width:100%;font-size:13px;padding:8px}
.hero-inspector .danger-actions{margin-top:3px}
.hero-inspector .skill-detail-heading{align-items:flex-start;gap:10px}
.hero-inspector .skill-detail-heading h3{font-size:16px;line-height:1.5}
.hero-inspector .skill-detail-heading p{font-size:12px;line-height:1.7;margin:3px 0}
.hero-inspector .skill-detail-heading :deep(.asset-icon){width:50px;height:50px}
.hero-inspector .skill-description{font-size:13px;line-height:1.9;margin:0}
.hero-inspector .skill-growth{display:flex;flex-direction:column;align-items:stretch;padding:10px 0;font-size:12px;gap:9px}
.hero-inspector .skill-growth small{line-height:1.7}
.shell .hero-inspector .skill-growth button{font-size:12px}
.hero-inspector .learn-row{display:flex;flex-wrap:wrap;gap:8px}
.hero-inspector .learn-row>button{flex:1}
.hero-inspector :deep(.armory){border:0;box-shadow:none;background:none}
.hero-inspector :deep(.armory-footer){flex-wrap:wrap}
.hero-workbench .hero-skill-bar{padding-top:10px}
.hero-workbench .treasure-row,.hero-workbench .hero-skill-bar{gap:8px;margin-top:2px;flex-wrap:wrap}
.hero-workbench .sheet-title{padding:12px 18px;font-size:16px}
.hero-workbench .sheet-title small{font-size:12px}
.hero-workbench .hero-sidebar{padding:13px 9px}
.hero-workbench .hero-sidebar h3{font-size:17px}
.hero-workbench .hero-sidebar input{font-size:14px}
.shell .hero-workbench .hero-list-item{gap:10px;padding:10px 7px}
.hero-workbench .hero-list-item :deep(.asset-icon){width:44px;height:50px}
.hero-workbench .hero-list-item b{font-size:15px}
.hero-workbench .hero-list-item small{font-size:12px;line-height:1.5}
@media(max-width:1100px){
  .hero-workbench{grid-template-columns:180px minmax(0,1fr)}
  .hero-workbench .hero-body{grid-template-columns:minmax(0,1fr);padding:20px;gap:20px}
  .hero-workbench .hero-doll{max-width:430px;margin:auto}
  .hero-workbench .hero-inspector{max-height:none}
}
@media(max-width:760px){
  .hero-workbench{grid-template-columns:minmax(0,1fr)}
  .hero-workbench .hero-sidebar{position:static}
  .hero-workbench .hero-list{display:flex;overflow:auto;max-height:150px}
  .shell .hero-workbench .hero-list-item{min-width:180px;width:auto;flex:none}
  .hero-workbench .hero-body{padding:18px 12px}
  .hero-workbench .sheet-title{flex-wrap:wrap}
}
@media(max-width:420px){
  .hero-workbench{--hero-slot-size:52px;--hero-portrait-width:128px;--hero-portrait-height:142px}
  .hero-workbench .hero-doll{gap:8px}
  .hero-workbench .hero-stats{font-size:13px;gap:8px}
  .hero-workbench .treasure-row,.hero-workbench .hero-skill-bar{gap:8px}
}
</style>

<style scoped>.gear-cell{position:relative}.gear-level{position:absolute;right:2px;bottom:2px;background:#10150fe8;color:#ffe39a;font:12px/17px system-ui;padding:0 3px;pointer-events:none;text-shadow:0 1px #000}.equipment-summary>div{display:flex;justify-content:space-between;gap:5px;font-size:12px;line-height:2}.equipment-summary b,.set-active{color:#9fce7d}.equipment-summary small{font-weight:normal}.set-summary{border-top:1px solid #454b31;margin-top:10px;padding-top:4px}.set-summary h4{margin:8px 0;color:#d6bd75}.set-summary p{font-size:11px;line-height:1.8;margin:4px 0}.set-summary small{display:block}.set-inactive{color:#858585!important}</style>
