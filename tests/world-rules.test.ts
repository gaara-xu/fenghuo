import {describe,it,expect} from 'vitest'
import {MAX_OWNED_HEROES,outpostLevel,outpostDefense,outpostDropFactor,outpostAfterAttack,OUTPOST_LEVEL_WEIGHTS,rollOutpostLevel} from '../shared/world-rules'
import {cleanSkillDescription} from '../shared/skill-copy'
import {bagCategory,bagCategories} from '../shared/inventory'
import type {ItemDefinition} from '../shared/items'
describe('据点与界面规则',()=>{
  it('最多6英雄、据点封顶20；每次攻击降1级直到消失',()=>{expect(MAX_OWNED_HEROES).toBe(6);expect(outpostLevel(100)).toBe(20);for(let n=20;n>0;n--)expect(outpostAfterAttack(n).level).toBe(n-1);expect(outpostAfterAttack(1)).toEqual({level:0,power:0,status:'DEPLETED'});expect(outpostAfterAttack(0).level).toBe(0)})
  it('据点刷新提高高等级权重，16至20级合计60%，20级12%，低级仍能出现',()=>{
    expect(OUTPOST_LEVEL_WEIGHTS).toHaveLength(20);expect(OUTPOST_LEVEL_WEIGHTS.reduce((a,b)=>a+b,0)).toBe(100)
    const counts=Array(20).fill(0);for(let i=0;i<10000;i++)counts[rollOutpostLevel((i+.5)/10000)-1]++
    expect(counts).toEqual(OUTPOST_LEVEL_WEIGHTS.map(w=>w*100));expect(counts.slice(15).reduce((a,b)=>a+b,0)).toBe(6000);expect(counts[19]).toBe(1200)
  })
  it('据点刷新边界始终1至20级，拒绝非法随机输入',()=>{
    for(const [draw,level] of [[0,1],[.04999,5],[.05,6],[.15,11],[.4,16],[.88,20],[1-Number.EPSILON,20]])expect(rollOutpostLevel(draw)).toBe(level)
    for(const draw of [-.1,1,NaN,Infinity])expect(()=>rollOutpostLevel(draw)).toThrow('随机数')
  })
  it('等级越高守军与掉率越高，20级守军超过四百万',()=>{for(let n=1;n<20;n++){expect(outpostDefense(n+1)).toBeGreaterThan(outpostDefense(n));expect(outpostDropFactor(n+1)).toBeGreaterThan(outpostDropFactor(n))}expect(outpostDefense(20)).toBe(4010000);expect(outpostDropFactor(1)).toBe(.25);expect(outpostDropFactor(20)).toBe(1);expect(outpostDropFactor(0)).toBe(0)})
  it('只删除已知考证旁白，保留玩法数字、自定义效果与等级说明',()=>{const base='进攻时提升近攻，满级60%。';for(const note of ['10级参数据腾讯官网；0—9级与经验曲线为估算。','（10级参数据腾讯官网；0—9级与经验曲线为估算。）'])expect(cleanSkillDescription(base+note)).toBe(base);expect(cleanSkillDescription('10级提升60%，0—9级逐级成长。')).toBe('10级提升60%，0—9级逐级成长。')})
  it('包裹四类，经验书、天赋水及材料归入消耗品',()=>{expect(Object.values(bagCategories)).toEqual(['装备','技能书','宝物','消耗品']);for(const kind of ['EXPERIENCE','TALENT'])expect(bagCategory({itemType:'CONSUMABLE',effectConfig:{kind}} as ItemDefinition)).toBe('CONSUMABLE');expect(bagCategory({itemType:'MATERIAL'} as ItemDefinition)).toBe('CONSUMABLE');expect(bagCategory({itemType:'SKILL_BOOK'} as ItemDefinition)).toBe('SKILL_BOOK')})
})
