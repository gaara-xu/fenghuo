// Source/estimation notes belong in documentation and source_status, never in effect text.
export function cleanSkillDescription(value:string):string {
  return value
    .replace(/[（(]?10\s*级参数[据参照自来源于]*腾讯官网[；;，,]\s*0\s*[—–－-]\s*9\s*级与经验曲线为估算[。.]?[）)]?[。.]?/g,'')
    .replace(/官网标注此技能当时未开放，默认停用。/g,'')
    .trim()
}
