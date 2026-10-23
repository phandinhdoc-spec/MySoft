// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),subscribe:vi.fn(async()=>()=>{})}));
vi.mock('../src/ipc',()=>({...mocks,pickFiles:vi.fn()}));
vi.mock('../src/QuickFile',()=>({QuickFile:({children}:any)=>children}));
vi.mock('../src/Markdown',()=>({Markdown:()=>null}));
import {NotebookPanel} from '../src/NotebookPanel';
it('opens the selected source in its notebook and handles a second selection',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;Element.prototype.scrollIntoView=vi.fn();
 mocks.rpc.mockImplementation(async(method,p)=>method==='nb.list'?[{id:'old',name:'Sổ cũ',sources:0}]:method==='nb.sourceText'?`Nội dung ${p.sid}`:{id:p.id,name:'Sổ được chọn',messages:[],sources:[{id:p.id==='b'?'s':'s2',title:'Tài liệu',state:'san-sang',chars:5,on:true,kind:'web'}]});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const report=vi.fn(),notice=vi.fn(),openUrl=vi.fn();
 try{for(const [bookId,id] of [['b','s'],['b2','s2']]){await act(async()=>root.render(React.createElement(NotebookPanel,{report,notice,openUrl,navigationRequest:{bookId:bookId!,id:id!,title:'Tài liệu'}})));expect(host.querySelector('[role=dialog]')?.textContent).toContain(`Nội dung ${id}`);expect(mocks.rpc).toHaveBeenCalledWith('nb.get',{id:bookId});}expect(report).not.toHaveBeenCalled();expect(mocks.rpc).not.toHaveBeenCalledWith('nb.get',{id:'old'});}finally{await act(async()=>root.unmount());host.remove();}
});
