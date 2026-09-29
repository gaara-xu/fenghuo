import {afterEach,describe,expect,it,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {createSSRApp} from 'vue'
import {renderToString} from '@vue/server-renderer'
import {officialSkills} from '../shared/skill-catalog'
import {officialItems} from '../shared/official-catalog'
import {artUrl,iconNames} from '../web/art'
import {inventoryChoice} from '../web/item-choices'
import IconInventoryPicker from '../web/IconInventoryPicker.vue'
import AssetIcon from '../web/AssetIcon.vue'
const render=(component:any,props:any)=>renderToString(createSSRApp(component,props))
afterEach(()=>vi.unstubAllGlobals())
describe('44技能大小图',()=>{
 it('每个技能都有独立64px与256px PNG，不复用占位图',()=>{
  const hashes=new Set<string>();expect(Object.keys(iconNames)).toHaveLength(44)
  for(const [key] of officialSkills){for(const [size,px] of [['small',64],['large',256]] as const){const url=artUrl(key,true,size),data=readFileSync('public'+url);expect(url).toContain(key+'-'+size);expect(data.subarray(1,4).toString()).toBe('PNG');expect(data.readUInt32BE(16)).toBe(px);expect(data.readUInt32BE(20)).toBe(px);if(size==='small')hashes.add(createHash('sha256').update(data).digest('hex'))}}
  expect(hashes.size).toBe(44)
  const manifest=JSON.parse(readFileSync('public/art/skills-generation-20260916.json','utf8'));expect(manifest.status).toBe('imported');expect(manifest.assets).toHaveLength(37)
  for(const a of manifest.assets){expect(a.imported).toBe(true);expect(createHash('sha256').update(readFileSync('public/art/skills/originals/'+a.key+'.png')).digest('hex')).toBe(a.sha256)}
 // This reads and hashes all original PNGs as well; bind-mounted update releases can have slow disk I/O.
 },30000)
 it('小图、大图按显示区域选用，英雄原头像路径不变',async()=>{
  expect(await render(AssetIcon,{name:'鼓舞',iconKey:'guwu',size:'tiny'})).toContain('/art/skills/guwu-small.png')
  expect(await render(AssetIcon,{name:'鼓舞',iconKey:'guwu',size:'large'})).toContain('/art/skills/guwu-large.png')
  expect(artUrl('youxia')).toBe('/art/youxia.png')
 })
})
describe('包裹式选择界面',()=>{
 it('图标列表没有下拉框；支持选择、禁用、品质与详情大图',async()=>{
  const options=[{id:1,name:'鼓舞',quality:7,iconKey:'guwu',detail:'提升己方攻击。',badge:'3',lines:['技能书']}]
  const html=await render(IconInventoryPicker,{modelValue:1,options,label:'选择技能书',disabled:true})
  expect(html).not.toMatch(/<select|combobox|game-select/);expect(html).toContain('bag-grid');expect(html).toContain('aria-pressed="true"');expect(html).toContain('disabled');expect(html).toContain('quality-7');expect(html).toContain('guwu-small.png');expect(html).toContain('guwu-large.png');expect(html).toContain('提升己方攻击。')
 })
 it('同款精炼实例是独立选项，详情显示当前属性、宝石、套装与数量',async()=>{
  const item={...officialItems[0],id:10},gear={instanceId:1,refineLevel:2,sockets:1,gems:[{itemId:5,name:'近防宝石',stat:'meleeDefense' as const,amount:300}]}
  const a=inventoryChoice({item,gear,quantity:1}),b=inventoryChoice({item,gear:{...gear,instanceId:2,refineLevel:4},quantity:1})
  expect([a.id,b.id]).toEqual([-1,-2]);expect(a.badge).toBe('+2');expect(a.lines?.join(' ')).toContain('近防宝石');expect(a.lines?.join(' ')).toContain('套装')
  const html=await render(IconInventoryPicker,{options:[a,b],modelValue:-2,label:'选择头盔'})
  expect(html).toContain('+2');expect(html).toContain('+4');expect(html).toContain('精炼 +4')
 })
 it('空包裹有空槽与提示，英雄页的全部选择器改为同一组件',async()=>{
  expect(await render(IconInventoryPicker,{options:[],label:'选择宝物',emptyText:'暂无宝物'})).toContain('暂无宝物')
  for(const file of ['web/HeroRoster.vue','web/EquipmentForge.vue']){const code=readFileSync(file,'utf8');expect(code).toContain('IconInventoryPicker');expect(code).not.toContain('GameSelect')}
  const app=readFileSync('web/App.vue','utf8');expect(app).toContain("['treasury','藏宝阁']")
 })
})
