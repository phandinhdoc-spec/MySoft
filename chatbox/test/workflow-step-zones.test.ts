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

it('chỉ thị !dau-ra hiện thành ô sửa được ở ĐẦU RA',async()=>{
 const dialog=await open(wf([{name:'A',prompt:'!dau-ra = "ket qua"\nNội dung'},{name:'B'}]),'A');
 const zone=dialog.querySelector('.wf-zone-out')!;
 expect(zone.querySelector('details')!.open).toBe(true);
 expect(zone.querySelector<HTMLInputElement>('[aria-label="Biểu thức đầu ra"]')!.value).toBe('"ket qua"');
 expect(zone.textContent).not.toContain('chỉ để xem');
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

const typeInto=async(el:HTMLInputElement|HTMLSelectElement,value:string)=>{
 await act(async()=>{
  const proto=el instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(el,value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement?'change':'input',{bubbles:true}));
 });
};
const blur=async(el:HTMLElement)=>act(async()=>{el.focus();el.blur();el.dispatchEvent(new FocusEvent('focusout',{bubbles:true}));});
const promptOf=(dialog:HTMLElement)=>dialog.querySelector<HTMLTextAreaElement>('.wf-prompt-field textarea')!.value;
const click=async(el:Element|null)=>act(async()=>{(el as HTMLElement).click();});

it('biểu mẫu ĐẦU VÀO: thêm biến ghi !bien $ten vào đầu prompt và giữ văn bản',async()=>{
 const dialog=await open(wf([{name:'A',prompt:'Nội dung\nthứ hai'},{name:'B'}]),'A');
 await typeInto(dialog.querySelector('[aria-label="Tên biến mới"]')!,'so-lan');
 await typeInto(dialog.querySelector('[aria-label="Giá trị đầu của biến mới"]')!,'0');
 await click([...dialog.querySelectorAll('button')].find(b=>b.textContent==='Thêm biến')!);
 expect(promptOf(dialog)).toBe('!bien $so-lan = 0\nNội dung\nthứ hai');
});

it('biểu mẫu ĐẦU VÀO: giá trị không phải hằng hiện lỗi dưới ô và không ghi',async()=>{
 const dialog=await open(wf([{name:'A',prompt:'Nội dung'},{name:'B'}]),'A');
 await typeInto(dialog.querySelector('[aria-label="Tên biến mới"]')!,'a');
 await typeInto(dialog.querySelector('[aria-label="Giá trị đầu của biến mới"]')!,'$b');
 await click([...dialog.querySelectorAll('button')].find(b=>b.textContent==='Thêm biến')!);
 expect(promptOf(dialog)).toBe('Nội dung');
 expect(dialog.querySelector('.wf-zone-in [role="alert"]')!.textContent).toContain('hằng');
});

it('biểu mẫu ĐẦU RA: điều kiện dừng sai bị chặn, đúng thì ghi !dung neu',async()=>{
 const dialog=await open(wf([{name:'A',prompt:'!bien n = 0\nNội dung'},{name:'B'}]),'A');
 const field=()=>dialog.querySelector<HTMLInputElement>('[aria-label="Điều kiện dừng"]')!;
 await typeInto(field(),'$n >');await blur(field());
 expect(promptOf(dialog)).toBe('!bien n = 0\nNội dung');
 expect(dialog.querySelector('.wf-zone-out [role="alert"]')!.textContent).toContain('Điều kiện dừng');
 await typeInto(field(),'$n >= 3');await blur(field());
 expect(promptOf(dialog)).toBe('!bien n = 0\n!dung neu $n >= 3\nNội dung');
});

it('biểu mẫu ĐẦU RA: chọn nút đầu vòng và điều kiện ghi !lap-lai',async()=>{
 const dialog=await open(wf([{name:'A',prompt:'!bien n = 0'},{name:'B',prompt:'Kiểm tra'}]),'B');
 await typeInto(dialog.querySelector('[aria-label="Nút đầu vòng lặp"]')!,'S0');
 await typeInto(dialog.querySelector('[aria-label="Điều kiện lặp lại"]')!,'$n < 3');
 await blur(dialog.querySelector('[aria-label="Điều kiện lặp lại"]')!);
 expect(promptOf(dialog)).toBe('!lap-lai "S0" neu $n < 3\nKiểm tra');
});

it('biểu mẫu ĐẦU RA: số vòng tối đa sinh biến đếm, vượt 50 hiện lỗi và không ghi',async()=>{
 const dialog=await open(wf([{name:'A',prompt:'Làm'},{name:'B',prompt:'Kiểm tra'}]),'B');
 await typeInto(dialog.querySelector('[aria-label="Nút đầu vòng lặp"]')!,'S0');
 await typeInto(dialog.querySelector('[aria-label="Điều kiện lặp lại"]')!,'true');
 await typeInto(dialog.querySelector('[aria-label="Số vòng tối đa"]')!,'51');
 await blur(dialog.querySelector('[aria-label="Số vòng tối đa"]')!);
 expect(promptOf(dialog)).toBe('Kiểm tra');
 expect(dialog.querySelector('.wf-zone-out [role="alert"]')!.textContent).toContain('1 đến 50');
 await typeInto(dialog.querySelector('[aria-label="Số vòng tối đa"]')!,'4');
 await blur(dialog.querySelector('[aria-label="Số vòng tối đa"]')!);
 expect(promptOf(dialog)).toBe('!bien $vong_S1 = 0\n!gan $vong_S1 = $vong_S1 + 1\n!lap-lai "S0" neu (true) && $vong_S1 < 4\nKiểm tra');
});

it('biểu mẫu bị khóa khi đang chạy',async()=>{
 const dialog=await open(wf([{name:'A'},{name:'B'}],{runs:[{id:'r',status:'running',startedAt:1,steps:[]}]}),'A');
 expect([...dialog.querySelectorAll<HTMLFieldSetElement>('.wf-form-set')].every(f=>f.disabled)).toBe(true);
});
