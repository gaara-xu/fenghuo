import {readFileSync} from 'node:fs'
import {parse,compileScript} from '@vue/compiler-sfc'
import ts from 'typescript'
import * as Vue from 'vue'

// Vitest's Node pipeline normally compiles .vue for SSR. Compile the same source for a custom
// client renderer so its actual mouse, focus, v-model and Teleport handlers can be exercised.
export function clientComponent(file:string,dependencies:Record<string,unknown>={}){
  const {descriptor}=parse(readFileSync(file,'utf8'),{filename:file})
  const source=compileScript(descriptor,{id:'interaction-test',inlineTemplate:true}).content
  const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText
  const result:{default?:any}={},modules={vue:Vue,...dependencies}
  new Function('require','exports',js)((name:string)=>{if(!(name in modules))throw Error('Missing test dependency '+name);return modules[name as keyof typeof modules]},result)
  return result.default
}
