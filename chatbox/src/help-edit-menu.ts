import type {ObjectCommand} from './ObjectMenu';
import {t} from './i18n';

/** Giữ các thao tác soạn thảo cơ bản khi menu chung thay menu WebView. */
export function helpEditCommands(target:Element):ObjectCommand[]{
 if(!(target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement))return [];
 if(target instanceof HTMLInputElement&&!['text','search','url','tel','password'].includes(target.type))return [];
 const start=target.selectionStart??0,end=target.selectionEnd??0;
 const secret=target instanceof HTMLInputElement&&target.type==='password';
 const replace=(text:string,before:string)=>{
  if(!target.isConnected||target.value!==before)throw Error(t('Ô nhập đã thay đổi. Hãy mở lại menu.'));
  const value=before.slice(0,start)+text+before.slice(end);
  const prototype=target instanceof HTMLInputElement?HTMLInputElement.prototype:HTMLTextAreaElement.prototype;
  Object.getOwnPropertyDescriptor(prototype,'value')!.set!.call(target,value);
  target.dispatchEvent(new Event('input',{bubbles:true}));target.focus();target.setSelectionRange?.(start+text.length,start+text.length);
 };
 return [
  ...(!secret?[{id:'copy',label:t('Sao chép'),disabledReason:start===end?t('Chưa chọn chữ'):undefined,run:()=>navigator.clipboard.writeText(target.value.slice(start,end))}]:[]),
  ...(!secret&&!target.readOnly&&!target.disabled?[{id:'cut',label:t('Cắt'),disabledReason:start===end?t('Chưa chọn chữ'):undefined,run:async()=>{const before=target.value;await navigator.clipboard.writeText(before.slice(start,end));replace('',before);}}]:[]),
  ...(!target.readOnly&&!target.disabled?[{id:'paste',label:t('Dán'),run:async()=>{const before=target.value;const text=await navigator.clipboard.readText();replace(text,before);}}]:[]),
  {id:'select-all',label:t('Chọn tất cả'),run:()=>{target.focus();target.select();}},
 ];
}
