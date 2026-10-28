// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const ipc=vi.hoisted(()=>({invoke:vi.fn(async(_name:string,_args?:unknown)=>{})}));
vi.mock('@tauri-apps/api/core',()=>({invoke:ipc.invoke,Channel:class {onmessage=(_event:unknown)=>{};}}));
import {TerminalPanel} from '../src/TerminalPanel';
import {createOutputDecoder} from '../src/terminal-output';

Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
let root:Root,host:HTMLDivElement;
const render=(visible=true)=>React.createElement(TerminalPanel,{visible,cwd:'/tmp/tiếng Việt',onHide(){},onClose(){}});
beforeEach(async()=>{
 ipc.invoke.mockReset().mockResolvedValue(undefined);
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
 await act(async()=>{root.render(render());});
});
afterEach(async()=>{await act(async()=>{root.unmount();});host.remove();});
const textarea=()=>host.querySelector('textarea')!;
const write=async(text:string)=>{await act(async()=>{
 Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(textarea(),text);
 textarea().dispatchEvent(new Event('input',{bubbles:true}));
});};
const key=async(init:KeyboardEventInit)=>{await act(async()=>{textarea().dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true,...init}));});};
const click=async(label:string)=>{await act(async()=>{Array.from(host.querySelectorAll('button')).find(b=>b.textContent===label)!.click();});};
const writes=()=>ipc.invoke.mock.calls.filter(([name])=>name==='terminal_write');

it('keeps Vietnamese preedit in the editor and submits the final text once',async()=>{
 await act(async()=>{textarea().dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));});
 await write('việ');await key({isComposing:true});expect(writes()).toHaveLength(0);
 await write('printf "%s\\n" "tiếng Việt đẹp"');
 await act(async()=>{textarea().dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'tiếng Việt đẹp'}));});
 await key({});expect(writes()).toHaveLength(0); // Safari's commit Enter must not execute.
 await click('Gửi');
 expect(writes()).toHaveLength(1);
 expect(writes()[0][1]).toMatchObject({data:'printf "%s\\n" "tiếng Việt đẹp"\n'});
 expect(textarea().value).toBe('');
});
it('preserves multiline commands, quotes, spaces and decomposed Unicode',async()=>{
 const text='  printf "%s\\n" "vie\u0323\u0302t"\nprintf \'😀 <b>\'\n';
 await write(text);await key({shiftKey:true});expect(writes()).toHaveLength(0);
 await key({});expect(writes()[0][1]).toMatchObject({data:text});
});
it('keeps the draft when delivery fails and allows retry',async()=>{
 await write('echo Việt');ipc.invoke.mockRejectedValueOnce(new Error('write failed'));
 await click('Gửi');expect(textarea().value).toBe('echo Việt');expect(host.querySelector('[role=alert]')?.textContent).toContain('write failed');
 await click('Gửi');expect(textarea().value).toBe('');
});
it('retains the session and draft while hidden',async()=>{
 await write('chưa gửi');
 await act(async()=>{root.render(render(false));});
 await act(async()=>{root.render(render(true));});
 expect(textarea().value).toBe('chưa gửi');
 expect(ipc.invoke.mock.calls.filter(([name])=>name==='terminal_open')).toHaveLength(1);
 expect(ipc.invoke.mock.calls.filter(([name])=>name==='terminal_close')).toHaveLength(0);
});
it('decodes split UTF-8 output safely and prevents sends after exit',async()=>{
 const args=ipc.invoke.mock.calls.find(([name])=>name==='terminal_open')![1] as {output:{onmessage:(e:unknown)=>void}};
 const bytes=new TextEncoder().encode('Việt <script>alert(1)</script>');
 await act(async()=>{
  args.output.onmessage({kind:'data',stream:'stdout',bytes:[...bytes.slice(0,3)]});
  args.output.onmessage({kind:'data',stream:'stdout',bytes:[...bytes.slice(3)]});
  args.output.onmessage({kind:'exit',code:0});
 });
 expect(host.querySelector('pre')?.textContent).toContain('Việt <script>alert(1)</script>');
 expect(host.querySelector('script')).toBeNull();
 await write('echo test');await key({});expect(writes()).toHaveLength(0);
});
it('removes ANSI control sequences split across output chunks',()=>{
 const decoder=createOutputDecoder(),encode=(s:string)=>new TextEncoder().encode(s);
 expect(decoder.write(encode('\x1b[3'))).toBe('');
 expect(decoder.write(encode('1mĐỏ\x1b[0m\r'))).toBe('Đỏ\n');
 expect(decoder.write(encode('\n\x1b]0;title'))).toBe('');
 expect(decoder.write(encode('\x07xong'))+decoder.finish()).toBe('xong');
});
