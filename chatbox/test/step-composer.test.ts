// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {ViewState} from '../src/ipc';
import type {Workflow} from '../../core/src/desktop/types';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),pickFiles:vi.fn()}));
vi.mock('../src/ipc',()=>({rpc:mocks.rpc,pickFiles:mocks.pickFiles,subscribe:vi.fn(async()=>()=>{})}));
vi.mock('../src/QuickFile',()=>({QuickFile:({children}:{children?:React.ReactNode})=>children??null}));
vi.mock('../src/PlanCard',()=>({PlanCard:()=>null}));
vi.mock('../src/LinkedNotebooks',()=>({LinkedNotebooks:()=>null}));
import {WorkflowPanel} from '../src/WorkflowPanel';
import {exportWorkflow} from '../src/workflow-tools';
import {importWorkflow} from '../src/workflow-tools';
import {inputPath,parsePrompt} from '../../core/src/desktop/workflow-language';
let host:HTMLDivElement,root:Root;
const wf=(extra:Partial<Workflow>={}):Workflow=>({id:'w',name:'Bài học',updatedAt:1,runs:[],steps:[{id:'A',name:'A',prompt:'',choice:'auto',access:'read'}],...extra});
const state=(w:Workflow)=>({data:{workflows:[w],chats:[],projects:[],ruleBook:[{id:'r',key:'giong-van',title:'Giọng văn',text:'ngắn gọn',always:false,at:1}]},prompts:{own:[],favorites:[]},skills:[{name:'soan-de',description:'Soạn đề',load:'demand',body:''}],backends:[],api:[],catalog:{}} as unknown as ViewState);
const open=async(w:Workflow)=>{
 await act(async()=>root.render(React.createElement(WorkflowPanel,{state:state(w),report:vi.fn(),notice:vi.fn(),onAutoCreate:vi.fn(),selectedId:w.id})));
 await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Sửa bước: A"]')!.click());
};
const dialog=()=>host.querySelector('.step-composer')!;
const setValue=(el:HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement,v:string)=>{const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:el instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(el,v);el.dispatchEvent(new Event(el instanceof HTMLSelectElement?'change':'input',{bubbles:true}));};
const labels=()=>[...dialog().querySelectorAll('.composer-toolbar button')].map(b=>b.getAttribute('aria-label')??'');
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;Element.prototype.scrollIntoView??=function(){};mocks.rpc.mockReset().mockResolvedValue(true);mocks.pickFiles.mockReset();host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});

it.each([['step',0],['workflow',1],['step',2]] as const)('tạo tài nguyên phạm vi %s qua menu %s không ghi thư viện và giữ qua lưu/mở lại',async(scope,index)=>{
 await open(wf());
 await act(async()=>setValue(dialog().querySelector<HTMLSelectElement>('[aria-label="Phạm vi áp dụng tài nguyên"]')!,scope));
 await act(async()=>dialog().querySelectorAll<HTMLButtonElement>('.trigger-button')[index]!.click());
 await act(async()=>dialog().querySelector<HTMLButtonElement>('.trigger-add-btn')!.click());
 await act(async()=>{setValue(host.querySelector<HTMLInputElement>('.modal input[required]')!,'Riêng');setValue(host.querySelector<HTMLTextAreaElement>('.modal textarea[required]')!,'NỘI DUNG RIÊNG');});
 await act(async()=>host.querySelector<HTMLFormElement>('.modal form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(mocks.rpc.mock.calls.some(c=>['savePrompt','saveRule','createSkill'].includes(c[0]))).toBe(false);
 expect(dialog().querySelector('.wf-resource-list')?.textContent).toContain('Riêng');
 expect(dialog().querySelector<HTMLTextAreaElement>('[aria-label="Prompt của nút"]')!.value).toBe('');
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Lưu thay đổi')!.click());
 const saved=mocks.rpc.mock.calls.find(c=>c[0]==='workflowSave')![1].workflow as Workflow;
 expect(saved.steps[0]!.resources?.[0]).toMatchObject({scope,body:'NỘI DUNG RIÊNG',kind:index===0?'prompt':index===1?'skill':'rule'});
 expect(importWorkflow(exportWorkflow(saved)).steps[0]!.resources).toEqual(saved.steps[0]!.resources);
 await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Đóng cửa sổ sửa bước"]')!.click());
 await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Sửa bước: A"]')!.click());
 expect(dialog().querySelector('.wf-resource-list')?.textContent).toContain('Riêng');
});

it('chọn prompt thư viện làm bản riêng, đổi phạm vi rồi bỏ áp dụng',async()=>{
 await open(wf());
 await act(async()=>setValue(dialog().querySelector<HTMLSelectElement>('[aria-label="Phạm vi áp dụng tài nguyên"]')!,'step'));
 await act(async()=>dialog().querySelectorAll<HTMLButtonElement>('.trigger-button')[0]!.click());
 await act(async()=>dialog().querySelector<HTMLButtonElement>('.trigger-menu [role=option]')!.click());
 expect(dialog().querySelector('.wf-resource-list summary')).not.toBeNull();
 const scope=dialog().querySelector<HTMLSelectElement>('.wf-resource-list select')!;
 expect([...scope.options].map(o=>o.value)).toEqual(['step','workflow']);
 await act(async()=>setValue(scope,'workflow'));
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Lưu thay đổi')!.click());
 const saved=mocks.rpc.mock.calls.find(c=>c[0]==='workflowSave')![1].workflow as Workflow;
 expect(saved.steps[0]!.resources![0]).toMatchObject({scope:'workflow',kind:'prompt'});
 expect(saved.steps[0]!.resources![0]!.body.length).toBeGreaterThan(0);
 await act(async()=>[...dialog().querySelectorAll('button')].find(b=>b.textContent==='Bỏ áp dụng')!.click());
 expect(dialog().querySelector('.wf-resource-list summary')).toBeNull();
});

it('chọn PDF và ảnh tại vùng đầu vào rồi lưu cùng nút',async()=>{
 await open(wf());const select=host.querySelector<HTMLSelectElement>('[aria-label="Loại tệp đầu vào"]')!;
 await act(async()=>setValue(select,'pdf'));mocks.pickFiles.mockResolvedValueOnce(['/tmp/đề.pdf']);
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Chèn tệp đầu vào')!.click());
 expect(mocks.pickFiles).toHaveBeenLastCalledWith(false,expect.objectContaining({extensions:['pdf']}));
 await act(async()=>setValue(select,'image'));mocks.pickFiles.mockResolvedValueOnce(['/tmp/hình.png']);
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Chèn tệp đầu vào')!.click());
 expect(mocks.pickFiles).toHaveBeenLastCalledWith(false,expect.objectContaining({extensions:['png','jpg','jpeg','webp']}));
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Lưu thay đổi')!.click());
 expect(mocks.rpc.mock.calls.find(c=>c[0]==='workflowSave')![1].workflow.steps[0].files).toEqual(['/tmp/đề.pdf','/tmp/hình.png']);
});

it('ô prompt của nút giữ 5 công cụ tài nguyên cùng thanh Markdown',async()=>{
 await open(wf());
 expect(dialog().querySelector('.composer textarea')).not.toBeNull();
 expect([...dialog().querySelectorAll('.composer-md-toolbar button')].map(b=>b.textContent)).toEqual(['B','I','U','List','Enum','Url','Table','Image','File','Section']);
 const l=labels();
 expect(l).toHaveLength(5);
 expect(l[0]).toBe('Chèn tệp hoặc ảnh');expect(l[1]).toBe('Chèn thư mục');
 expect(l.slice(2).map(x=>x.split('.')[0])).toEqual(['Thư viện lời nhắc','Kỹ năng','Quy tắc']);
 // Không có quyền chat, chế độ Plan, nút quy trình hay duyệt tệp/thư mục trong ngữ cảnh ($, $$).
 const html=dialog().innerHTML;
 for(const gone of ['access-picker','planning-controls','send-button','mode-control','optimize'])expect(html).not.toContain(gone);
 expect(l.some(x=>/Tệp trong ngữ cảnh|^Thư mục\./.test(x))).toBe(false);
});

it('gợi ý chữ nghiêng, lỗi có cách sửa và AI chỉ sửa bản xem trước hợp lệ',async()=>{
 const original='!bien so-lan =';await open(wf({steps:[{id:'A',name:'A',prompt:original,choice:'auto',access:'read'}]}));
 expect(dialog().querySelector('.wf-language-hint em')).not.toBeNull();
 expect(dialog().querySelector('.wf-language-error')?.textContent).toContain('Điền tên và giá trị');
 const button=(text:string)=>[...host.querySelectorAll('button')].find(b=>b.textContent===text)!;
 await act(async()=>button('Tự sửa').click());
 expect(button('Áp dụng').disabled).toBe(true);
 await act(async()=>button('Hủy').click());
 mocks.rpc.mockResolvedValueOnce('!bien so-lan = 0');
 await act(async()=>button('Nhờ AI sửa').click());
 expect(mocks.rpc.mock.calls.find(c=>c[0]==='workflowSuggest')![1].question).toContain('Sửa lỗi:');
 expect(dialog().querySelector<HTMLTextAreaElement>('[aria-label="Prompt của nút"]')!.value).toBe(original);
 expect(button('Áp dụng').disabled).toBe(false);
 await act(async()=>button('Áp dụng').click());
 expect(dialog().querySelector<HTMLTextAreaElement>('[aria-label="Prompt của nút"]')!.value).toBe('!bien so-lan = 0');
 expect(dialog().querySelector('.wf-language-error')).toBeNull();
});

it('lỗi ở nút khác không cung cấp sửa AI cho nút hiện tại',async()=>{
 await open(wf({steps:[{id:'A',name:'A',prompt:'Soạn bài',choice:'auto',access:'read'},{id:'B',name:'B',prompt:'!bien x =',choice:'auto',access:'read'}]}));
 expect(dialog().querySelector('.wf-language-error')?.textContent).toContain('Mở nút được báo lỗi');
 expect([...dialog().querySelectorAll('button')].some(b=>b.textContent==='Nhờ AI sửa')).toBe(false);
});

it('AI trả prompt còn lỗi thì không được áp dụng',async()=>{
 await open(wf({steps:[{id:'A',name:'A',prompt:'!bien x =',choice:'auto',access:'read'}]}));
 mocks.rpc.mockResolvedValueOnce('!gan missing = 1');
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Nhờ AI sửa')!.click());
 expect(host.querySelector('[aria-label="Trao đổi khai báo"]')?.textContent).toContain('chưa khai báo');
 expect([...host.querySelectorAll('button')].find(b=>b.textContent==='Áp dụng')!.disabled).toBe(true);
 expect(dialog().querySelector<HTMLTextAreaElement>('[aria-label="Prompt của nút"]')!.value).toBe('!bien x =');
});

it('định dạng vùng chọn, chèn phân đoạn tại con trỏ và lưu prompt',async()=>{
 await open(wf({steps:[{id:'A',name:'A',prompt:'Xin chào thầy cô',choice:'auto',access:'read'}]}));
 const ta=dialog().querySelector('textarea')!;
 ta.setSelectionRange(4,8);
 await act(async()=>dialog().querySelector<HTMLButtonElement>('[title="Chữ đậm (Ctrl+B)"]')!.click());
 expect(ta.value).toBe('Xin **chào** thầy cô');
 ta.setSelectionRange(0,3);
 await act(async()=>ta.dispatchEvent(new KeyboardEvent('keydown',{key:'i',ctrlKey:true,bubbles:true})));
 expect(ta.value).toBe('*Xin* **chào** thầy cô');
 ta.setSelectionRange(0,0);
 await act(async()=>dialog().querySelector<HTMLButtonElement>('.md-tool-section')!.click());
 expect(ta.value).toBe('---\n\n*Xin* **chào** thầy cô');
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Lưu thay đổi')!.click());
 expect(mocks.rpc.mock.calls.find(c=>c[0]==='workflowSave')![1].workflow.steps[0].prompt).toBe(ta.value);
});

it('Image chèn đường dẫn có khoảng trắng và đính kèm ảnh cho nút',async()=>{
 await open(wf());
 const image=()=>[...dialog().querySelectorAll<HTMLButtonElement>('.composer-md-toolbar button')].find(b=>b.textContent==='Image')!;
 mocks.pickFiles.mockResolvedValueOnce([]);
 await act(async()=>image().click());
 expect(dialog().querySelector('textarea')!.value).toBe('');
 mocks.pickFiles.mockResolvedValueOnce(['/tmp/hình bài học.png']);
 await act(async()=>image().click());
 expect(dialog().querySelector('textarea')!.value).toBe('"![hình bài học.png](</tmp/hình bài học.png>)"\n');
 expect(dialog().querySelector('.file-chips')?.textContent).toContain('hình bài học.png');
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Lưu thay đổi')!.click());
 const saved=mocks.rpc.mock.calls.find(c=>c[0]==='workflowSave')![1].workflow.steps[0];
 expect(saved.files).toEqual(['/tmp/hình bài học.png']);
 expect(inputPath(saved.prompt.trim())).toBe('/tmp/hình bài học.png');
});

it('File chèn liên kết và lưu đồng thời tệp đính kèm; hủy chọn không đổi prompt',async()=>{
 await open(wf());
 const file=()=>[...dialog().querySelectorAll<HTMLButtonElement>('.composer-md-toolbar button')].find(b=>b.textContent==='File')!;
 mocks.pickFiles.mockResolvedValueOnce([]);
 await act(async()=>file().click());
 expect(dialog().querySelector('textarea')!.value).toBe('');
 mocks.pickFiles.mockResolvedValueOnce(['/tmp/Bài học.docx']);
 await act(async()=>file().click());
 expect(dialog().querySelector('textarea')!.value).toBe('"[Bài học.docx](</tmp/Bài học.docx>)"\n');
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Lưu thay đổi')!.click());
 const saved=mocks.rpc.mock.calls.find(c=>c[0]==='workflowSave')![1].workflow.steps[0];
 expect(saved.files).toEqual(['/tmp/Bài học.docx']);
 expect(saved.prompt).toContain('[Bài học.docx]');
 expect(inputPath(saved.prompt.trim())).toBe('/tmp/Bài học.docx');
});

it('List và Enum chuyển các dòng đã chọn, giữ đoạn ngoài vùng chọn',async()=>{
 await open(wf({steps:[{id:'A',name:'A',prompt:'Đầu\nMột\nHai\nCuối',choice:'auto',access:'read'}]}));
 const ta=dialog().querySelector('textarea')!;
 ta.setSelectionRange(4,11);
 await act(async()=>[...dialog().querySelectorAll<HTMLButtonElement>('.composer-md-toolbar button')].find(b=>b.textContent==='List')!.click());
 expect(ta.value).toBe('Đầu\n- Một\n- Hai\nCuối');
 ta.setSelectionRange(4,15);
 await act(async()=>[...dialog().querySelectorAll<HTMLButtonElement>('.composer-md-toolbar button')].find(b=>b.textContent==='Enum')!.click());
 expect(ta.value).toBe('Đầu\n1. Một\n2. Hai\nCuối');
});

it('đính kèm tệp/ảnh vào nút, gõ / và # để chèn skill và quy tắc',async()=>{
 await open(wf());
 mocks.pickFiles.mockResolvedValueOnce(['/tmp/de.docx','/tmp/hinh.png']);
 await act(async()=>dialog().querySelector<HTMLButtonElement>('[aria-label="Chèn tệp hoặc ảnh"]')!.click());
 expect(dialog().querySelector('.file-chips')?.textContent).toContain('de.docx');
 expect(dialog().querySelector('.file-chips')?.textContent).toContain('Ảnh: hinh.png');
 const ta=dialog().querySelector('textarea')!;
 const tb=[...dialog().querySelectorAll<HTMLButtonElement>('.trigger-button')];
 await act(async()=>tb[1]!.click());
 expect([...dialog().querySelectorAll('.trigger-menu .trigger-title')].map(x=>x.textContent)).toContain('/soan-de');
 await act(async()=>dialog().querySelector<HTMLButtonElement>('.trigger-menu [role=option]')!.click());
 expect(ta.value).toContain('/soan-de');
 await act(async()=>tb[2]!.click());
 expect([...dialog().querySelectorAll('.trigger-menu .trigger-title')].map(x=>x.textContent)).toContain('#giong-van');
 const save=[...host.querySelectorAll('button')].find(b=>b.textContent==='Lưu thay đổi')!;
 await act(async()=>save.click());
 const saved=mocks.rpc.mock.calls.find(c=>c[0]==='workflowSave')![1].workflow as Workflow;
 expect(saved.steps[0]!.files).toEqual(['/tmp/de.docx','/tmp/hinh.png']);
});

it('quy trình sinh từ Plan khóa nút đính kèm và xuất mẫu không mang đường dẫn tệp',async()=>{
 await open(wf({planId:'p'}));
 expect(dialog().querySelector<HTMLButtonElement>('[aria-label="Chèn tệp hoặc ảnh"]')!.disabled).toBe(true);
 expect(dialog().textContent).toContain('chưa nhận tệp riêng');
 const text=exportWorkflow({...wf(),steps:[{id:'A',name:'A',prompt:'p',choice:'auto',access:'read',files:['/Users/gv/bi-mat.docx']}]});
 expect(text).not.toContain('bi-mat');
});

it('! gợi ý chỉ thị và thay đúng token; #bien vẫn mở quy tắc',async()=>{
 await open(wf({steps:[{id:'A',name:'A',prompt:'!bi',choice:'auto',access:'read'}]}));
 const ta=dialog().querySelector<HTMLTextAreaElement>('[aria-label="Prompt của nút"]')!;
 await act(async()=>{ta.focus();ta.setSelectionRange(3,3);ta.dispatchEvent(new KeyboardEvent('keyup',{key:'ArrowRight',bubbles:true}));});
 const option=host.querySelector<HTMLButtonElement>('.wf-language [role=option]')!;
 expect(option.textContent).toContain('!bien');
 await act(async()=>option.click());
 expect(ta.value).toBe('!bien ');
 expect(dialog().querySelector('.trigger-menu')).toBeNull();
 const data=state(wf({steps:[{id:'A',name:'A',prompt:'#bi',choice:'auto',access:'read'}]}));
 data.data.ruleBook!.push({id:'bien',key:'bien',title:'Biến',text:'Quy tắc riêng',always:false,at:1});
 await act(async()=>root.render(React.createElement(WorkflowPanel,{key:'rule-test',state:data,report:vi.fn(),notice:vi.fn(),onAutoCreate:vi.fn(),selectedId:'w'})));
 await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Sửa bước: A"]')!.click());
 const rulesTa=dialog().querySelector<HTMLTextAreaElement>('[aria-label="Prompt của nút"]')!;
 await act(async()=>{rulesTa.focus();rulesTa.setSelectionRange(3,3);rulesTa.dispatchEvent(new KeyboardEvent('keyup',{key:'ArrowRight',bubbles:true}));});
 expect(dialog().querySelector('.trigger-menu')?.textContent).toContain('#bien');
 expect(dialog().querySelector('.wf-language [role=listbox]')).toBeNull();
});

it('chọn tệp đầu vào trong popup tạo chỉ thị ! với đường dẫn có ngoặc kép',async()=>{
 await open(wf());
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Gợi ý khai báo / trao đổi')!.click());
 mocks.pickFiles.mockResolvedValueOnce(['/tmp/Bài học.pdf']);
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Chọn tệp đầu vào')!.click());
 const preview=host.querySelector<HTMLTextAreaElement>('[aria-label="Bản xem trước prompt"]')!.value;
 const command=parsePrompt(preview,'A').commands[0]!;
 expect(command.kind).toBe('dau-vao');expect(inputPath(command.value)).toBe('/tmp/Bài học.pdf');
 expect(dialog().querySelector<HTMLTextAreaElement>('[aria-label="Prompt của nút"]')!.value).toBe('');
});

it('popup đề xuất chỉ thay prompt khi áp dụng, hủy giữ nguyên',async()=>{
 const original='!bien so-lan =';await open(wf({steps:[{id:'A',name:'A',prompt:original,choice:'auto',access:'read'}]}));
 const ta=dialog().querySelector<HTMLTextAreaElement>('[aria-label="Prompt của nút"]')!;
 await act(async()=>ta.dispatchEvent(new FocusEvent('focusout',{bubbles:true})));
 expect(host.querySelector('[aria-label="Trao đổi khai báo"]')).not.toBeNull();
 mocks.rpc.mockResolvedValueOnce('!bien so-lan = 0');
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Nhờ AI đề xuất')!.click());
 expect(ta.value).toBe(original);
 expect((host.querySelector('[aria-label="Bản xem trước prompt"]') as HTMLTextAreaElement).value).toBe('!bien so-lan = 0');
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Hủy')!.click());expect(ta.value).toBe(original);
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Gợi ý khai báo / trao đổi')!.click());
 mocks.rpc.mockResolvedValueOnce('!bien so-lan = 0');
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Nhờ AI đề xuất')!.click());
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Áp dụng')!.click());
 expect(ta.value).toBe('!bien so-lan = 0');
 await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Đóng cửa sổ sửa bước"]')!.click());
 await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Sửa bước: A"]')!.click());
 expect(dialog().querySelector<HTMLTextAreaElement>('[aria-label="Prompt của nút"]')!.value).toBe('!bien so-lan = 0');
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Lưu thay đổi')!.click());
 expect(mocks.rpc.mock.calls.find(c=>c[0]==='workflowSave')![1].workflow.steps[0].prompt).toBe('!bien so-lan = 0');
});

it('ẩn/hiện công cụ khung không thay prompt khai báo; gợi ý chỉ gửi bản nháp đang mở',async()=>{
 const prompt='!bien so-lan = 0\n!dau-ra = $so-lan';const w=wf({steps:[{id:'A',name:'A',prompt,choice:'auto',access:'read'}]});
 const data=state(w);data.data.workflows!.push(wf({id:'secret',name:'KHÔNG GỬI',steps:[{id:'outside',name:'private',prompt:'SECRET OTHER WORKFLOW',choice:'auto',access:'read'}]}));
 await act(async()=>root.render(React.createElement(WorkflowPanel,{state:data,report:vi.fn(),notice:vi.fn(),onAutoCreate:vi.fn(),selectedId:w.id})));
 const toggle=host.querySelector<HTMLButtonElement>('[title="Ẩn hoặc hiện hàng công cụ Khung bọc nút"]')!;
 expect(toggle).not.toBeNull();await act(async()=>toggle.click());await act(async()=>toggle.click());
 const help=host.querySelector<HTMLButtonElement>('[title="Ẩn hoặc hiện dòng hướng dẫn thao tác"]')!;await act(async()=>help.click());await act(async()=>help.click());
 await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Sửa bước: A"]')!.click());
 expect(dialog().querySelector('textarea')!.value).toBe(prompt);
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Gợi ý khai báo / trao đổi')!.click());
 mocks.rpc.mockResolvedValueOnce(prompt);
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Nhờ AI đề xuất')!.click());
 const sent=mocks.rpc.mock.calls.find(c=>c[0]==='workflowSuggest')![1];expect(sent.workflow.id).toBe(w.id);expect(JSON.stringify(sent)).not.toContain('SECRET');expect(sent.workflow.steps[0].prompt).toBe(prompt);
});


it('cho phép mở cửa sổ thêm mới prompt mẫu (@), skill (/), quy tắc (#) và quản lý từ nút quy trình',async()=>{
 const set=(el:HTMLInputElement|HTMLTextAreaElement,v:string)=>{const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));};
 await open(wf());
 const ta=dialog().querySelector<HTMLTextAreaElement>('[aria-label="Prompt của nút"]')!;
 const tb=[...dialog().querySelectorAll<HTMLButtonElement>('.trigger-button')];

 // 1. Mở prompt mẫu @ -> Thêm prompt mẫu mới
 await act(async()=>tb[0]!.click());
 const addPromptBtn=dialog().querySelector<HTMLButtonElement>('.trigger-add-btn')!;
 expect(addPromptBtn.textContent).toContain('Thêm prompt mẫu');
 await act(async()=>addPromptBtn.click());
 expect(host.querySelector('.modal header h2')?.textContent).toBe('Thêm prompt mẫu mới');
 const titleInput=host.querySelector<HTMLInputElement>('.modal input[required]')!;
 const textInput=host.querySelector<HTMLTextAreaElement>('.modal textarea[required]')!;
 await act(async()=>{
  set(titleInput,'Phiếu bài tập');
  set(textInput,'Soạn 5 câu trắc nghiệm');
 });
 mocks.rpc.mockResolvedValueOnce('prompt-123');
 await act(async()=>host.querySelector<HTMLFormElement>('.modal form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(mocks.rpc).toHaveBeenCalledWith('savePrompt',expect.objectContaining({prompt:expect.objectContaining({title:'Phiếu bài tập'})}));
 expect(host.querySelector('.modal')).toBeNull();
 expect(ta.value).toContain('@Phiếu bài tập');

 // 2. Mở skill / -> Viết skill mới
 await act(async()=>tb[1]!.click());
 const addSkillBtn=dialog().querySelector<HTMLButtonElement>('.trigger-add-btn')!;
 expect(addSkillBtn.textContent).toContain('Viết skill mới');
 await act(async()=>addSkillBtn.click());
 expect(host.querySelector('.modal header h2')?.textContent).toBe('Viết skill mới');
 const skillNameInput=host.querySelector<HTMLInputElement>('.modal input[required]')!;
 const skillBodyInput=host.querySelector<HTMLTextAreaElement>('.modal textarea[required]')!;
 await act(async()=>{
  set(skillNameInput,'cham-bai');
  set(skillBodyInput,'# Chấm bài');
 });
 mocks.rpc.mockResolvedValueOnce({installed:['cham-bai'],skipped:[]});
 await act(async()=>host.querySelector<HTMLFormElement>('.modal form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(mocks.rpc).toHaveBeenCalledWith('createSkill',expect.objectContaining({name:'cham-bai'}));
 expect(host.querySelector('.modal')).toBeNull();
 expect(ta.value).toContain('/cham-bai');

 // 3. Mở rule # -> Thêm quy tắc mới
 await act(async()=>tb[2]!.click());
 const addRuleBtn=dialog().querySelector<HTMLButtonElement>('.trigger-add-btn')!;
 expect(addRuleBtn.textContent).toContain('Thêm quy tắc');
 await act(async()=>addRuleBtn.click());
 expect(host.querySelector('.modal header h2')?.textContent).toBe('Thêm quy tắc mới');
 const ruleTitleInput=host.querySelector<HTMLInputElement>('.modal input[required]')!;
 const ruleTextInput=host.querySelector<HTMLTextAreaElement>('.modal textarea[required]')!;
 await act(async()=>{
  set(ruleTitleInput,'Dùng tiếng Việt');
  set(ruleTextInput,'Luôn trả lời tiếng Việt');
 });
 mocks.rpc.mockResolvedValueOnce('rule-1');
 await act(async()=>host.querySelector<HTMLFormElement>('.modal form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(mocks.rpc).toHaveBeenCalledWith('saveRule',expect.objectContaining({rule:expect.objectContaining({title:'Dùng tiếng Việt'})}));
 expect(host.querySelector('.modal')).toBeNull();
 expect(ta.value).toContain('#Dùng tiếng Việt');

 // 4. Quản lý mở các modal tương ứng
 await act(async()=>tb[0]!.click());
 const managePromptBtn=[...dialog().querySelectorAll<HTMLButtonElement>('.trigger-menu footer button')].find(b=>b.textContent?.includes('Quản lý'))!;
 await act(async()=>managePromptBtn.click());
 expect(host.querySelector('.modal header h2')?.textContent).toBe('Thư viện lời nhắc');
 await act(async()=>host.querySelector<HTMLButtonElement>('.modal header [aria-label="Đóng"]')!.click());
 expect(host.querySelector('.modal')).toBeNull();

 await act(async()=>tb[1]!.click());
 const manageSkillBtn=[...dialog().querySelectorAll<HTMLButtonElement>('.trigger-menu footer button')].find(b=>b.textContent?.includes('Quản lý'))!;
 await act(async()=>manageSkillBtn.click());
 expect(host.querySelector('.modal header h2')?.textContent).toBe('Quản lý kỹ năng');
 await act(async()=>host.querySelector<HTMLButtonElement>('.modal header [aria-label="Đóng"]')!.click());
 expect(host.querySelector('.modal')).toBeNull();

 await act(async()=>tb[2]!.click());
 const manageRuleBtn=[...dialog().querySelectorAll<HTMLButtonElement>('.trigger-menu footer button')].find(b=>b.textContent?.includes('Quản lý'))!;
 await act(async()=>manageRuleBtn.click());
 expect(host.querySelector('.modal header h2')?.textContent).toBe('Quản lý quy tắc');
 await act(async()=>host.querySelector<HTMLButtonElement>('.modal header [aria-label="Đóng"]')!.click());
 expect(host.querySelector('.modal')).toBeNull();
});
