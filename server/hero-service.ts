import type { PoolConnection,RowDataPacket,ResultSetHeader } from 'mysql2/promise'
import { config } from './config.js'
import { inTransaction } from './db.js'
import { unlockedSkillSlots } from './domain/skills.js'

export async function renameHero(heroId:number,name:string,clientActionId:string):Promise<void>{
  const cleaned=typeof name==='string'?name.trim():''
  if(!cleaned||cleaned.length>32)throw new Error('名字需为1至32个字符')
  if(!clientActionId)throw Error('缺少请求标识')
  await inTransaction(async c=>{
    const hero=await lockAvailableHero(c,heroId)
    const [done]=await c.query<RowDataPacket[]>('SELECT * FROM item_use_logs WHERE client_action_id=?',[clientActionId])
    if(done[0]){const result=typeof done[0].result_json==='string'?JSON.parse(done[0].result_json):done[0].result_json;if(Number(done[0].player_id)!==config.PLAYER_ID||Number(done[0].owned_hero_id)!==heroId||result.operation!=='RENAME'||result.name!==cleaned)throw Error('重复请求标识不匹配');return}
    const [names]=await c.query<RowDataPacket[]>('SELECT name FROM hero_definitions WHERE id=?',[hero.hero_definition_id])
    if((hero.custom_name??names[0]?.name)===cleaned)throw Error('新名字与当前名字相同')
    const [cards]=await c.query<RowDataPacket[]>("SELECT i.id FROM item_definitions i JOIN player_inventory p ON p.item_definition_id=i.id WHERE p.player_id=? AND p.quantity>0 AND i.item_type='CONSUMABLE' AND i.enabled=1 AND i.deleted_at IS NULL AND JSON_UNQUOTE(JSON_EXTRACT(i.effect_config,'$.kind'))='RENAME' ORDER BY i.id LIMIT 1 FOR UPDATE",[config.PLAYER_ID])
    if(!cards[0])throw Error('缺少改名卡')
    const [used]=await c.execute<ResultSetHeader>('UPDATE player_inventory SET quantity=quantity-1 WHERE player_id=? AND item_definition_id=? AND quantity>=1',[config.PLAYER_ID,cards[0].id]);if(!used.affectedRows)throw Error('缺少改名卡')
    await c.execute('UPDATE owned_heroes SET custom_name=? WHERE id=?',[cleaned,heroId])
    await c.execute('INSERT INTO item_use_logs (client_action_id,player_id,owned_hero_id,item_definition_id,result_json) VALUES (?,?,?,?,?)',[clientActionId,config.PLAYER_ID,heroId,cards[0].id,JSON.stringify({operation:'RENAME',name:cleaned,consumed:1})])
    await c.execute('INSERT INTO admin_audit_logs (action,entity_type,entity_id,before_json,after_json) VALUES (?,?,?,?,?)',['RENAME','OWNED_HERO',String(heroId),JSON.stringify({name:hero.custom_name}),JSON.stringify({name:cleaned,cardId:cards[0].id})])
  })
}

export async function lockAvailableHero(connection:PoolConnection,heroId:number):Promise<RowDataPacket> {
  const [heroes]=await connection.query<RowDataPacket[]>('SELECT o.*,h.star FROM owned_heroes o JOIN hero_definitions h ON h.id=o.hero_definition_id WHERE o.id=? AND o.player_id=? AND o.retired_at IS NULL FOR UPDATE',[heroId,config.PLAYER_ID])
  if(!heroes[0])throw new Error('英雄不存在')
  const [busy]=await connection.query<RowDataPacket[]>(`SELECT id FROM march_orders WHERE owned_hero_id=? AND status IN ('MARCHING','FIGHTING','RETURNING') UNION ALL SELECT id FROM auto_farm_jobs WHERE owned_hero_id=? AND status='ACTIVE' LIMIT 1`,[heroId,heroId])
  if(busy.length)throw new Error('英雄正在出征，请返城或暂停刷野后操作')
  return heroes[0]
}

// The hero row serializes learning, upgrades and dispatch across browser tabs.
export async function learnHeroSkill(heroId:number,slot:number,skillId:number):Promise<void>{
  await inTransaction(async c=>{
    const hero=await lockAvailableHero(c,heroId)
    if(slot<1||slot>unlockedSkillSlots(Number(hero.star),Number(hero.level)))throw new Error('技能槽尚未解锁，请查看当前武将的解锁等级')
    const [skills]=await c.query<RowDataPacket[]>('SELECT id FROM skill_definitions WHERE id=? AND enabled=1',[skillId]);if(!skills[0])throw new Error('技能不存在或已停用')
    const [existing]=await c.query<RowDataPacket[]>('SELECT slot_no FROM owned_hero_skills WHERE owned_hero_id=? AND skill_definition_id=?',[heroId,skillId]);if(existing.length)throw new Error('该英雄已学习此技能，请使用升级功能')
    const [books]=await c.query<RowDataPacket[]>('SELECT quantity FROM player_skill_books WHERE player_id=? AND skill_definition_id=? FOR UPDATE',[config.PLAYER_ID,skillId]);if(!books[0]||Number(books[0].quantity)<1)throw new Error('缺少对应技能书，请先在酒馆获取')
    await c.execute('UPDATE player_skill_books SET quantity=quantity-1 WHERE player_id=? AND skill_definition_id=?',[config.PLAYER_ID,skillId])
    await c.execute('INSERT INTO owned_hero_skills (owned_hero_id,slot_no,skill_definition_id,skill_level) VALUES (?,?,?,0) ON DUPLICATE KEY UPDATE skill_definition_id=VALUES(skill_definition_id),skill_level=0',[heroId,slot,skillId])
  })
}

export async function upgradeHeroSkill(heroId:number,slot:number):Promise<void>{
  await inTransaction(async c=>{
    const hero=await lockAvailableHero(c,heroId)
    const [rows]=await c.query<RowDataPacket[]>('SELECT os.*,s.max_level FROM owned_hero_skills os JOIN skill_definitions s ON s.id=os.skill_definition_id WHERE os.owned_hero_id=? AND os.slot_no=? AND s.enabled=1',[heroId,slot]);const skill=rows[0]
    if(!skill)throw new Error('技能槽为空或技能已停用')
    if(Number(skill.skill_level)>=Number(skill.max_level))throw new Error('技能已经满级')
    const next=Number(skill.skill_level)+1
    const [levels]=await c.query<RowDataPacket[]>('SELECT upgrade_exp,same_book_cost FROM skill_levels WHERE skill_definition_id=? AND level=?',[skill.skill_definition_id,next])
    const exp=Number(levels[0]?.upgrade_exp??next*100),bookCost=Number(levels[0]?.same_book_cost??1)
    const [books]=await c.query<RowDataPacket[]>('SELECT quantity FROM player_skill_books WHERE player_id=? AND skill_definition_id=? FOR UPDATE',[config.PLAYER_ID,skill.skill_definition_id])
    if(!books[0]||Number(books[0].quantity)<bookCost)throw new Error('相同技能书数量不足')
    if(Number(hero.experience)<exp)throw new Error(`英雄剩余经验不足，需要${exp}点`)
    await c.execute('UPDATE player_skill_books SET quantity=quantity-? WHERE player_id=? AND skill_definition_id=?',[bookCost,config.PLAYER_ID,skill.skill_definition_id])
    await c.execute('UPDATE owned_heroes SET experience=experience-? WHERE id=?',[exp,heroId])
    await c.execute('UPDATE owned_hero_skills SET skill_level=? WHERE owned_hero_id=? AND slot_no=?',[next,heroId,slot])
  })
}

export async function trainHero(heroId:number):Promise<void>{
  await inTransaction(async c=>{
    const hero=await lockAvailableHero(c,heroId),level=Number(hero.level),cost=level*100
    if(level>=20)throw new Error('英雄已经达到20级')
    if(Number(hero.experience)<cost)throw new Error(`升级需要${cost}点剩余经验，可通过出征获取`)
    await c.execute('UPDATE owned_heroes SET level=level+1,experience=experience-? WHERE id=?',[cost,heroId])
  })
}
