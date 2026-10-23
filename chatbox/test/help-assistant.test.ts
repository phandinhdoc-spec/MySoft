// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {HelpAssistant} from '../src/HelpAssistant';
import {useObjectMenu} from '../src/ObjectMenu';
import {helpContext} from '../src/help-context';
import {helpEditCommands} from '../src/help-edit-menu';
let root:Root,host:HTMLDivElement;const onRead=vi.fn(),run=vi.fn();
function Demo(){
 const menu=useObjectMenu<string>({contextKey:'test',commands:()=>[{id:'open',label:'Mở',run}]});
 return React.createElement(React.Fragment,null,
  React.createElement('button',{'aria-label':'Quy trình',...menu.handlers('a')},'Nội dung riêng'),
  React.createElement('textarea',{'aria-label':'Lời nhắc',defaultValue:'Bí mật của học sinh'}),
  React.createElement('div',{className:'message'},'Nội dung chat riêng'),menu.menu,React.createElement(HelpAssistant,{onRead}));
}
const right=async(el:Element,x=120,y=80)=>act(async()=>{el.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:x,clientY:y}));});
const click=async(el:Element)=>act(async()=>{(el as HTMLElement).click();});
const command=(label:string)=>[...document.querySelectorAll('button[role=menuitem]')].find(b=>b.textContent?.includes(label))!;
beforeEach(async()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;vi.clearAllMocks();host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root.render(React.createElement(Demo)));});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();});
it('adds help to an existing menu without replacing its commands; keeps original click context',async()=>{
 await right(host.querySelector('button')!,135,94);
 expect(document.querySelectorAll('[role=menu]')).toHaveLength(1);expect(command('Mở')).toBeTruthy();expect(run).not.toHaveBeenCalled();
 await click(command('Hỏi PVTA'));
 const chat=document.querySelector('.help-chat')!;expect(chat.textContent).toContain('Quy trình');expect(chat.textContent).toContain('(135, 94)');
 await click([...chat.querySelectorAll('button')].find(b=>b.textContent==='Chỗ này dùng như thế nào?')!);
 await act(async()=>{await import('../src/help-brain');});
 expect(chat.querySelector('.help-chat-source')?.textContent).toContain('Quy trình đa nhánh');
 await click(chat.querySelector('.help-chat-source')!);expect(onRead).toHaveBeenCalledWith('quy-trinh');expect(document.querySelector('.help-chat')).toBeNull();
});
it('offers help on blank space and editable fields without exposing their values',async()=>{
 await right(host);expect(command('Hỏi PVTA')).toBeTruthy();
 await right(host.querySelector('textarea')!,0,0);expect(command('Dán')).toBeTruthy();
 await click(command('Hỏi PVTA'));const chat=document.querySelector('.help-chat')!;
 expect(chat.textContent).toContain('Lời nhắc');expect(chat.textContent).not.toContain('Bí mật');expect(chat.textContent).toContain('(0, 0)');
 await act(async()=>chat.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));expect(document.querySelector('.help-chat')).toBeNull();
 expect(helpContext(host.querySelector('.message')!,1,2).label).toBe('Vùng làm việc');
});
it('answers unknown questions honestly and closes with focus restored',async()=>{
 const button=host.querySelector('button')!;button.focus();await right(button);await click(command('Hỏi PVTA'));
 const input=document.querySelector<HTMLInputElement>('.help-chat input')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'xyznotafeature');input.dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>input.closest('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(document.querySelector('.help-chat-log')?.textContent).toContain('Chưa tìm thấy căn cứ');
 await click(document.querySelector('[aria-label="Đóng hỏi PVTA"]')!);expect(document.activeElement).toBe(button);
});
it('keeps copy/paste actions and prevents a late paste from overwriting new input',async()=>{
 const field=host.querySelector('textarea')!;field.setSelectionRange(0,3);
 let resolve:(text:string)=>void=()=>{};
 Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:vi.fn().mockResolvedValue(undefined),readText:vi.fn(()=>new Promise<string>(r=>{resolve=r;}))}});
 const commands=helpEditCommands(field);await commands.find(c=>c.id==='copy')!.run(new DOMRect());expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Bí ');
 const pending=commands.find(c=>c.id==='paste')!.run(new DOMRect());field.value='Nội dung mới';resolve('ghi đè');await expect(pending).rejects.toThrow('đã thay đổi');expect(field.value).toBe('Nội dung mới');
});
