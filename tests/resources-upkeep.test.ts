import {describe,it,expect} from 'vitest'
import {createSSRApp} from 'vue'
import {renderToString} from '@vue/server-renderer'
import {randomUUID} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {grantSchema} from '../server/routes/resources'
import {emptyResources,MAX_RESOURCE_GRANT} from '../shared/resources'
import {foodCharge,foodRates,productionSoldierHours} from '../shared/upkeep'
import ResourceGrant from '../web/ResourceGrant.vue'
import FoodStatus from '../web/FoodStatus.vue'
describe('管理员资源与军粮规则',()=>{
 it('只接受非负整数，至少一项，每项不超过十亿，未填项为零',()=>{const clientActionId=randomUUID();expect(grantSchema.parse({clientActionId,amounts:{food:1}}).amounts).toEqual({...emptyResources(),food:1});for(const amounts of [{},{food:-1},{gold:1.2},{iron:MAX_RESOURCE_GRANT+1},{food:1,unexpected:9}])expect(grantSchema.safeParse({clientActionId,amounts}).success).toBe(false)})
 it('军粮表遵循旧资料，重甲50、骑兵12，城防不耗粮',()=>{expect(foodRates.heavy_general).toBe(50);expect(foodRates.lance_cavalry).toBe(12);expect(foodRates.mounted_archer).toBe(12);expect(foodRates.wall??0).toBe(0)})
 it('逐个生产按各自完成时刻计费，已完工库存不重复积分',()=>{const hour=3600000;expect(productionSoldierHours(0,3600,0,3,0,3*hour)).toBe(3);expect(productionSoldierHours(0,3600,0,3,hour,3*hour)).toBe(3);expect(productionSoldierHours(0,3600,1,3,hour,3*hour)).toBe(1);expect(productionSoldierHours(0,3600,3,3,3*hour,4*hour)).toBe(0)})
 it('训练未完成不耗粮，零时差和时间倒退不收费',()=>{expect(productionSoldierHours(1000,10,0,5,0,9999)).toBe(0);expect(productionSoldierHours(0,10,0,5,5000,5000)).toBe(0);expect(productionSoldierHours(0,10,0,5,50000,5000)).toBe(0)})
 it('不足一粮保留小数，频繁结算不会吞掉耗粮',()=>{let food=100,fraction=0;for(let i=0;i<3600;i++){const result=foodCharge(food,fraction,1/3600);food=result.food;fraction=result.fraction}expect(food).toBe(99);expect(fraction).toBeCloseTo(0,6)})
 it('缺粮清零不负数，不积累欠款；补粮后不会追扣',()=>{expect(foodCharge(2,.5,100)).toEqual({paid:2,food:0,fraction:0});expect(foodCharge(0,0,1000)).toEqual({paid:0,food:0,fraction:0});expect(foodCharge(10,0,1)).toEqual({paid:1,food:9,fraction:0})})
 it('资源表及军粮表完整同步结构文件',()=>{const schema=readFileSync('database/schema.sql','utf8');for(const name of ['0012_admin_resources','0013_military_upkeep'])expect(schema).toContain(readFileSync('database/migrations/'+name+'.sql','utf8').trim())})
 it('后台入口包含六种资源和添加按钮，不自动提交预设值',async()=>{const html=await renderToString(createSSRApp(ResourceGrant,{wallet:{food:1,wood:2,stone:3,iron:4,gold:5,coupon:6}}));for(const t of ['添加粮食','添加木材','添加石料','添加铁矿','添加金币','添加点券','添加资源','最近添加记录'])expect(html).toContain(t);expect(html).toContain('disabled')})
 it('前台军粮告急只作提示，不承诺损兵或取消行军',async()=>{const html=await renderToString(createSSRApp(FoodStatus,{upkeep:{hourly:500,food:0,shortage:true,lastGameAt:new Date().toISOString()}}));expect(html).toContain('军粮告急');expect(html).toContain('不损兵、不停止行军、不产生欠账')})
})
