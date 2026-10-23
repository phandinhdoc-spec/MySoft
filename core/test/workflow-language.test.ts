import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {WorkflowRunner,normalizeWorkflow} from '../src/desktop/workflows';
import {compileWorkflow,parsePrompt,inputPath,languageSuggestions,WorkflowMachine,validateImplementation,functionSignature,hasWorkflowLanguage} from '../src/desktop/workflow-language';
import {parseExpression,evaluate} from '../src/desktop/workflow-expression';
import {DesktopStore} from '../src/desktop/storage';
const step=(id:string,prompt:string,dependsOn:string[]=[])=>({id,name:id,prompt,dependsOn});
const make=(steps:ReturnType<typeof step>[],frames:unknown[]=[])=>normalizeWorkflow({name:'Đếm',mode:'parallel',steps,frames});

describe('ngôn ngữ biểu thức',()=>{
 it('tính có ưu tiên, mảng, đối tượng, dấu gạch nối và trường đầu ra',()=>{
  expect(evaluate(parseExpression('{tong: $lan-tinh.tong + 2 * 3, values: [true, "xin chào", null]}'),()=>({tong:4}))).toEqual({tong:10,values:[true,'xin chào',null]});
  expect(evaluate(parseExpression('false && (1 / 0 == 2)'),()=>null)).toBe(false);
 });
 it.each(['process.exit()','$x.constructor','{__proto__: 1}','1; 2','a','[1','1 +','1 / 0'])('từ chối biểu thức %s',value=>{expect(()=>evaluate(parseExpression(value),()=>null)).toThrow();});
 it.each(['"/tmp/de bai.pdf"','“/tmp/de bai.pdf”','"![Hình](/tmp/de bai.pdf)"','"[Đề](</tmp/de bai.pdf>)"'])('đường dẫn có ngoặc kép %s',v=>expect(inputPath(v)).toBe('/tmp/de bai.pdf'));
 it.each(['/tmp/de bai.pdf','![Hình](/tmp/de bai.pdf)','[Đề](</tmp/de bai.pdf>)'])('không nhận đường dẫn thiếu ngoặc kép %s',v=>expect(()=>inputPath(v)).toThrow('nháy kép'));
 it('ký hiệu # chỉ là quy tắc, kể cả tên trùng chỉ thị',()=>{
  const prompt='#bien x = 1\n#ham\n#in';
  expect(parsePrompt(prompt,'a')).toEqual({commands:[],text:prompt});
  expect(hasWorkflowLanguage(make([step('a',prompt)]))).toBe(false);
  expect(hasWorkflowLanguage(make([step('a','!bien x = 1')]))).toBe(true);
  expect(languageSuggestions(make([step('a','!bien x = 1')]),'a').items.map(x=>x.label)).toContain('!ham');
 });
 it('giữ quy tắc và placeholder; ví dụ trong fence không chạy',()=>{
  const p=parsePrompt('#giong-van\n{{input}} {{prev}}\n```text\n!bien x = 0\n```\n!bien so-lan = 0','a');
  expect(p.commands).toHaveLength(1);expect(p.text).toContain('#giong-van');expect(p.text).toContain('{{input}} {{prev}}');expect(p.text).toContain('!bien x = 0');
 });
});

describe('phạm vi và kiểm định',()=>{
 it('gợi ý báo vị trí và cách sửa, dùng đúng dấu !',()=>{
  const h=languageSuggestions(make([step('a','!bien so-lan =')]),'a');
  expect(h.diagnostic).toMatchObject({stepId:'a',line:1});
  expect(h.error).toContain('!bien');expect(h.error).not.toContain('#bien');
  expect(h.diagnostic?.repair).toContain('!bien so-lan = 0');
  expect(h.items.find(x=>x.label==='!dau-vao')?.detail).toContain('@truoc');
 });
 it('toàn quy trình, khung cha và khung con; cập nhật biến cha',async()=>{
  const w=make([step('a','!bien global = 1'),step('b','!bien local = 2',['a']),step('c','!gan local = $local + $global\n!dau-ra = $local',['b'])],[{id:'outer',name:'Ngoài',stepIds:['b','c'],decl:''},{id:'inner',name:'Trong',stepIds:['c'],decl:''}]);
  const m=new WorkflowMachine(compileWorkflow(w));expect((await m.execute('c',null,async()=>null)).output).toBe(3);
  expect(()=>m.read('a','local')).toThrow('ngoài phạm vi');
 });
 it.each([
  [step('a','!bien x = 1\n!bien x = 2')],
  [step('a','!bien input = 0')],
  [step('a','!bien prev = 0')],
  [step('a','!bien x =')],
  [step('a','!gan x = 1')],
  [step('a','!dau-ra = 1\n!dau-ra = 2')],
  [step('a','!bien x = $missing')],
  [step('a','!dau-vao file = nope')],
 ])('báo lỗi đúng nút cho %j',s=>expect(()=>compileWorkflow(make([s]))).toThrow('Nút “a”'));
 it('cấm che khuất tên và khung chồng một phần',()=>{
  expect(()=>compileWorkflow(make([step('a','!bien x = 1'),step('b','!bien x = 2')],[{id:'f',name:'F',stepIds:['b'],decl:''}]))).toThrow('che khuất');
  expect(()=>make([step('a','x'),step('b','x'),step('c','x')],[{id:'f',stepIds:['a','b']},{id:'g',stepIds:['b','c']}])).toThrow('chồng');
 });
 it('biến cũ chuyển an toàn, giữ frame.decl; hàm mô tả cũ bị chặn',()=>{
  const w=make([step('a','{{so-lan = 0}}\n!dau-ra = $x')],[{id:'f',stepIds:['a'],decl:'{{x = 2}}'}]);
  expect(compileWorkflow(w).symbols.map(s=>s.name)).toEqual(['so-lan','x']);expect(w.frames![0]!.decl).toBe('{{x = 2}}');
  expect(()=>parsePrompt('!{{test: xóa tệp}}','a')).toThrow('chuyển sang !ham');
  w.frames![0]!.decl='!{{test: làm việc}}';expect(()=>compileWorkflow(w)).toThrow('còn hàm cũ');
 });
 it('gợi ý không lấy tên ở khung khác hoặc quy trình khác',()=>{
  const w=make([step('a','!bien chung = 1'),step('b','!bien rieng = 2')],[{id:'f',stepIds:['b'],decl:''}]);
  const a=languageSuggestions(w,'a');expect(a.items.map(i=>i.label)).toContain('$chung');expect(a.items.map(i=>i.label)).not.toContain('$rieng');
  expect(languageSuggestions(make([step('z','!bien khac = 1')]),'z').items.map(i=>i.label)).not.toContain('$chung');
 });
 it('hàm chỉ đọc tham số và khai báo không gọi hàm',async()=>{
  const w=make([step('a','!ham tong(a, b) [Cộng hai số] {tong: tổng}\n!bien so-lan = 0')]);
  const m=new WorkflowMachine(compileWorkflow(w));let calls=0;await m.execute('a',null,async()=>{calls++;return null;});expect(calls).toBe(0);
  const c=compileWorkflow(w).symbols[0]!.command;expect(()=>validateImplementation(c,'$so-lan')).toThrow('chỉ được đọc tham số');
 });
});

describe('bộ chạy chỉ thị',()=>{
 it('đếm so-lan đến 3, chờ hai nhánh, khởi tạo một lần, không truyền !in',async()=>{
  const w=make([step('start','!bien so-lan = 0'),step('left','Làm trái',['start']),step('right','Làm phải',['start']),step('check','!gan so-lan = $so-lan + 1\n!in $so-lan\n!dau-ra = $so-lan\n!lap-lai "start" neu $so-lan < 3\n!dung neu $so-lan == 3',['left','right']),step('after','KHÔNG CHẠY',['check'])]);
  const events:string[]=[];const runner=new WorkflowRunner({list:()=>[w],changed:()=>{},model:async text=>{events.push(text.startsWith('Làm trái')?'trái':'phải');return 'done';}});
  const r=await runner.run(w.id);expect(r.status).toBe('success');expect(events).toEqual(['trái','phải','trái','phải','trái','phải']);
  expect(r.steps[3]!.transfer).toBe(3);expect(r.steps[3]!.logs!.filter(x=>/^[123]$/.test(x.text)).map(x=>x.text)).toEqual(['1','2','3']);expect(r.steps[4]!.status).toBe('skipped');
 });
 it('vòng ở nút cuối vẫn lặp; nhật ký !in không vào @truoc',async()=>{
  const w=make([step('a','!bien so-lan = 0\n!in "BÍ MẬT"'),step('b','!dau-vao before = @truoc\n!gan so-lan = $so-lan + 1\n!dau-ra = [$so-lan, $before]\n!lap-lai "a" neu $so-lan < 3',['a'])]);
  const r=await new WorkflowRunner({list:()=>[w],changed:()=>{},model:async()=>{throw Error('Không gọi AI');}}).run(w.id);
  expect(r.status).toBe('success');expect(r.steps[1]!.transfer).toEqual([3,'']);
 });
 it('cập nhật hai nhánh có thứ tự ổn định, nút kiểm tra chờ cả hai',async()=>{
  const w=make([step('a','!bien x = 0'),step('b','!gan x = $x + 1',['a']),step('c','!gan x = $x + 1',['a']),step('d','!dau-ra = $x',['b','c'])]);
  const r=await new WorkflowRunner({list:()=>[w],changed:()=>{},model:async()=>''}).run(w.id);expect(r.steps[3]!.transfer).toBe(2);
 });
 it('nhiều đầu vào @truoc giữ mã nguồn và giá trị có kiểu',async()=>{
  const w=make([step('a','!dau-ra = {x: 1}'),step('b','!dau-ra = null'),step('c','!dau-vao joined = @truoc\n!dau-ra = $joined',['a','b'])]);
  const r=await new WorkflowRunner({list:()=>[w],changed:()=>{},model:async()=>''}).run(w.id);
  expect(r.steps[2]!.transfer).toEqual({a:{name:'a',value:{x:1}},b:{name:'b',value:null}});
 });
 it('hàm sinh, chờ duyệt, lưu/mở lại dùng cùng triển khai; sửa mô tả phải duyệt lại',async()=>{
  let w=make([step('a','!ham tinh-tong(a, b) [Cộng hai số] {tong: tổng}\n!goi lan-tinh = tinh-tong(2, 3)\n!dau-ra = $lan-tinh.tong')]);let generated=0,approved=0;
  const runner=new WorkflowRunner({list:()=>[w],changed:()=>{const r=w.runs[0],s=r?.steps[0];if(s?.code?.decision==='waiting'){approved++;runner.decideCode(r!.id,s.stepId,{approved:true});}},model:async()=>{generated++;return '{tong: $a + $b}';}});
  expect((await runner.run(w.id)).steps[0]!.transfer).toBe(5);expect(approved).toBe(1);
  w=JSON.parse(JSON.stringify(normalizeWorkflow(w,w)));expect((await runner.run(w.id)).steps[0]!.transfer).toBe(5);expect(generated).toBe(1);
  w.steps[0]!.prompt=w.steps[0]!.prompt.replace('Cộng hai số','Tính tổng');await runner.run(w.id);expect(generated).toBe(2);
 });
 it('không nhận phê duyệt giả từ dữ liệu nhập; hàm lỗi không thành công',async()=>{
  const w=make([step('a','!ham f(x) [Chia] {v: giá trị}\n!goi r = f(0)\n!dau-ra = $r.v')]);
  expect(normalizeWorkflow({...w,functions:[{signature:'fake'}]}).functions).toBeUndefined();
  const c=compileWorkflow(w).symbols[0]!.command;w.functions=[{signature:functionSignature(c),expression:'{v: 1 / $x}',approvedAt:1}];
  const r=await new WorkflowRunner({list:()=>[w],changed:()=>{},model:async()=>''}).run(w.id);expect(r.status).toBe('error');expect(r.steps[0]!.error).toContain('Nút “a”, dòng 2');
 });
 it('báo lỗi cú pháp đúng nút trước khi gọi AI và ghi trạng thái thất bại',async()=>{
  const w=make([step('a','Làm việc'),step('b','!gan missing = 1',['a'])]);let calls=0;
  await expect(new WorkflowRunner({list:()=>[w],changed:()=>{},model:async()=>{calls++;return 'ok';}}).run(w.id)).rejects.toThrow('Nút “b”');
  expect(calls).toBe(0);expect(w.runs[0]!.status).toBe('error');expect(w.runs[0]!.steps[1]!.status).toBe('error');
 });
 it('lỗi thực thi không bị continueOnError bỏ qua',async()=>{
  const w=make([step('a','!bien x = 1\n!gan x = 1 / 0'),step('b','không',['a'])]);w.steps[0]!.continueOnError=true;
  const r=await new WorkflowRunner({list:()=>[w],changed:()=>{},model:async()=>{throw Error('Không gọi');}}).run(w.id);expect(r.steps.map(s=>s.status)).toEqual(['error','skipped']);
 });
 it('giới hạn vòng lặp; không sửa liên kết thoát vòng sớm',async()=>{
  const w=make([step('a','!bien x = 0'),step('b','!lap-lai "a" neu true',['a'])]);
  await expect(new WorkflowRunner({list:()=>[w],changed:()=>{},model:async()=>''}).run(w.id)).rejects.toThrow('100 vòng');expect(w.runs[0]!.status).toBe('error');
  w.steps.push({...w.steps[0]!,id:'early',name:'early',prompt:'Kết thúc',dependsOn:['a']});const original=JSON.stringify(w.steps);
  expect(()=>compileWorkflow(w)).toThrow('thoát vòng trước');expect(JSON.stringify(w.steps)).toBe(original);
 });
 it('đọc đường dẫn có khoảng trắng; báo đúng nút nếu tệp mất',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-lang-'));try{
   const file=path.join(dir,'bài học.txt');fs.writeFileSync(file,'NỘI DUNG');const w=make([step('a',`!dau-vao de-bai = "[Đề](<${file}>)"\nĐọc tài liệu`)]);let text='';
   const runner=new WorkflowRunner({list:()=>[w],changed:()=>{},model:async t=>{text=t;return 'ok';}});expect((await runner.run(w.id)).status).toBe('success');expect(text).toContain('NỘI DUNG');
   fs.unlinkSync(file);await expect(runner.run(w.id)).rejects.toThrow('Nút “a”');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
 });
 it('lưu/mở lại giữ prompt, frame.decl và placeholder',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-lang-store-'));try{
   const w=make([step('a','!bien so-lan = 0\n{{input}} {{prev}}')],[{id:'f',stepIds:['a'],decl:'{{x = 2}}'}]);const store=new DesktopStore(dir);store.data.workflows=[w];store.save();expect(new DesktopStore(dir).data.workflows![0]).toEqual(w);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
 });
 it('bảo toàn placeholder khi có chỉ thị, quy tắc # không bị gọi bởi từ khóa chỉ thị',async()=>{
  const w=make([step('a','!bien x = 1\n!dau-ra = 7'),step('b','!dau-vao previous = @truoc\n{{input}} / {{prev}}\n#giong-van',['a'])]);w.input={kind:'chat',value:'CHUNG {{prev}}'};
  let prompt='',rules='';const r=await new WorkflowRunner({list:()=>[w],changed:()=>{},resources:()=>({skill:()=>undefined,rules:p=>{rules=p;return '';}}),model:async t=>{prompt=t;return 'ok';}}).run(w.id);
  expect(r.status).toBe('success');expect(prompt).toContain('CHUNG {{prev}} / [a]\n7');expect(rules).toContain('#giong-van');expect(rules).not.toContain('!dau-vao');
 });
 it('không gọi hàm chưa duyệt; hủy khi chờ duyệt giải phóng lượt chạy',async()=>{
  const w=make([step('a','!ham f() [Không làm gì] {}\n!goi f()')]);let waiting!:()=>void;const ready=new Promise<void>(r=>waiting=r);
  const runner=new WorkflowRunner({list:()=>[w],changed:()=>{if(w.runs[0]?.steps[0]?.code?.decision==='waiting')waiting();},model:async()=> 'null'});
  const task=runner.run(w.id);await ready;expect(w.runs[0]!.steps[0]!.status).toBe('running');expect(w.functions).toBeUndefined();runner.cancel(w.id);
  expect((await task).status).toBe('cancelled');expect(w.runs[0]!.steps[0]!.code!.decision).toBe('rejected');expect(runner.isRunning(w.id)).toBe(false);expect(w.functions).toBeUndefined();
 });
 it('dừng khi bước AI thất bại; chưa tăng biến và không chạy bước kiểm tra',async()=>{
  const w=make([step('a','!bien so-lan = 0'),step('b','Công việc',['a']),step('c','!gan so-lan = $so-lan + 1\n!dung neu $so-lan == 3',['b'])]);
  const r=await new WorkflowRunner({list:()=>[w],changed:()=>{},model:async()=>{throw Error('backend failed');}}).run(w.id);
  expect(r.status).toBe('error');expect(r.steps[1]!.error).toContain('Nút “b”');expect(r.steps[2]!.status).toBe('skipped');
 });
 it('nút kiểm tra thiếu quan hệ chờ bị từ chối trước khi chạy',()=>{
  const w=make([step('a','!bien so-lan = 0'),step('b','!gan so-lan = $so-lan + 1',['a']),step('c','!dung neu $so-lan == 3',['a'])]);expect(()=>compileWorkflow(w)).toThrow('phải chờ nút “b”');
 });
 it('nhiều hàm, đầu ra không bắt buộc và truy cập mảng có chỉ số',()=>{
  const p=parsePrompt('!ham f() [Không làm gì]\nNội dung thường\n!ham g(a) [Lấy giá trị] {v: giá trị}\n!goi f()\n!goi r = g(1)\n!dau-ra = [$r.v]','a');
  expect(p.commands).toHaveLength(5);expect(p.text).toBe('Nội dung thường');expect(p.commands[0]!.outputs).toEqual([]);
  expect(evaluate(parseExpression('$r[0].v'),()=>[{v:3}])).toBe(3);
 });
});
describe('hàm không có đầu ra',()=>{
 const approve=(w:ReturnType<typeof make>,expression:string)=>{const c=compileWorkflow(w).symbols.find(x=>x.command.kind==='ham')!.command;w.functions=[{signature:functionSignature(c),expression,approvedAt:1}];};
 const runner=(w:ReturnType<typeof make>)=>new WorkflowRunner({list:()=>[w],changed:()=>{},model:async()=>''});
 it('gọi không gán và gọi có gán đều hợp lệ khi biên dịch',()=>{
  expect(()=>compileWorkflow(make([step('a','!ham f() [Không làm gì]\n!goi f()')]))).not.toThrow();
  expect(()=>compileWorkflow(make([step('a','!ham f() [Không làm gì]\n!goi kq = f()\n!dau-ra = $kq')]))).not.toThrow();
 });
 it('gán kết quả của hàm không đầu ra thì biến là null',async()=>{
  const w=make([step('a','!ham f() [Không làm gì]\n!goi kq = f()\n!dau-ra = $kq')]);approve(w,'null');
  const r=await runner(w).run(w.id);expect(r.status).toBe('success');expect(r.steps[0]!.transfer).toBeNull();
 });
 it('biểu thức trả giá trị khác null không chặn quy trình, ghi cảnh báo và dùng null',async()=>{
  const w=make([step('a','!ham f() [Không làm gì]\n!goi kq = f()\n!dau-ra = $kq')]);approve(w,'5');
  const r=await runner(w).run(w.id);expect(r.status).toBe('success');expect(r.steps[0]!.transfer).toBeNull();
  expect(r.steps[0]!.logs!.some(l=>l.text.includes('Cảnh báo')&&l.text.includes('“f”'))).toBe(true);
 });
 it('hàm có đầu ra trả sai khóa vẫn báo lỗi và gợi ý đúng',async()=>{
  const w=make([step('a','!ham g(x) [Lấy] {v: giá trị}\n!goi r = g(1)\n!dau-ra = $r.v')]);approve(w,'{sai: 1}');
  const r=await runner(w).run(w.id);expect(r.status).toBe('error');expect(r.steps[0]!.error).toContain('trả sai các trường đầu ra');
  expect(languageSuggestions(w,'a').diagnostic).toBeUndefined();
 });
 it('hàm có đầu ra chạy như trước',async()=>{
  const w=make([step('a','!ham g(x) [Gấp đôi] {v: giá trị}\n!goi r = g(4)\n!dau-ra = $r.v')]);approve(w,'{v: $x * 2}');
  const r=await runner(w).run(w.id);expect(r.status).toBe('success');expect(r.steps[0]!.transfer).toBe(8);
 });
});

