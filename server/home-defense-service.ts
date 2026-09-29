import type {Pool,PoolConnection,RowDataPacket} from 'mysql2/promise'
import {config} from './config.js'
import {getPool} from './db.js'
import {getEquipment} from './item-service.js'
import {getGrowthRules,statsFromRow} from './growth-service.js'
import {mapSkillRow} from './game-service.js'
import {learnedSkill,unlockedSkillSlots} from './domain/skills.js'
import {equipmentBonuses,equipmentFlatBonuses} from '../shared/items.js'
import type {ArmyStack,DefenseHero} from '../shared/military.js'
import type {CombatSkill} from '../shared/contracts.js'

// Callers settling a battle hold the player lock, then lock all participating heroes.
// Active farm heroes are reserved even between trips; paused farms still have to return.
export async function homeHeroArmy(c:Pool|PoolConnection=getPool(),lock=false){
  const [rows]=await c.query<RowDataPacket[]>(`SELECT h.*,o.id owned_hero_id,o.level,o.talent_grade,COALESCE(o.custom_name,h.name) hero_name
    FROM owned_heroes o JOIN hero_definitions h ON h.id=o.hero_definition_id
    WHERE o.player_id=? AND o.retired_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM march_orders m WHERE m.owned_hero_id=o.id AND m.status IN ('MARCHING','FIGHTING','RETURNING'))
    AND NOT EXISTS (SELECT 1 FROM auto_farm_jobs j WHERE j.owned_hero_id=o.id AND j.status='ACTIVE')
    ORDER BY o.id${lock?' FOR UPDATE':''}`,[config.PLAYER_ID])
  if(!rows.length)return {army:[] as ArmyStack[],skills:[] as CombatSkill[],heroes:[] as DefenseHero[]}
  const growth=await getGrowthRules(c),equipment=await getEquipment(c)
  const [learned]=await c.query<RowDataPacket[]>(`SELECT s.*,k.owned_hero_id,k.slot_no,k.skill_level,l.effect_value
    FROM owned_hero_skills k JOIN owned_heroes o ON o.id=k.owned_hero_id
    JOIN skill_definitions s ON s.id=k.skill_definition_id
    LEFT JOIN skill_levels l ON l.skill_definition_id=s.id AND l.level=k.skill_level
    WHERE o.player_id=? AND o.retired_at IS NULL AND s.enabled=1 ORDER BY k.owned_hero_id,k.slot_no`,[config.PLAYER_ID])
  const army:ArmyStack[]=[],skills:CombatSkill[]=[],heroes:DefenseHero[]=[]
  for(const h of rows){
    const id=Number(h.owned_hero_id),code='hero_'+id,equipped=equipment.filter(e=>e.heroId===id)
    const stats=statsFromRow(h,growth,Number(h.level),equipmentBonuses(equipped),equipmentFlatBonuses(equipped))
    army.push({code,name:h.hero_name,kind:'HERO',quantity:1,stats})
    heroes.push({heroId:id,name:h.hero_name,meleeDefense:stats.meleeDefense*2,rangedDefense:stats.rangedDefense*2})
    for(const s of learned.filter(s=>Number(s.owned_hero_id)===id&&Number(s.slot_no)>=1&&Number(s.slot_no)<=unlockedSkillSlots(Number(h.star),Number(h.level)))){
      const skill=learnedSkill(mapSkillRow(s),Number(s.skill_level),Number(s.slot_no))
      if(s.effect_value!=null)skill.effectValue=Number(s.effect_value)
      skills.push({...skill,ownerCode:code,ownerName:h.hero_name})
    }
  }
  return {army,skills,heroes}
}
