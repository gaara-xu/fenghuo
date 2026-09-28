import {gameNotice} from './game-dialog'
export function validationMessage(field:Pick<HTMLInputElement,'validity'|'min'|'max'|'minLength'|'maxLength'>){
 if(field.validity.valueMissing)return '此项不能为空。'
 if(field.validity.badInput||field.validity.typeMismatch)return '请输入有效的内容。'
 if(field.validity.rangeUnderflow)return '数值不能小于 '+field.min+'。'
 if(field.validity.rangeOverflow)return '数值不能大于 '+field.max+'。'
 if(field.validity.stepMismatch)return '请输入符合步长的数值。'
 if(field.validity.tooLong)return '内容不能超过 '+field.maxLength+' 个字符。'
 if(field.validity.tooShort)return '内容至少需要 '+field.minLength+' 个字符。'
 return '请检查此项内容后重试。'
}
export function installGameValidation(){let showing=false;document.addEventListener('invalid',event=>{event.preventDefault();const field=event.target;if(showing||!(field instanceof HTMLInputElement||field instanceof HTMLTextAreaElement))return;showing=true;queueMicrotask(()=>{showing=false});const name=field.getAttribute('aria-label')??field.labels?.[0]?.textContent?.trim().slice(0,32)??'输入内容';gameNotice(name+'\n'+validationMessage(field as HTMLInputElement));if(field.isConnected)field.focus()},true)}
