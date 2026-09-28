import {afterEach,describe,it,expect,vi} from 'vitest'
import {createSSRApp} from 'vue'
import {renderToString} from '@vue/server-renderer'
import AssetIcon from '../web/AssetIcon.vue'
import HeroRoster from '../web/HeroRoster.vue'
import EquipmentForge from '../web/EquipmentForge.vue'
import InventoryBag from '../web/InventoryBag.vue'
import ItemEffectFields from '../web/ItemEffectFields.vue'
import {officialItems,officialHeroKeys,forgeMaterials} from '../shared/official-catalog'
const item={...officialItems[0],id:10},gear={instanceId:1,refineLevel:2,sockets:1,gems:[]},equipped={heroId:1,slot:'HELMET',item,gear}
const render=(component:any,props:any)=>renderToString(createSSRApp(component,props))
afterEach(()=>vi.unstubAllGlobals())
describe('装备界面无浏览器渲染验证',()=>{
 it('所有原版头像使用本地精灵图，装备使用自己的原图',async()=>{
  for(const key of officialHeroKeys){const html=await render(AssetIcon,{name:key,iconKey:key,hero:true});expect(html).toContain('/art/official/hero_intro.jpg');expect(html).not.toContain('待配图')}
  expect(await render(AssetIcon,{name:item.name,imageUrl:item.effectConfig.icon})).toContain(item.effectConfig.icon)
 })
 it('英雄页面包含十三装备槽和两宝物槽',async()=>{
  vi.stubGlobal('sessionStorage',{getItem:()=>null,setItem:()=>{}})
  const stats={meleeAttack:100,rangedAttack:100,meleeDefense:100,rangedDefense:100,speed:100,loadCapacity:100}
  const hero={id:1,name:'章邯',originalName:'章邯',portraitKey:'zhang_han',star:6,level:5,talentGrade:'COMMON',experience:100,upgradeExp:500,stamina:100,stats,nextStats:stats,skills:[],equipment:[equipped],unlockedSlots:2,busy:false}
  const html=await render(HeroRoster,{world:{ownedHeroes:[hero],inventory:[],skillBooks:[]},skills:[],busy:false})
  for(const name of ['武器','防具','坐骑','右戒指','右手镯','宝物一','宝物二'])expect(html).toContain(name)
 })
 it('工坊实际渲染精炼、打孔和镶嵌入口',async()=>{
  const html=await render(EquipmentForge,{equipment:equipped,inventory:forgeMaterials.map((item,n)=>({item:{...item,id:n+1},quantity:3})),locked:false})
  for(const text of ['精炼','打孔','镶嵌','空孔','未打孔'])expect(html).toContain(text)
 })
 it('两件同款装备在包裹里都有独立图标及精炼标记',async()=>{
  const html=await render(InventoryBag,{inventory:[{item,quantity:1,gear},{item,quantity:1,gear:{...gear,instanceId:2,refineLevel:4}}],skills:[]})
  expect(html.split('src="'+item.effectConfig.icon+'"')).toHaveLength(3);expect(html).toContain('+2');expect(html).toContain('+4')
 })
 it('后台属性编辑器正常渲染套装配置',async()=>{
  const html=await render(ItemEffectFields,{form:structuredClone(item)})
  expect(html).toContain('套装效果');expect(html).toContain('固定加成')
 })
})
