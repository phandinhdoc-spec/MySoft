import {AsyncResource} from 'node:async_hooks';
import type {RpcEvent} from '../src/desktop/types';
import {beforeEach,describe,it,expect,vi,afterEach} from 'vitest';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {DesktopRuntime} from '../src/desktop/runtime';
import {failedTasks} from '../src/desktop/task-failure';

// Mỗi test có thư mục tạm dùng chung riêng (PVTA_RESULT_DIR), không ghi vào /tmp thật.
beforeEach(()=>{process.env.PVTA_RESULT_DIR=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'pvta-result-test-')),'PVTA-Ket-qua');});
const runtimes:DesktopRuntime[]=[];const roots:string[]=[];
afterEach(()=>{for(const r of runtimes)r.dispose();runtimes.length=0;for(const p of roots)fs.rmSync(p,{recursive:true,force:true});roots.length=0;});
function setup(emit:(event:RpcEvent)=>void=()=>{}){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-desktop-'));roots.push(dir);const r=new DesktopRuntime(emit,dir);runtimes.push(r);r.store.data.documentsDir=path.join(dir,'Documents');const spy=vi.spyOn(r.engine,'run');return {r,dir,spy};}
function request(r:DesktopRuntime,method:string,params:Record<string,unknown>={}){return r.dispatch({id:crypto.randomUUID(),method,params});}
/** Lệnh gọi đặt tên chạy nền không tính vào số lần trả lời. */
const isAnswer=(c:any[])=>!/Đặt một tên/.test(String(c[0]?.system??''));
function result(text:string){return {text,attempts:1,fullPrompt:true,timings:{totalMs:0}};}
describe('desktop approval boundary',()=>{
 it('proposes a new file, writes only once after approval, and rejects replay',async()=>{
  const {r,dir,spy}=setup();const output=path.join(process.env.PVTA_RESULT_DIR!,'result.md');const chatId=await request(r,'newChat');await request(r,'preferences',{patch:{choice:{backend:'api',model:'openai/mock'}}});
  spy.mockResolvedValue(result('```pvta-action\n'+JSON.stringify({kind:'write_text',path:output,content:'hello',reason:'Tạo tài liệu'})+'\n```'));
  await request(r,'send',{chatId,text:'Create a file'});expect(fs.existsSync(output)).toBe(false);
  const action=r.view().data.chats[0]!.messages[1]!.actions![0]!;await request(r,'approveAction',{id:action.id});expect(fs.readFileSync(output,'utf8')).toBe('hello');await expect(request(r,'approveAction',{id:action.id})).rejects.toThrow('không còn chờ');
 });
 it('Plan discards actions, preserves editable steps, and cannot write before approval',async()=>{
  const {r,dir,spy}=setup();const output=path.join(dir,'blocked.md');const chatId=await request(r,'newChat');await request(r,'preferences',{patch:{choice:{backend:'api',model:'openai/mock'}}});
  spy.mockResolvedValue(result('```pvta-action\n'+JSON.stringify({kind:'write_text',path:output,content:'bad'})+'\n```\n```pvta-plan\n'+JSON.stringify({title:'Plan',brief:{objective:'Đọc tệp',topic:'Tài liệu',documentType:'Báo cáo',subject:'Không áp dụng',grade:'Không áp dụng',output:'Tóm tắt nội dung',facts:[],proposals:[],assumptions:[],questions:[],sources:[],limitations:['Không cần nguồn ngoài']},steps:[{goal:'Read',task:'Read file',files:[],risk:'None'}]})+'\n```'));
  await request(r,'send',{chatId,text:'Plan',plan:true});const m=r.view().data.chats[0]!.messages[1]!;expect(m.actions).toEqual([]);expect(m.plan).toBeUndefined();expect(r.store.data.chats[0]!.planningDraft?.approved).toBe(false);expect(r.store.data.workflows??[]).toHaveLength(0);expect(fs.existsSync(output)).toBe(false);expect(spy.mock.calls[0]![0].permission).toBe('read');
 });
 it('parses pvta-plan in normal chat turn, creates plan and links to workflows',async()=>{
  const {r,spy}=setup();const chatId=await request(r,'newChat');await request(r,'preferences',{patch:{choice:{backend:'api',model:'openai/mock'}}});
  spy.mockResolvedValue(result('```pvta-plan\n'+JSON.stringify({title:'Plan từ chat',brief:{objective:'Mục tiêu',topic:'Chủ đề',documentType:'Kế hoạch',subject:'Không áp dụng',grade:'Không áp dụng',output:'Sản phẩm',facts:[],proposals:[],assumptions:[],questions:[],sources:[],limitations:['Không cần nguồn ngoài']},steps:[{goal:'Bước 1',task:'Việc 1',files:[],risk:'Không'}]})+'\n```'));
  await request(r,'send',{chatId,text:'Lập kế hoạch'});const m=r.view().data.chats[0]!.messages[1]!;
  expect(m.plan?.title).toBe('Plan từ chat');
  expect(r.view().data.workflows?.some(w=>w.name==='Plan từ chat')).toBe(true);
 });
 it('retains original data if state is corrupt',()=>{const {dir}=setup();const file=path.join(dir,'chatbox/state.json');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'invalid');expect(()=>new DesktopRuntime(()=>{},dir)).toThrow('giữ nguyên');expect(fs.readFileSync(file,'utf8')).toBe('invalid');});
 it('never returns a saved API key or leaks it in an error',async()=>{const {r}=setup();const key='sk-test-secret-1234567890';await request(r,'saveApi',{provider:'openai',key,model:'mock'});expect(JSON.stringify(r.view())).not.toContain(key);expect(r.publicError(Error(`provider rejected ${key}`))).not.toContain(key);});
});

describe('CommandCode desktop controls',()=>{
 it('retains the saved key and exposes the default model without exposing credentials',async()=>{
  const {r}=setup();const key='commandcode-test-secret-1234567890';
  await request(r,'saveApi',{provider:'commandcode',key,model:'vendor/first',models:[{id:'vendor/first'},{id:'vendor/second'}]});
  await request(r,'saveApi',{provider:'commandcode',key:'',model:'vendor/second',models:[{id:'vendor/first'},{id:'vendor/second'}]});
  const provider=r.view().api.find(a=>a.id==='commandcode');
  expect(provider).toMatchObject({configured:true,model:'vendor/second'});
  expect(provider?.models).toHaveLength(2);
  expect(r.config.get().api?.commandcode?.key).toBe(key);
  expect(JSON.stringify(r.view())).not.toContain(key);
 });
 it('uses CommandCode ahead of other APIs in auto mode when no CLI is ready',async()=>{
  const {r,spy}=setup();spy.mockResolvedValue(result('OK'));
  await request(r,'saveApi',{provider:'openai',key:'openai-test-key',model:'other'});
  await request(r,'saveApi',{provider:'commandcode',key:'commandcode-test-key',model:'vendor/chosen'});
  await request(r,'preferences',{patch:{choice:'auto',learning:false}});
  const chatId=await request(r,'newChat');await request(r,'send',{chatId,text:'Xin chào'});
  expect(spy.mock.calls[0]?.[0]).toMatchObject({backend:'api',model:'commandcode/vendor/chosen'});
 });
 it('honors an explicit choice of another API even when CommandCode is configured',async()=>{
  const {r,spy}=setup();spy.mockResolvedValue(result('OK'));
  await request(r,'saveApi',{provider:'commandcode',key:'commandcode-test-key',model:'vendor/chosen'});
  await request(r,'preferences',{patch:{choice:{backend:'api',model:'openai/selected'},learning:false}});
  const chatId=await request(r,'newChat');await request(r,'send',{chatId,text:'Xin chào'});
  expect(spy.mock.calls[0]?.[0]).toMatchObject({backend:'api',model:'openai/selected'});
 });
});

describe('desktop appearance preferences',()=>{
 it('persists palette and brightness independently across restart',async()=>{const {r,dir}=setup();await request(r,'preferences',{patch:{palette:'ocean',theme:'dark'}});const next=new DesktopRuntime(()=>{},dir);runtimes.push(next);expect(next.view().data.preferences).toMatchObject({palette:'ocean',theme:'dark'});});
 it('persists interface font and icon family across restart',async()=>{const {r,dir}=setup();await request(r,'preferences',{patch:{fontFamily:'be-vietnam-pro',iconStyle:'phosphor-duotone'}});const next=new DesktopRuntime(()=>{},dir);runtimes.push(next);expect(next.view().data.preferences).toMatchObject({fontFamily:'be-vietnam-pro',iconStyle:'phosphor-duotone'});});
 it('rejects unknown font or icon IDs without applying any other part of the patch',async()=>{const {r}=setup();for(const patch of [{fontFamily:'unknown',iconStyle:'tabler'},{fontFamily:'inter',iconStyle:'unknown'}])await expect(request(r,'preferences',{patch})).rejects.toThrow('không hợp lệ');expect(r.view().data.preferences.fontFamily).toBeUndefined();expect(r.view().data.preferences.iconStyle).toBeUndefined();});
 it('rejects unsupported palettes without changing preferences',async()=>{const {r}=setup();await expect(request(r,'preferences',{patch:{palette:'invalid',theme:'dark'}})).rejects.toThrow('Bảng màu');expect(r.view().data.preferences).toMatchObject({palette:'paper',theme:'system'});});
});

describe('Office authoring and bundled skills',()=>{
 it('installs Office skills on a fresh profile and preserves user changes on restart',()=>{
  const {r,dir}=setup();expect(r.skills.list().filter(s=>s.name.startsWith('office-'))).toHaveLength(14);expect(r.view().skills.filter(s=>s.name.startsWith('office-'))).toHaveLength(0);
  const file=path.join(r.skills.dir,'office-word','SKILL.md');fs.appendFileSync(file,'\nCustom rule.');const next=new DesktopRuntime(()=>{},dir);runtimes.push(next);expect(next.skills.read('office-word')?.body).toContain('Custom rule.');
 });
 it('proposes a real Office file without writing until approved and includes the requested skill',async()=>{
  const {r,dir,spy}=setup();const output=path.join(dir,'answers.docx');const chatId=await request(r,'newChat');await request(r,'preferences',{patch:{choice:{backend:'api',model:'openai/mock'}}});
  spy.mockResolvedValue(result('```pvta-action\n'+JSON.stringify({kind:'create_office',path:output,document:{title:'Đáp án',blocks:[{type:'paragraph',text:'Câu 1: A'}]},reason:'Tạo đáp án'})+'\n```'));
  await request(r,'send',{chatId,text:'/office-dap-an Tạo đáp án'});const action=r.view().data.chats[0]!.messages[1]!.actions![0]!;
  expect(action.kind).toBe('create_office');expect(fs.existsSync(output)).toBe(false);expect(spy.mock.calls[0]?.[0].system).toContain('office-dap-an');
 });
 it('rejects malformed Office previews and edits to unattached workbooks',async()=>{
  const {r,dir,spy}=setup();const chatId=await request(r,'newChat');await request(r,'preferences',{patch:{choice:{backend:'api',model:'openai/mock'}}});
  for(const a of [{kind:'create_office',path:path.join(dir,'bad.docx'),document:{blocks:[{type:'paragraph',text:{bad:true}}]}},{kind:'edit_excel',path:path.join(dir,'unattached.xlsx'),document:{sheets:[{name:'Data',cells:[]}]}}]){
   spy.mockResolvedValue(result('```pvta-action\n'+JSON.stringify(a)+'\n```'));await request(r,'send',{chatId,text:'Tạo tài liệu'});expect(r.view().data.chats[0]!.messages.at(-1)?.actions).toEqual([]);
  }
 });
});

describe('provider tool markup compatibility',()=>{
 it('executes DSML document search and returns an answer instead of exposing markup',async()=>{
  const {r,spy}=setup();const chatId=await request(r,'newChat');await request(r,'preferences',{patch:{choice:{backend:'api',model:'commandcode/mock'}}});
  r.store.data.attachments.push({id:'file',name:'Lịch trình.txt',path:'/tmp/fixture.txt',scope:'chat',scopeId:String(chatId),fingerprint:'test',image:false,segments:[{ref:'Ngày 7',text:'Ngày 7: nộp báo cáo và minh chứng sản phẩm.'}]});
  spy.mockResolvedValueOnce(result('<｜DSML｜function_calls>\n<｜DSML｜invoke name="office_rag_search">\n<｜DSML｜parameter name="query" string="true">Ngày 7 nộp báo cáo</｜DSML｜parameter>\n</｜DSML｜invoke>\n</｜DSML｜function_calls>')).mockResolvedValueOnce(result('Ngày 7: nộp báo cáo và minh chứng sản phẩm.'));
  await request(r,'send',{chatId,text:'Khi nào nộp?'});
  expect(spy.mock.calls.filter(isAnswer)).toHaveLength(2);expect(spy.mock.calls[1]?.[0].buildPrompt(false,false)).toContain('Ngày 7: nộp báo cáo');expect(r.view().data.chats[0]!.messages.at(-1)?.text).not.toContain('DSML');
 });
});

it('tells the model to answer PDF questions in chat and write only after the user agrees',async()=>{
 const {r,spy}=setup();const chatId=await request(r,'newChat');await request(r,'preferences',{patch:{choice:{backend:'api',model:'commandcode/mock'}}});
 spy.mockResolvedValueOnce(result('Công A = F.s = 5 × 0,5 = 2,5 J.'));
 await request(r,'send',{chatId,text:'Tính công của lực đẩy'});
 expect(spy.mock.calls.filter(isAnswer)[0]?.[0].buildPrompt(false,false)).not.toContain('QUY TẮC VỚI PDF');
 r.store.data.attachments.push({id:'pdf',name:'ON-LY-9.pdf',path:'/tmp/ON-LY-9.pdf',scope:'chat',scopeId:String(chatId),fingerprint:'p',image:true,segments:[]});
 spy.mockResolvedValueOnce(result('Công A = F.s = 2,5 J.'));
 await request(r,'send',{chatId,text:'giải'});
 const prompt=spy.mock.calls.filter(isAnswer).at(-1)?.[0].buildPrompt(false,false)??'';
 expect(prompt).toContain('QUY TẮC VỚI PDF');expect(prompt).toContain('trực tiếp trong khung chat');
});

it('keeps DSML writes behind approval and does not execute them during a model turn',async()=>{
 const {r,spy}=setup();const chatId=await request(r,'newChat');await request(r,'preferences',{patch:{choice:{backend:'api',model:'commandcode/mock'}}});
 vi.spyOn(r.office,'selectedSession').mockReturnValue({id:'paired',host:'word',name:'test.docx'});const execute=vi.spyOn(r.office,'execute');
 spy.mockResolvedValueOnce(result('<|DSML|calls><|DSML|invoke name="office_word_set_body"><|DSML|parameter name="text" string="true">New body</|DSML|parameter></|DSML|invoke></|DSML|calls>')).mockResolvedValueOnce(result('Đề xuất đang chờ duyệt.'));
 await request(r,'send',{chatId,text:'Sửa nội dung'});expect(execute).not.toHaveBeenCalled();expect(r.view().data.chats[0]!.messages.at(-1)?.actions?.[0]).toMatchObject({kind:'office_live',state:'pending',tool:'office_word_set_body'});
});

it('searches project files without leaking another project and reports image-only sources accurately',async()=>{
 const {r,spy}=setup();const chatId=await request(r,'newChat');r.store.data.chats[0]!.projectId='project-a';await request(r,'preferences',{patch:{choice:{backend:'api',model:'commandcode/mock'}}});
 for(const [id,scopeId,image,text] of [['ours','project-a',false,'Ngày 7 nộp báo cáo'],['secret','project-b',false,'SECRET other project'],['picture','project-a',true,'']] as const)r.store.data.attachments.push({id,name:id+'.txt',path:'/tmp/'+id,scope:'project',scopeId,fingerprint:id,image,segments:image?[]:[{ref:'Dòng 1',text}]});
 spy.mockResolvedValueOnce(result('```pvta-read\n{"tool":"office_rag_search","args":{"query":"Ngày 7 báo cáo SECRET"}}\n```')).mockResolvedValueOnce(result('Đã tìm thấy.'));
 await request(r,'send',{chatId,text:'Tìm lịch'});const followup=spy.mock.calls[1]![0].buildPrompt(false,false);expect(followup).toContain('Ngày 7 nộp báo cáo');expect(followup).not.toContain('SECRET other project');expect(followup).toContain('picture.txt');
});

it('bounds repeated provider calls and never saves raw protocol markup',async()=>{
 const {r,spy}=setup();const chatId=await request(r,'newChat');await request(r,'preferences',{patch:{choice:{backend:'api',model:'commandcode/mock'}}});
 spy.mockResolvedValue(result('<｜DSML｜calls><｜DSML｜invoke name="unavailable"></｜DSML｜invoke></｜DSML｜calls>'));
 await request(r,'send',{chatId,text:'Thử'});expect(spy.mock.calls.filter(isAnswer)).toHaveLength(5);expect(r.view().data.chats[0]!.messages.at(-1)?.text).not.toContain('DSML');expect(r.view().data.chats[0]!.messages.at(-1)?.text).toContain('chưa hoàn tất');
});

it('optimizes using the active project sources, history and rules instead of a fill-in template',async()=>{
 const {r,spy}=setup();const chatId=await request(r,'newChat');await request(r,'preferences',{patch:{choice:{backend:'api',model:'commandcode/mock'},rag:false}});
 r.store.data.projects.push({id:'stem',name:'STEM lớp 9',rules:'Hoàn thành trong 7 ngày kể cả cuối tuần.'});const c=r.store.data.chats[0]!;c.projectId='stem';c.messages.push({id:'previous',role:'user',at:0,text:'Sản phẩm là mô hình tưới cây tự động.'});
 r.store.data.attachments.push({id:'guide',name:'Hướng dẫn.txt',path:'/tmp/guide.txt',scope:'project',scopeId:'stem',fingerprint:'g',image:false,segments:[{ref:'Mục 2',text:'Nhóm nộp nhật ký thiết kế, báo cáo thử nghiệm và video sản phẩm.'}]});
 spy.mockResolvedValue(result('Lập kế hoạch 7 ngày cho mô hình tưới cây tự động, dựa trên Hướng dẫn.txt.'));
 const output=await request(r,'optimize',{chatId,text:'Soạn hướng dẫn cho học sinh'});
 const prompt=spy.mock.calls[0]![0].buildPrompt(false,false);expect(prompt).toContain('báo cáo thử nghiệm');expect(prompt).toContain('tưới cây tự động');expect(prompt).toContain('7 ngày');expect(spy.mock.calls[0]![0].system).not.toContain('thiếu để [điền]');expect(output).toContain('Hướng dẫn.txt');expect(c.messages).toHaveLength(1);
});


it('lets the optimizer read attached sources, passes images and excludes other projects',async()=>{
 const {r,spy}=setup();const chatId=await request(r,'newChat');r.store.data.chats[0]!.projectId='ours';
 await request(r,'preferences',{patch:{choice:{backend:'api',model:'commandcode/mock'}}});
 for(const [id,scopeId,image,text] of [['guide','ours',false,'Nộp báo cáo ngày 7.'],['secret','other',false,'PRIVATE unrelated'],['image','ours',true,'']] as const)r.store.data.attachments.push({id,name:id+'.txt',path:'/tmp/'+id,scope:'project',scopeId,fingerprint:id,image,segments:image?[]:[{ref:'1',text}]});
 spy.mockResolvedValueOnce(result('```pvta-read\n{"tool":"office_file_read","args":{"name":"guide.txt"}}\n```')).mockResolvedValueOnce(result('Dựa vào guide.txt, soạn hướng dẫn nộp báo cáo ngày 7.'));
 const output=await request(r,'optimize',{chatId,text:'Soạn hướng dẫn'});
 expect(output).toContain('ngày 7');expect(spy).toHaveBeenCalledTimes(2);
 const followup=spy.mock.calls[1]![0];expect(followup.buildPrompt(false,false)).toContain('Nộp báo cáo ngày 7.');expect(followup.buildPrompt(false,false)).not.toContain('PRIVATE unrelated');expect(followup.images).toEqual(['/tmp/image']);expect(r.store.data.chats[0]!.messages).toEqual([]);
});

it('blocks writes during optimization and repairs blank templates using the same context',async()=>{
 const {r,spy}=setup();const chatId=await request(r,'newChat');await request(r,'preferences',{patch:{choice:{backend:'api',model:'commandcode/mock'}}});const execute=vi.spyOn(r.office,'execute');
 spy.mockResolvedValueOnce(result('```pvta-read\n{"tool":"office_word_set_body","args":{"text":"Do not write"}}\n```')).mockResolvedValueOnce(result('Soạn bài cho [điền chủ đề].')).mockResolvedValueOnce(result('Soạn hướng dẫn thiết kế mô hình tưới cây.'));
 const output=await request(r,'optimize',{chatId,text:'Hướng dẫn thiết kế mô hình tưới cây'});
 expect(execute).not.toHaveBeenCalled();expect(spy).toHaveBeenCalledTimes(3);expect(spy.mock.calls[1]![0].buildPrompt(false,false)).toContain('không chạy công cụ ghi');expect(spy.mock.calls[2]![0].buildPrompt(false,false)).toContain('Hướng dẫn thiết kế mô hình tưới cây');expect(output).not.toContain('[điền');
});


describe('result files and guarded undo',()=>{
 async function create(){const {r,dir,spy}=setup();const chatId=await request(r,'newChat');await request(r,'preferences',{patch:{choice:{backend:'api',model:'openai/mock'}}});const file=path.join(dir,'result.md');spy.mockResolvedValue(result('```pvta-action\n'+JSON.stringify({kind:'write_text',path:file,content:'Original result',reason:'Test'})+'\n```'));await request(r,'send',{chatId,text:'Create'});const a=r.store.data.chats[0]!.messages[1]!.actions![0]!;await request(r,'approveAction',{id:a.id});return {r,dir,file:a.path,a};}
 it('saves a separate copy and archives an unmodified result without touching the copy',async()=>{const {r,dir,file,a}=await create();const copy=path.join(dir,'copy.md');await request(r,'saveOutput',{id:a.id,path:copy});await expect(request(r,'saveOutput',{id:a.id,path:copy})).rejects.toThrow();await request(r,'undoOutput',{id:a.id});expect(fs.existsSync(file)).toBe(false);expect(fs.readFileSync(copy,'utf8')).toBe('Original result');expect(fs.readFileSync(a.backup!,'utf8')).toBe('Original result');expect(a.state).toBe('undone');await expect(request(r,'undoOutput',{id:a.id})).rejects.toThrow();});
 it('tracks savedPath when saving a copy, exposes it to AI context, and opens or reconstructs the file reliably',async()=>{
  const {r,dir,file,a}=await create();
  const copy=path.join(dir,'Saved-By-User.md');
  await request(r,'saveOutput',{id:a.id,path:copy});
  expect(a.savedPath).toBe(copy);
  expect(a.savedPaths).toContain(copy);
  // Mesmo khi bản gốc bị xóa/di chuyển, openOutput vẫn mở được bản sao đã lưu
  fs.unlinkSync(file);
  const opened=await request(r,'openOutput',{id:a.id}) as {path:string};
  expect(opened.path).toBe(copy);
  // Nếu cả bản sao và bản gốc đều bị xóa ngoài Finder, openOutput tự khôi phục lại tệp từ dữ liệu trong thẻ rồi mở
  fs.unlinkSync(copy);
  const recovered=await request(r,'openOutput',{id:a.id}) as {path:string};
  expect(recovered.path).toBe(copy);
  expect(fs.existsSync(copy)).toBe(true);
  expect(fs.readFileSync(copy,'utf8')).toBe('Original result');
 });

 it('refuses undo after the user edits the result and refuses a changed save extension',async()=>{const {r,dir,file,a}=await create();await expect(request(r,'saveOutput',{id:a.id,path:path.join(dir,'wrong.docx')})).rejects.toThrow('cùng định dạng');fs.writeFileSync(file,'User edits');await expect(request(r,'undoOutput',{id:a.id})).rejects.toThrow('đã được chỉnh sửa');expect(fs.readFileSync(file,'utf8')).toBe('User edits');expect(a.state).toBe('done');});
});

describe('Typst draft workflow',()=>{
 it('routes beautification to a source/PDF proposal and suppresses writes in Plan',async()=>{
  const {r,dir,spy}=setup();const chatId=await request(r,'newChat');
  await request(r,'preferences',{patch:{choice:{backend:'api',model:'openai/mock'}}});
  const output=path.join(dir,'layout.zip');
  spy.mockResolvedValue(result('```pvta-action\n'+JSON.stringify({kind:'create_typst',path:output,content:'= Báo cáo\nNội dung',reason:'Dàn trang'})+'\n```'));
  await request(r,'send',{chatId,text:'Làm đẹp bản nháp'});
  expect(spy.mock.calls[0]?.[0].system).toContain('LÀM ĐẸP BẢN NHÁP BẰNG TYPST');
  expect(r.view().data.chats[0]!.messages.at(-1)?.actions?.[0]?.kind).toBe('create_typst');
  expect(fs.existsSync(output)).toBe(false);
  await request(r,'send',{chatId,text:'Lập kế hoạch Typst',plan:true});
  expect(r.view().data.chats[0]!.messages.at(-1)?.actions).toEqual([]);
 });
});

describe('Office beautification uses the existing add-in',()=>{
 it('asks to open Office without calling AI or proposing file mutations',async()=>{
  const {r,spy}=setup();const chatId=String(await request(r,'newChat'));
  r.store.data.attachments.push({id:'office-file',name:'report.docx',path:'/tmp/report.docx',scope:'chat',scopeId:chatId,fingerprint:'test',segments:[]});
  await request(r,'send',{chatId,text:'Làm đẹp tài liệu đã đính kèm'});
  const msg=r.view().data.chats[0]!.messages.at(-1)!;
  expect(msg.text).toContain('mở tệp trong ứng dụng Office');expect(msg.text).toContain('add-in PVTA');
  expect(msg.actions).toEqual([]);expect(spy).not.toHaveBeenCalled();
 });
});

describe('Thông báo lỗi AI trong hội thoại',()=>{
 it.each(['Quota exceeded','Network connection lost'])('giữ đúng đích lỗi %s qua lần khởi động lại',async reason=>{
  const {r,dir,spy}=setup();await request(r,'preferences',{patch:{choice:{backend:'api',model:'openai/mock'},learning:false}});
  const chatId=await request(r,'newChat');spy.mockRejectedValue(Error(reason));
  await expect(request(r,'send',{chatId,text:'Soạn bài'})).rejects.toThrow(reason);
  const before=failedTasks(r.view().data.chats);
  expect(before).toHaveLength(1);expect(before[0]).toMatchObject({chatId,reason});
  r.dispose();const reopened=new DesktopRuntime(()=>{},dir);runtimes.push(reopened);
  expect(failedTasks(reopened.view().data.chats)).toEqual(before);
  const retry=vi.spyOn(reopened.engine,'run').mockResolvedValue(result('Đã hoàn tất'));
  await request(reopened,'send',{chatId,text:'Thử lại'});
  expect(retry).toHaveBeenCalled();expect(failedTasks(reopened.view().data.chats)).toEqual([]);
 });
 it('lưu nguyên nhân AI cùng tin nhắn lỗi để mở đúng tác vụ',async()=>{
  const {r,spy}=setup();await request(r,'preferences',{patch:{choice:{backend:'api',model:'openai/mock'},learning:false}});const chatId=await request(r,'newChat');
  spy.mockRejectedValue(Error('Quota exceeded'));
  await expect(request(r,'send',{chatId,text:'Soạn bài'})).rejects.toThrow('Quota');
  expect(r.view().data.chats.find(c=>c.id===chatId)?.messages.at(-1)).toMatchObject({error:true,failure:{source:'ai',reason:'Quota exceeded'}});
 });
});

it('không tạo thông báo lỗi AI khi người dùng bấm Dừng',async()=>{
 const {r,spy}=setup();await request(r,'preferences',{patch:{choice:{backend:'api',model:'openai/mock'},learning:false}});const chatId=await request(r,'newChat');
 spy.mockImplementation(async()=>{await request(r,'cancel',{chatId});throw Error('cancelled');});
 await expect(request(r,'send',{chatId,text:'Soạn bài'})).rejects.toThrow();
 expect(r.view().data.chats.find(c=>c.id===chatId)?.messages.at(-1)?.failure).toBeUndefined();
});

describe('kết nối công cụ ngoài (MCP)',()=>{
 it('mặc định tắt, không gửi mcp cho engine',async()=>{
  const {r,spy}=setup();spy.mockResolvedValue(result('OK'));
  await request(r,'preferences',{patch:{choice:{backend:'api',model:'openai/mock'},learning:false}});
  const chatId=await request(r,'newChat');await request(r,'send',{chatId,text:'Xin chào'});
  expect(r.view().data.preferences.mcp).toBeUndefined();
  expect(spy.mock.calls.find(c=>isAnswer(c))?.[0].mcp).toBeUndefined();
 });
 it('lưu trạng thái, chỉ giữ tên đúng dạng mcp__server__tool và chuyển cho engine',async()=>{
  const {r,spy}=setup();spy.mockResolvedValue(result('OK'));
  await request(r,'preferences',{patch:{choice:{backend:'api',model:'openai/mock'},learning:false,mcp:{enabled:true,allowedTools:['mcp__drive__search','Bash','mcp__drive__search','rm -rf']}}});
  expect(r.view().data.preferences.mcp).toEqual({enabled:true,allowedTools:['mcp__drive__search']});
  const chatId=await request(r,'newChat');await request(r,'send',{chatId,text:'Xin chào'});
  expect(spy.mock.calls.find(c=>isAnswer(c))?.[0].mcp).toEqual({enabled:true,allowedTools:['mcp__drive__search']});
  await request(r,'preferences',{patch:{mcp:{enabled:false,allowedTools:[]}}});
  expect(r.view().data.preferences.mcp?.enabled).toBe(false);
  await expect(request(r,'preferences',{patch:{mcp:'x'}})).rejects.toThrow();
 });
});

describe('live AI execution progress',()=>{
 it('routes public tool events to the correct chat even from a pre-existing async resource',async()=>{
  const source=new AsyncResource('external-cli'),events:RpcEvent[]=[];const {r,spy}=setup(event=>events.push(event));const chatId=await request(r,'newChat');await request(r,'preferences',{patch:{choice:{backend:'api',model:'openai/mock'}}});
  spy.mockImplementation(async req=>{source.runInAsyncScope(()=>{req.onProgress?.({id:'tool1',kind:'tool',title:'Đọc tệp',state:'running',at:1,input:'bai.md'});req.onProgress?.({id:'tool1',kind:'tool',title:'Đọc tệp',state:'done',at:1,endedAt:2,output:'Đã đọc'});req.onDelta?.('Câu trả lời');});return result('Câu trả lời');});
  await request(r,'send',{chatId,text:'Đọc tài liệu'});source.emitDestroy();
  const progress=events.filter((event):event is Extract<RpcEvent,{event:'progress'}>=>event.event==='progress');
  expect(progress.length).toBeGreaterThanOrEqual(5);expect(progress.every(event=>event.data.chatId===chatId)).toBe(true);
  expect(progress.map(event=>event.data.entry)).toContainEqual(expect.objectContaining({title:'Đọc tệp',state:'done',output:'Đã đọc'}));
  expect(progress.at(-1)?.data.entry).toMatchObject({kind:'model',state:'done'});
 });
 it('emits live tool results for provider read calls without putting their raw JSON in the answer',async()=>{
  const events:RpcEvent[]=[];const {r,spy}=setup(event=>events.push(event));const chatId=await request(r,'newChat');await request(r,'preferences',{patch:{choice:{backend:'api',model:'openai/mock'}}});
  spy.mockResolvedValueOnce(result('```pvta-read\n{"tool":"office_history_search","args":{"query":"bài học"}}\n```')).mockResolvedValue(result('Đã tra cứu.'));
  const answer=await request(r,'send',{chatId,text:'Tra cứu bài học cũ'}) as {text:string};
  const tools=events.filter((event):event is Extract<RpcEvent,{event:'progress'}>=>event.event==='progress').map(event=>event.data.entry).filter(entry=>entry.kind==='tool');
  expect(tools.map(entry=>entry.state)).toEqual(['running','done']);expect(tools[0]?.title).toBe('Tra cứu lịch sử');expect(tools[1]?.output).toBeDefined();expect(answer.text).not.toContain('pvta-read');
 });
});

it('streams source quota updates, preserves both windows and applies reasoning and speed settings',async()=>{
 const events:RpcEvent[]=[];const {r,spy}=setup(event=>events.push(event));const chatId=await request(r,'newChat');
 await request(r,'preferences',{patch:{choice:{backend:'claude',model:'opus',speed:'fast'},effort:'medium'}});
 (r as unknown as {backends:unknown[]}).backends=[{id:'claude',installed:true,auth:'ready',efforts:['low','medium','high']}];
 spy.mockImplementation(async req=>{req.onUsage?.({fiveHour:{usedPercent:10},updatedAt:1});req.onUsage?.({week:{usedPercent:20},updatedAt:2});return result('Xong');});
 await request(r,'send',{chatId,text:'Xin chào'});
 expect(spy.mock.calls[0]![0]).toMatchObject({backend:'claude',speed:'fast',effort:'medium'});
 expect(r.view().modelUsage?.claude).toMatchObject({fiveHour:{usedPercent:10},week:{usedPercent:20},updatedAt:2});
 const usageEvents=events.filter((event):event is Extract<RpcEvent,{event:'usage'}>=>event.event==='usage');expect(usageEvents.length).toBeGreaterThanOrEqual(2);expect(usageEvents.at(-1)?.data.usage).toMatchObject({fiveHour:{usedPercent:10},week:{usedPercent:20}});
 await request(r,'preferences',{patch:{effort:null}});expect(r.view().data.preferences.effort).toBeNull();
 await expect(request(r,'preferences',{patch:{effort:'invalid'}})).rejects.toThrow('Mức suy nghĩ');
});
it('accepts and saves all ten colored icon preferences',async()=>{
 const {COLOR_ICON_STYLES}=await import('../../shared/src/appearance');const {r}=setup();
 expect(COLOR_ICON_STYLES).toHaveLength(10);
 for(const option of COLOR_ICON_STYLES){await request(r,'preferences',{patch:{iconStyle:option.id}});expect(r.view().data.preferences.iconStyle).toBe(option.id);}
 await expect(request(r,'preferences',{patch:{iconStyle:'color-missing'}})).rejects.toThrow('Bộ biểu tượng');
 expect(r.view().data.preferences.iconStyle).toBe('color-origami');
});
it('persists composer icon size and validates bounds before applying a patch',async()=>{
 const {r,dir}=setup();await request(r,'preferences',{patch:{toolbarIconSize:22}});const next=new DesktopRuntime(()=>{},dir);runtimes.push(next);expect(next.view().data.preferences.toolbarIconSize).toBe(22);
 for(const size of [0,13,25,NaN,'20'])await expect(request(r,'preferences',{patch:{toolbarIconSize:size,fontSize:24}})).rejects.toThrow('Kích thước icon');expect(r.view().data.preferences.toolbarIconSize).toBe(22);
});

it('recovers a PowerPoint outline into an approvable PPTX after calculation',async()=>{
 const {r,dir,spy}=setup();const chatId=await request(r,'newChat');await request(r,'preferences',{patch:{access:'ask',learning:false,choice:{backend:'api',model:'openai/mock'}}});
 const action={kind:'create_office',path:path.join(dir,'pressure.pptx'),document:{slides:[{title:'Áp suất',bullets:['Công thức: p = F/S'],notes:'Giải thích áp suất'}]},reason:'Tạo bài giảng'};
 spy.mockImplementation(async req=>{if(!isAnswer([req]))return result('Áp suất');const prompt=String(req.buildPrompt(false,false));if(prompt.includes('HOÀN TẤT TỆP POWERPOINT'))return result('```pvta-action\n'+JSON.stringify(action)+'\n```');if(prompt.includes('KẾT QUẢ PYTHON'))return result('Slide 1 — Áp suất\nĐáp án: 25000 Pa.\nGhi chú thuyết trình: giải thích diện tích.');return result('```pvta-calc\n{"expression":"500/0.02"}\n```');});
 await request(r,'send',{chatId,text:'Soạn ppt về áp suất, tính 500/0.02'});
 const message=r.view().data.chats[0]!.messages.at(-1)!;
 expect(message.actions).toHaveLength(1);expect(message.actions![0]).toMatchObject({kind:'create_office',state:'pending'});
 expect(fs.existsSync(message.actions![0]!.path)).toBe(false);
 await request(r,'approveAction',{id:message.actions![0]!.id});
 expect(fs.readFileSync(message.actions![0]!.path).subarray(0,2).toString()).toBe('PK');
 expect(r.view().data.chats[0]!.messages.at(-1)!.actions![0]!.state).toBe('done');
});

it.each(['read','ask'] as const)('does not force file creation for read-only or outline requests (%s)',async access=>{
 const {r,spy}=setup();const chatId=await request(r,'newChat');await request(r,'preferences',{patch:{access,learning:false,choice:{backend:'api',model:'openai/mock'}}});
 spy.mockResolvedValue(result('Nội dung tham khảo.'));
 await request(r,'send',{chatId,text:access==='read'?'Soạn ppt về áp suất':'Chỉ soạn dàn ý slide, chưa tạo file'});
 expect(spy.mock.calls.filter(isAnswer)).toHaveLength(1);
 const message=r.view().data.chats[0]!.messages.at(-1)!;expect(message.actions).toEqual([]);
 if(access==='read')expect(message.text).toContain('Chưa tạo tệp PowerPoint');
});
it('reports missing PPTX rather than silently treating prose as a finished file',async()=>{
 const {r,spy}=setup();const chatId=await request(r,'newChat');await request(r,'preferences',{patch:{access:'ask',learning:false,choice:{backend:'api',model:'openai/mock'}}});
 spy.mockResolvedValue(result('Slide 1: Áp suất.'));
 await request(r,'send',{chatId,text:'Tạo PowerPoint về áp suất'});
 expect(spy.mock.calls.filter(isAnswer)).toHaveLength(2);expect(r.view().data.chats[0]!.messages.at(-1)?.text).toContain('Chưa tạo được tệp .pptx');
});
it('snapshots only attached images into a PowerPoint action',async()=>{
 const {r,dir,spy}=setup();const chatId=String(await request(r,'newChat'));await request(r,'preferences',{patch:{access:'ask',learning:false,choice:{backend:'api',model:'openai/mock'}}});
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');const source=path.join(dir,'source.png');fs.writeFileSync(source,png);
 r.store.data.attachments.push({id:'image',name:'source.png',path:source,scope:'chat',scopeId:chatId,fingerprint:'test',image:true,segments:[]});
 const proposal=(attachment:string)=>result('```pvta-action\n'+JSON.stringify({kind:'create_office',path:path.join(dir,'deck.pptx'),document:{theme:'sage',slides:[{title:'Ảnh',layout:'visual',image:{attachment,caption:'Ảnh nguồn'}}]}})+'\n```');
 spy.mockResolvedValue(proposal('source.png'));await request(r,'send',{chatId,text:'Dùng ảnh này'});
 const a=r.view().data.chats[0]!.messages.at(-1)!.actions![0]!;expect((a.document as any).slides[0].image.data).toBe(png.toString('base64'));
 spy.mockResolvedValue(proposal('/private/not-attached.png'));await request(r,'send',{chatId,text:'Dùng ảnh khác'});expect(r.view().data.chats[0]!.messages.at(-1)!.actions).toEqual([]);
});

it('loads all assessment stages for a complete exam request',async()=>{
 const {r,spy}=setup();const chatId=await request(r,'newChat');await request(r,'preferences',{patch:{learning:false,choice:{backend:'api',model:'openai/mock'}}});spy.mockResolvedValue(result('Cần tài liệu nguồn.'));
 await request(r,'send',{chatId,text:'Soạn đề kiểm tra từ ma trận và đặc tả, kèm đáp án'});
 const system=spy.mock.calls.filter(isAnswer)[0]![0].system!;
 for(const name of ['office-doc-dac-ta','office-doc-ma-tran','office-sinh-de','office-dap-an','office-ho-so-kiem-tra'])expect(system).toContain('[Dữ liệu quy trình '+name+']');
});
it('backs up edits through RPC and restores exact installed skill content',async()=>{
 const {r}=setup();const name='my-matrix';fs.mkdirSync(path.join(r.skills.dir,name));fs.writeFileSync(path.join(r.skills.dir,name,'SKILL.md'),'---\nname: my-matrix\ndescription: Quy trình cá nhân\nload: demand\n---\nNội dung gốc.');const detail:any=await request(r,'skillDetail',{name});
 await expect(request(r,'saveSkillEdit',{name,text:detail.text,backupId:'not-created'})).rejects.toThrow();
 const opened:any=await request(r,'beginSkillEdit',{name});expect(opened.backups).toHaveLength(1);
 const saved:any=await request(r,'saveSkillEdit',{name,backupId:opened.backupId,text:detail.text+'\nQuy tắc riêng của giáo viên.\n'});expect(saved.text).toContain('Quy tắc riêng');
 const restored:any=await request(r,'restoreSkillBackup',{name,backupId:opened.backupId,revision:saved.revision});expect(restored.text).toBe(detail.text);expect(restored.backups).toHaveLength(2);
});
it.each(['manual','off'])('assessment routing respects %s skill load mode',async load=>{
 const {r,spy}=setup();const name='office-doc-ma-tran';const file=path.join(r.skills.dir,name,'SKILL.md');fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('load: demand','load: '+load));
 const chatId=await request(r,'newChat');await request(r,'preferences',{patch:{learning:false,choice:{backend:'api',model:'openai/mock'}}});spy.mockResolvedValue(result('Đọc nguồn.'));
 await request(r,'send',{chatId,text:'Đọc ma trận'});expect(spy.mock.calls.filter(isAnswer).at(-1)![0].system).not.toContain('[Dữ liệu quy trình '+name+']');
 await request(r,'send',{chatId,text:'/office-doc-ma-tran Đọc ma trận'});const prompt=spy.mock.calls.filter(isAnswer).at(-1)![0].system!;expect(prompt.includes('[Dữ liệu quy trình '+name+']')).toBe(load==='manual');
});

describe('live activity across windows',()=>{
 it('publishes active chat jobs in snapshots and clears them after completion',async()=>{
  const {r,spy}=setup();await request(r,'preferences',{patch:{choice:{backend:'api',model:'openai/mock'},learning:false}});
  const chatId=await request(r,'newChat');let release!:(v:any)=>void;
  spy.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
  const pending=request(r,'send',{chatId,text:'Xin chào'});
  await vi.waitFor(()=>expect(spy).toHaveBeenCalled());
  try{expect((r.view() as any).activeChatIds).toContain(chatId);}finally{release(result('Đã xong'));await pending;}
  expect((r.view() as any).activeChatIds).not.toContain(chatId);
 });
});

describe('Brain in read-only projects',()=>{
 it('exposes symbol lookup without granting write permission or writing an index into the project',async()=>{
  const {r,dir,spy}=setup();const source=path.join(dir,'source');fs.mkdirSync(source);
  const binary=path.join(dir,'brain-fixture');
  // CLI giả theo giao thức hai tầng: overview in TẦNG 1, find trả JSON. Phạm vi/chỉ mục không được kế thừa từ môi trường.
  fs.writeFileSync(binary,`#!${process.execPath}\nif(process.env.PVTA_BRAIN_INDEX||process.env.PVTA_BRAIN_ONLY)throw Error('Scope must come from PVTA');const a=process.argv[2];console.log(a==='overview'?'TẦNG 1 · TOÀN DỰ ÁN: 1 tệp':a==='find'?JSON.stringify({symbols:[{name:'WorkflowGraph',path:'WorkflowGraph.tsx',line:1}],files:[]}):JSON.stringify({indexed:true}));\n`,{mode:0o700});
  vi.stubEnv('PVTA_BRAIN',binary);
  try {
   const chatId=await request(r,'newChat');r.store.data.chats[0]!.sourceFolders=[source];
   await request(r,'preferences',{patch:{access:'read',choice:{backend:'api',model:'openai/mock'},learning:false}});
   let turn=0;spy.mockImplementation(async input=>{
    if(/Đặt một tên/.test(input.system??''))return result('Brain');
    return result(turn++===0?'```pvta-read\n{"tool":"brain_find","args":{"query":"WorkflowGraph"}}\n```':'Đã tìm thấy component.');
   });
   await request(r,'send',{chatId,text:'Tìm component WorkflowGraph'});
   const answers=spy.mock.calls.filter(isAnswer);
   expect(answers[0]![0].system).toContain('brain_find');
   expect(answers[1]![0].buildPrompt(false,false)).toContain('WorkflowGraph.tsx');
   expect(answers.every(c=>c[0].permission==='read'&&!c[0].workspaceWrite)).toBe(true);
   expect(fs.readdirSync(source)).toEqual([]);
  }finally{vi.unstubAllEnvs();}
 });
});
