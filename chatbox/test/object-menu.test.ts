// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {useObjectMenu} from '../src/ObjectMenu';
let host:HTMLDivElement,root:Root;
const run=vi.fn(),error=vi.fn();
function Demo({context='a',exists=true,disabled=false}:{context?:string;exists?:boolean;disabled?:boolean}){
 const menu=useObjectMenu<string>({contextKey:context,onError:error,commands:id=>exists?[
  {id:'open',label:'Mở '+id,icon:'↗',run:()=>run(id)},
  {id:'remove',label:'Xóa',group:'danger',danger:true,disabledReason:disabled?'Đang chạy':undefined,run:()=>run('remove')},
 ]:[]});
 return React.createElement('div',{...menu.handlers('target'),tabIndex:0,'data-testid':'object'},React.createElement('input'),React.createElement('textarea'),React.createElement('select'),React.createElement('div',{contentEditable:true,suppressContentEditableWarning:true},'text'),menu.trigger('target','Menu'),menu.menu);
}
const render=(props:Parameters<typeof Demo>[0]={})=>act(async()=>root.render(React.createElement(Demo,props)));
const click=async(el:Element)=>act(async()=>{(el as HTMLElement).click();});
const trigger=()=>host.querySelector<HTMLButtonElement>('[aria-label=Menu]')!;
const items=()=>[...document.querySelectorAll<HTMLButtonElement>('[role=menuitem]')];
const key=async(el:Element,key:string,shiftKey=false)=>act(async()=>el.dispatchEvent(new KeyboardEvent('keydown',{key,shiftKey,bubbles:true,cancelable:true})));
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;run.mockReset();error.mockReset();host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();});
it('uses identical commands for right click, ellipsis and Shift+F10, without executing on open',async()=>{
 await render();await click(trigger());const labels=items().map(b=>b.textContent);await key(items()[0]!,'Escape');
 await act(async()=>trigger().dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true})));expect(items().map(b=>b.textContent)).toEqual(labels);await key(items()[0]!,'Escape');
 await key(trigger(),'F10',true);expect(items().map(b=>b.textContent)).toEqual(labels);await key(items()[0]!,'Escape');
 await key(trigger(),'ContextMenu');expect(items().map(b=>b.textContent)).toEqual(labels);expect(run).not.toHaveBeenCalled();
 await act(async()=>{items()[0]!.click();items()[0]?.click();});expect(run).toHaveBeenCalledExactlyOnceWith('target');expect(items()).toHaveLength(0);
});
it('navigates and restores focus, closes outside, on scroll and on context changes',async()=>{
 await render();await click(trigger());expect(document.activeElement).toBe(items()[0]);
 await key(items()[0]!,'ArrowUp');expect(document.activeElement).toBe(items()[1]);await key(items()[1]!,'Home');expect(document.activeElement).toBe(items()[0]);await key(items()[0]!,'End');expect(document.activeElement).toBe(items()[1]);
 await key(items()[1]!,'Escape');expect(document.activeElement).toBe(trigger());expect(items()).toHaveLength(0);
 await click(trigger());await act(async()=>document.body.dispatchEvent(new Event('pointerdown',{bubbles:true})));expect(items()).toHaveLength(0);
 await click(trigger());await act(async()=>window.dispatchEvent(new Event('scroll')));expect(items()).toHaveLength(0);
 await click(trigger());await render({context:'b'});expect(items()).toHaveLength(0);expect(run).not.toHaveBeenCalled();
});
it('rejects disabled or removed commands using the latest props, and catches async failure',async()=>{
 await render();await click(trigger());const remove=items()[1]!;
 await render({disabled:true});await click(remove);expect(run).not.toHaveBeenCalled();expect(remove.getAttribute('aria-disabled')).toBe('true');expect(remove.textContent).toContain('Đang chạy');
 await render({exists:false});await click(remove);expect(run).not.toHaveBeenCalled();
 await render();run.mockRejectedValueOnce(Error('failed'));await click(trigger());await click(items()[0]!);expect(error).toHaveBeenCalledWith(expect.objectContaining({message:'failed'}));
});
it('keeps native menus in editable fields and clamps a menu at viewport boundaries',async()=>{
 await render();for(const el of host.querySelectorAll('input,textarea,select,[contenteditable]')){
  const event=new MouseEvent('contextmenu',{bubbles:true,cancelable:true});await act(async()=>el.dispatchEvent(event));expect(event.defaultPrevented).toBe(false);expect(items()).toHaveLength(0);
  await key(el,'F10',true);expect(items()).toHaveLength(0);
 }
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({width:250,height:150,left:0,top:0,right:250,bottom:150,x:0,y:0,toJSON:()=>({})});
 await act(async()=>trigger().dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:window.innerWidth,clientY:window.innerHeight})));
 const menu=document.querySelector<HTMLElement>('[role=menu]')!;expect(parseFloat(menu.style.left)+250).toBeLessThanOrEqual(window.innerWidth);expect(parseFloat(menu.style.top)+150).toBeLessThanOrEqual(window.innerHeight);
});
it.each([[0,0],[1024,0],[0,768],[1024,768]])('clamps both axes at corner %s,%s',async(x,y)=>{
 vi.stubGlobal('innerWidth',1024);vi.stubGlobal('innerHeight',768);
 try{
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({width:300,height:200,left:0,top:0,right:300,bottom:200,x:0,y:0,toJSON:()=>({})});
  await render();await act(async()=>trigger().dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:x,clientY:y})));
  const menu=document.querySelector<HTMLElement>('[role=menu]')!,left=parseFloat(menu.style.left),top=parseFloat(menu.style.top);
  expect(left).toBeGreaterThanOrEqual(4);expect(top).toBeGreaterThanOrEqual(4);expect(left+300).toBeLessThanOrEqual(1020);expect(top+200).toBeLessThanOrEqual(764);expect(run).not.toHaveBeenCalled();
 }finally{vi.unstubAllGlobals();}
});
