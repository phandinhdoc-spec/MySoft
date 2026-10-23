// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it} from 'vitest';
import {RunProgress,appendProgress} from '../src/RunProgress';
import type {AiProgressEntry} from '@pvta/shared';
let host:HTMLDivElement,root:Root;
const entry:AiProgressEntry={id:'tool',kind:'tool',title:'Đọc tệp',state:'running',at:Date.now(),input:'bai-hoc.md'};
const render=(entries:AiProgressEntry[],running=true)=>act(async()=>root.render(React.createElement(RunProgress,{entries,running})));
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
it('shows only the animated dots until clicked, then updates the actual timeline without duplicates',async()=>{
 await render([entry]);const toggle=()=>host.querySelector<HTMLButtonElement>('.run-progress-toggle')!;
 expect(toggle().getAttribute('aria-expanded')).toBe('false');expect(host.querySelectorAll('.run-progress-dots i')).toHaveLength(3);
 expect(host.textContent).not.toContain('Đọc tệp');expect(host.querySelector('section')).toBeNull();
 await act(async()=>toggle().click());expect(toggle().getAttribute('aria-expanded')).toBe('true');expect(host.textContent).toContain('Đọc tệp');
 await render(appendProgress([entry],{...entry,state:'done',endedAt:Date.now(),output:'Đã đọc 20 dòng.'}));
 expect(host.querySelectorAll('li')).toHaveLength(1);expect(host.textContent).toContain('Hoàn tất');expect(host.textContent).toContain('Đã đọc 20 dòng.');
 await act(async()=>toggle().click());expect(host.querySelector('section')).toBeNull();
});
it('appears before the first event, disappears on finish and starts the next run collapsed',async()=>{
 await render([]);await act(async()=>host.querySelector<HTMLButtonElement>('button')!.click());expect(host.textContent).toContain('Đang chuẩn bị yêu cầu');
 await render([],false);expect(host.textContent).toBe('');
 await render([entry]);expect(host.querySelector('section')).toBeNull();
});
it('escapes command output and keeps bounded history with stable update order',async()=>{
 const rows=Array.from({length:130},(_,n)=>({...entry,id:String(n)})).reduce(appendProgress,[] as AiProgressEntry[]);
 expect(rows).toHaveLength(100);expect(rows[0]!.id).toBe('30');
 const updated=appendProgress(rows,{...rows[0]!,state:'error',output:'<script>alert(1)</script>'});expect(updated[0]!.state).toBe('error');expect(updated).toHaveLength(100);
 await render(updated);await act(async()=>host.querySelector<HTMLButtonElement>('button')!.click());expect(host.querySelector('script')).toBeNull();expect(host.textContent).toContain('<script>alert(1)</script>');expect(host.textContent).toContain('Lỗi');
});
