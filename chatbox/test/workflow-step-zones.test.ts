// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {ViewState} from '../src/ipc';
import type {Workflow} from '../../core/src/desktop/types';
const mocks=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('../src/ipc',()=>({rpc:mocks.rpc,pickFiles:vi.fn(),subscribe:vi.fn(async()=>()=>{})}));
vi.mock('../src/QuickFile',()=>({QuickFile:({children}:{children?:React.ReactNode})=>children??null}));
vi.mock('../src/PlanCard',()=>({PlanCard:()=>null}));
vi.mock('../src/LinkedNotebooks',()=>({LinkedNotebooks:()=>null}));
import {WorkflowPanel} from '../src/WorkflowPanel';
import {directiveText,stepDirectives,stepVariables} from '../src/WorkflowStepZones';

let host:HTMLDivElement,root:Root;
const wf=(steps:Partial<Workflow['steps'][number]>[],extra:Partial<Workflow>={}):Workflow=>({id:'w',name:'Bài học',updatedAt:1,runs:[],steps:steps.map((s,i)=>({id:'S'+i,name:String.fromCharCode(65+i),prompt:'',choice:'auto',access:'read',...s})),...extra});
const state=(w:Workflow)=>({data:{workflows:[w],chats:[],projects:[],ruleBook:[]},prompts:{own:[],favorites:[]},skills:[],backends:[],api:[],catalog:{}} as unknown as ViewState);
const open=async(w:Workflow,name:string)=>{
 await act(async()=>root.render(React.createElement(WorkflowPanel,{state:state(w),report:vi.fn(),notice:vi.fn(),onAutoCreate:vi.fn(),selectedId:w.id})));
 await act(async()=>host.querySelector<HTMLButtonElement>(`[aria-label="Sửa bước: ${name}"]`)!.click());
 return host.querySelector<HTMLElement>('.wf-step-dialog')!;
};
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;Element.prototype.scrollIntoView??=function(){};mocks.rpc.mockReset().mockResolvedValue(true);host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});

it('xếp ĐẦU VÀO trước PROMPT, PROMPT trước ĐẦU RA; quyền nằm ở hàng đầu',async()=>{
 const dialog=await open(wf([{name:'A'},{name:'B'}]),'A');
 const head=dialog.querySelector('.wf-step-head')!,inZone=dialog.querySelector('.wf-zone-in')!,prompt=dialog.querySelector('.wf-prompt-field')!,outZone=dialog.querySelector('.wf-zone-out')!,foot=dialog.querySelector('.wf-step-foot')!;
 const before=(a:Element,b:Element)=>(a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING)>0;
 expect(before(head,inZone)).toBe(true);expect(before(inZone,prompt)).toBe(true);expect(before(prompt,outZone)).toBe(true);expect(before(outZone,foot)).toBe(true);
 expect(head.querySelector('[aria-label="Quyền của nút"]')).not.toBeNull();
 expect(inZone.getAttribute('aria-label')).toBe('Đầu vào của nút');expect(outZone.getAttribute('aria-label')).toBe('Đầu ra của nút');
});

it('nút đơn giản thu gọn cả hai vùng vào một dòng tóm tắt',async()=>{
 const dialog=await open(wf([{name:'A'},{name:'B'}]),'A');
 expect(dialog.querySelector<HTMLDetailsElement>('.wf-zone-in details')!.open).toBe(false);
 expect(dialog.querySelector<HTMLDetailsElement>('.wf-zone-out details')!.open).toBe(false);
 expect(dialog.querySelector('.wf-zone-in summary')!.textContent).toContain('ĐẦU VÀO');
});

it('liệt kê biến nhìn thấy được từ nút khác và mở vùng ĐẦU VÀO',async()=>{
 const dialog=await open(wf([{name:'A',prompt:'!bien x = 2\nNội dung A'},{name:'B',prompt:'Dùng $x'}]),'B');
 const zone=dialog.querySelector('.wf-zone-in')!;
 expect(zone.querySelector('details')!.open).toBe(true);
 expect(zone.querySelector('.wf-zone-list')!.textContent).toContain('$x');
 expect(zone.textContent).toContain('{{input}}');expect(zone.textContent).toContain('{{prev}}');
});

it('hiện lỗi biên dịch của đúng nút và gợi ý sửa ở vùng ĐẦU RA',async()=>{
 const dialog=await open(wf([{name:'A',prompt:'!bien x\nNội dung'},{name:'B'}]),'A');
 const zone=dialog.querySelector('.wf-zone-out')!;
 expect(zone.querySelector('details')!.open).toBe(true);
 const diag=zone.querySelector('.wf-zone-diag')!;
 expect(diag.textContent).toContain('Lỗi biên dịch ở nút này');
 expect(diag.textContent).toContain('!bien cần tên và giá trị');
 expect(diag.querySelector('em')!.textContent!.trim().length).toBeGreaterThan(0);
});

it('lỗi của nút khác không hiện ở vùng ĐẦU RA của nút đang sửa',async()=>{
 const dialog=await open(wf([{name:'A'},{name:'B',prompt:'!bien x\nNội dung'}]),'A');
 expect(dialog.querySelector('.wf-zone-diag')).toBeNull();
 expect(dialog.querySelector('.wf-zone-out')!.textContent).toContain('Không có lỗi biên dịch ở nút này.');
});

it('chỉ thị !dau-ra hiển thị ở ĐẦU RA dưới dạng chỉ để xem',async()=>{
 const dialog=await open(wf([{name:'A',prompt:'!dau-ra = "ket qua"\nNội dung'},{name:'B'}]),'A');
 const zone=dialog.querySelector('.wf-zone-out')!;
 expect(zone.querySelector('details')!.open).toBe(true);
 expect(zone.querySelector('.wf-zone-list code')!.textContent).toBe('!dau-ra = "ket qua"');
 expect(zone.textContent).toContain('chỉ để xem');
});

it('khóa các điều khiển quyền và nút khi đang chạy',async()=>{
 const dialog=await open(wf([{name:'A'},{name:'B'}],{runs:[{id:'r',status:'running',startedAt:1,steps:[]}]}),'A');
 expect(dialog.querySelector<HTMLButtonElement>('[aria-label="Quyền của nút"] button')!.disabled).toBe(true);
 expect(dialog.querySelector<HTMLButtonElement>('[aria-label="Dời nút sang trái"]')!.disabled).toBe(true);
 expect(dialog.querySelector<HTMLButtonElement>('.wf-step-foot button:last-child')!.disabled).toBe(true);
});

it('hàm thuần: biến và chỉ thị được tách đúng',()=>{
 const w={id:'w',steps:[{id:'A',name:'A',prompt:'!bien x = 2\n!dau-ra = "ok"',dependsOn:[],files:[]},{id:'B',name:'B',prompt:'',dependsOn:[],files:[]}]};
 expect(stepVariables(w,'B').map(v=>v.label)).toEqual(['$x']);
 expect(stepVariables(w,'B').some(v=>v.label.startsWith('!'))).toBe(false);
 expect(stepDirectives(w.steps[0]!.prompt,'A')).toEqual([{kind:'dau-ra',line:2,value:'"ok"',target:undefined}]);
 expect(directiveText({kind:'lap-lai',line:1,value:'$x > 1',target:'A'})).toBe('!lap-lai "A" neu $x > 1');
 expect(directiveText({kind:'dung',line:1,value:'true'})).toBe('!dung neu true');
});
