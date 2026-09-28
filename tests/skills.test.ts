import { describe,it,expect } from 'vitest'
import { readFileSync,existsSync } from 'node:fs'
import { battleOutcome,heroPower } from '../server/domain/battle'
import { unlockedSkillSlots,learnedSkill } from '../server/domain/skills'
import type { LearnedSkill,SkillDefinition } from '../shared/contracts'
import { label,attackLabels } from '../shared/labels'
import { travelSeconds } from '../server/domain/travel'
const hero={level:5,meleeAttack:100,rangedAttack:80,meleeDefense:100,rangedDefense:100}
function skill(overrides:Partial<LearnedSkill>={}):LearnedSkill{return {slotNo:1,skillDefinitionId:1,name:'热血',level:10,description:'',effectType:'MELEE_ATTACK_PERCENT',targetScope:'SELF_ONE',triggerRate:1,effectValue:60,mode:'ATTACK',maxLevel:10,upgradeExp:100,...overrides}}
describe('旧版技能规则与单英雄适配',()=>{
  it('按用户要求：三星两槽，五星三槽，六星四槽',()=>{expect([1,5,15].map(l=>unlockedSkillSlots(3,l))).toEqual([0,1,2]);expect([0,5,10,15].map(l=>unlockedSkillSlots(6,l))).toEqual([1,2,3,4]);expect(unlockedSkillSlots(5,15)).toBe(3)})
  it('热血仅影响近攻，并与满科技相加',()=>{const r=battleOutcome(hero,400,'x',{attackerSkills:[skill()]});expect(r.basePower).toBe(360);expect(r.heroPower).toBe(420);expect(r.skillEvents[0].triggered).toBe(true)})
  it('精准只影响远攻，狂热影响两者',()=>{expect(battleOutcome(hero,500,'x',{attackerSkills:[skill({effectType:'RANGED_ATTACK_PERCENT'})]}).heroPower).toBe(408);expect(battleOutcome(hero,500,'x',{attackerSkills:[skill({effectType:'ATTACK_PERCENT',effectValue:70})]}).heroPower).toBe(486)})
  it('技能会改变胜负，而不是只生成文字',()=>{expect(battleOutcome(hero,430,'fixed').victory).toBe(false);expect(battleOutcome(hero,430,'fixed',{attackerSkills:[skill({effectType:'ATTACK_PERCENT',effectValue:70})]}).victory).toBe(true)})
  it('防守技能不在出征发动，但可在防方削弱攻击',()=>{const s=skill({name:'腐蚀',mode:'DEFENSE',effectType:'ENEMY_MELEE_ATTACK_REDUCE'});expect(battleOutcome(hero,300,'x',{attackerSkills:[s]}).heroPower).toBe(360);expect(battleOutcome(hero,300,'x',{defenderSkills:[s]}).heroPower).toBe(300)})
  it('同名技能去重，每方最多四个成功触发',()=>{const s=skill({effectType:'ATTACK_PERCENT',effectValue:1});const r=battleOutcome(hero,300,'x',{attackerSkills:[s,s,...Array.from({length:5},(_,i)=>({...s,skillDefinitionId:i+2}))]});expect(r.skillEvents.filter(e=>e.triggered)).toHaveLength(4)})
  it('零触发率不会发动；没有远攻则没有精准目标',()=>{expect(battleOutcome(hero,300,'x',{attackerSkills:[skill({triggerRate:0})]}).heroPower).toBe(360);expect(battleOutcome({...hero,rangedAttack:0},300,'x',{attackerSkills:[skill({effectType:'RANGED_ATTACK_PERCENT'})]}).skillEvents[0].reason).toContain('没有远程')})
  it('纯防御属性不被当作出征攻击',()=>expect(heroPower({...hero,meleeAttack:0,rangedAttack:0})).toBe(0))
  it('技能从0级计算且概率封顶',()=>{const def={id:1,name:'狂热',effectConfig:{base:20,perLevel:5,ratePerLevel:0.05,mode:'ATTACK'},triggerRate:0.5,maxLevel:10} as SkillDefinition;expect(learnedSkill(def,0,1).effectValue).toBe(20);expect(learnedSkill(def,10,1).triggerRate).toBe(1);expect(learnedSkill(def,10,1).effectValue).toBe(70)})
  it('界面定位中文',()=>expect(label(attackLabels,'DEFENSE')).toBe('防御'))
  it('章邯行军略快于神珊珊，速度不会仅作展示',()=>{expect(travelSeconds(50,5000)).toBeLessThan(travelSeconds(50,4900));expect(travelSeconds(50,4900)).toBeLessThan(travelSeconds(50,100));expect(travelSeconds(0,5000)).toBe(1)})
})
describe('图像与升级文件',()=>{
  it('11张独立武将头像与7个技能图标均已保存',()=>{const manifest=JSON.parse(readFileSync('public/art/manifest.json','utf8'));expect(manifest.assets).toHaveLength(18);expect(new Set(manifest.assets.map((a:any)=>a.source)).size).toBe(18);for(const a of manifest.assets)expect(existsSync(a.path)).toBe(true)})
  it('结构快照与迁移都包含初学0级',()=>{expect(readFileSync('database/schema.sql','utf8')).toContain("DEFAULT 0 COMMENT '技能初学为0级");expect(readFileSync('database/migrations/0002_skill_learning.sql','utf8')).toContain('DEFAULT 0')})
  it('内容升级不删除或重置存档，稀有英雄权重最低',()=>{const sql=readFileSync('database/seeds/0002_skills_and_heroes.sql','utf8');expect(sql).not.toMatch(/\b(?:DELETE|DROP|TRUNCATE)\b/i);expect(sql).not.toMatch(/UPDATE\s+(?:resource_wallet|owned_heroes|player_skill_books)/i);expect(sql).toContain("WHEN 'shen_shanshan' THEN 1 WHEN 'zhang_han' THEN 10");expect(sql).toContain('神珊珊')})
})
