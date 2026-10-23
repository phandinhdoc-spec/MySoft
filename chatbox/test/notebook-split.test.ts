// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('../src/ipc',()=>({rpc:mocks.rpc,pickFiles:vi.fn(),subscribe:vi.fn(async()=>()=>{})}));
vi.mock('../src/QuickFile',()=>({QuickFile:({children}:any)=>children}));
vi.mock('../src/Markdown',()=>({Markdown:()=>null}));
import {NotebookPanel,NotebookSources,useNotebook} from '../src/NotebookPanel';

let host:HTMLDivElement,root:Root;
const book={id:'b1',name:'KHTN',sources:[{id:'s',kind:'file',title:'a.pdf',origin:'/a.pdf',state:'san-sang',chars:10,on:true}],messages:[]};
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;(Element.prototype as any).scrollIntoView=()=>{};host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});

/** Giống App: một controller dùng chung, nguồn vẽ ở "thanh bên", trò chuyện vẽ ở "khung chính". */
function Shell({enabled=true}:{enabled?:boolean}){
 const c=useNotebook({report:vi.fn(),notice:vi.fn(),enabled});
 return React.createElement('div',null,
  React.createElement('div',{id:'side'},React.createElement(NotebookSources,{c,split:true})),
  React.createElement('div',{id:'main'},React.createElement(NotebookPanel,{controller:c,sourcesInSidebar:true,report:vi.fn(),notice:vi.fn(),openUrl:vi.fn()})));
}
it('quản lí nguồn nằm ở thanh bên, khung chính chỉ còn trò chuyện và dùng chung một sổ',async()=>{
 mocks.rpc.mockReset().mockImplementation(async(method:string)=>method==='nb.list'?[{id:'b1',name:'KHTN',sources:1,updatedAt:1}]:method==='nb.get'?book:true);
 await act(async()=>root.render(React.createElement(Shell)));
 const side=host.querySelector('#side')!,main=host.querySelector('#main')!;
 expect(side.querySelector('.nb-list')?.textContent).toContain('a.pdf');
 expect(side.querySelector('.nb-add')).not.toBeNull();
 expect(side.textContent).toContain('＋ Sổ mới');
 expect(main.querySelector('.nb-list')).toBeNull();expect(main.querySelector('.nb-add')).toBeNull();
 expect(main.querySelector('.nb-chat')).not.toBeNull();expect(main.querySelector('.nb-split')).not.toBeNull();
 expect(main.querySelector('h1')?.textContent).toBe('KHTN');
 expect(mocks.rpc.mock.calls.filter(c=>c[0]==='nb.list')).toHaveLength(1);
});
it('không tải gì khi chưa bật (đang ở chức năng khác)',async()=>{
 mocks.rpc.mockReset().mockResolvedValue([]);
 await act(async()=>root.render(React.createElement(Shell,{enabled:false})));
 expect(mocks.rpc).not.toHaveBeenCalled();
});
