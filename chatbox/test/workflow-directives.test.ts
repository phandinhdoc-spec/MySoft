import {describe,expect,it} from 'vitest';
import {readDirectives,writeDirectives,applyDirectiveEdit,loopTargets,assignableVars,emptyModel} from '../src/workflow-directives';
import {compileWorkflow,parsePrompt,WorkflowMachine} from '../../core/src/desktop/workflow-language';

const step=(id:string,prompt:string,dependsOn:string[]=[])=>({id,name:id,prompt,dependsOn,files:[]});
const wf=(prompts:string[])=>({mode:'sequential' as const,steps:prompts.map((p,i)=>step('S'+i,p))});
const edit=(prompts:string[],i:number,mutate:Parameters<typeof applyDirectiveEdit>[2])=>applyDirectiveEdit(wf(prompts),'S'+i,mutate);

describe('readDirectives / writeDirectives',()=>{
 it('đọc cả kiểu mới có $ và kiểu cũ không có $',()=>{
  const m=readDirectives('!bien $a = 1\n!bien b = "x"\n!gan a = $a + 1\n!dau-ra = $a\n!lap-lai "S0" neu $a < 3\n!dung neu $a > 5\nVăn bản');
  expect(m.vars).toEqual([{name:'a',value:'1'},{name:'b',value:'"x"'}]);
  expect(m.assigns).toEqual([{name:'a',value:'$a + 1'}]);
  expect(m.output).toBe('$a');expect(m.loop).toEqual({target:'S0',cond:'$a < 3'});expect(m.stop).toBe('$a > 5');
 });
 it('round-trip: đọc rồi ghi không đổi chuỗi',()=>{
  for(const p of ['','Chỉ văn bản','!bien x = 0\n!gan x = $x + 1\nVăn bản\n\ncuối','!bien $x = 0\n```\n!bien y = 1\n```\n!dau-ra = $x'])
   expect(writeDirectives(p,readDirectives(p))).toBe(p);
 });
 it('thêm biến vào đầu prompt, giữ nguyên văn bản tự do',()=>{
  const free='Tóm tắt {{prev}}\n\n  thụt lề giữ nguyên\n#quy-tac';
  const m=readDirectives(free);m.vars.push({name:'so-lan',value:'0'});
  const out=writeDirectives(free,m);
  expect(out).toBe('!bien $so-lan = 0\n'+free);
  expect(parsePrompt(out,'a').text).toBe(free.trim());
 });
 it('không nhân đôi dòng khi lưu nhiều lần',()=>{
  const m=readDirectives('Văn bản');m.vars.push({name:'a',value:'1'});m.output='$a';
  const once=writeDirectives('Văn bản',m);
  const twice=writeDirectives(once,readDirectives(once));
  const thrice=writeDirectives(twice,m);
  expect(twice).toBe(once);expect(thrice).toBe(once);
  expect(once.match(/^!bien/gm)).toHaveLength(1);expect(once.match(/^!dau-ra/gm)).toHaveLength(1);
 });
 it('sửa tại chỗ và xóa đúng dòng, không đổi thứ tự các dòng khác',()=>{
  const p='Mở đầu\n!bien x = 1\nGiữa\n!bien y = 2\nCuối';
  const m=readDirectives(p);m.vars[0]={name:'x',value:'10'};
  expect(writeDirectives(p,m)).toBe('Mở đầu\n!bien $x = 10\nGiữa\n!bien y = 2\nCuối');
  const m2=readDirectives(p);m2.vars.splice(1,1);
  expect(writeDirectives(p,m2)).toBe('Mở đầu\n!bien x = 1\nGiữa\nCuối');
 });
 it('bỏ qua khối mã (``` và ~~~) khi đọc và khi ghi',()=>{
  const p='```\n!bien y = 1\n!dau-ra = 5\n```\n~~~\n!dung neu true\n~~~\nChữ';
  expect(readDirectives(p)).toEqual(emptyModel());
  const m=readDirectives(p);m.output='"ok"';
  const out=writeDirectives(p,m);
  expect(out).toBe('!dau-ra = "ok"\n'+p);
  const cleared=readDirectives(out);delete cleared.output;
  expect(writeDirectives(out,cleared)).toBe(p);
 });
 it('đặt chỉ thị mới sau !goi / !dau-vao đường dẫn để biểu thức dùng được',()=>{
  const p='!dau-vao tep = "/tmp/a.pdf"\nVăn bản';
  const m=readDirectives(p);m.output='$tep';
  expect(writeDirectives(p,m)).toBe('!dau-vao tep = "/tmp/a.pdf"\n!dau-ra = $tep\nVăn bản');
 });
 it('không chạm !ham, !goi, !in',()=>{
  const p='!in "xin chào"\nVăn bản';
  const m=readDirectives(p);m.vars.push({name:'a',value:'1'});
  expect(writeDirectives(p,m)).toBe('!bien $a = 1\n'+p);
 });
 it('!dau-vao $ten = @truoc',()=>{
  const m=readDirectives('x');m.receive='ket-qua';
  const out=writeDirectives('x',m);
  expect(out).toBe('!dau-vao $ket-qua = @truoc\nx');
  expect(readDirectives(out).receive).toBe('ket-qua');
 });
});

describe('applyDirectiveEdit',()=>{
 it('thêm, sửa, xóa biến',()=>{
  let r=edit(['Văn bản'],0,m=>{m.vars.push({name:'so-lan',value:'0'});});
  expect(r).toEqual({ok:true,prompt:'!bien $so-lan = 0\nVăn bản'});
  const p1=(r as {prompt:string}).prompt;
  r=edit([p1],0,m=>{m.vars[0]!.value='5';});
  expect(r).toEqual({ok:true,prompt:'!bien $so-lan = 5\nVăn bản'});
  r=edit([(r as {prompt:string}).prompt],0,m=>{m.vars=[];});
  expect(r).toEqual({ok:true,prompt:'Văn bản'});
 });
 it('giá trị đầu không phải hằng bị chặn và không ghi',()=>{
  const r=edit(['Văn bản'],0,m=>{m.vars.push({name:'a',value:'$b'});});
  expect(r.ok).toBe(false);expect((r as {error:string}).error).toContain('hằng');
 });
 it('điều kiện/biểu thức sai bị chặn bằng thông báo tiếng Việt',()=>{
  const bad=edit(['!bien x = 0'],0,m=>{m.stop='$x >';});
  expect(bad.ok).toBe(false);expect((bad as {error:string}).error).toMatch(/Điều kiện dừng/);
  const undeclared=edit(['Văn bản'],0,m=>{m.output='$chua-khai-bao';});
  expect(undeclared.ok).toBe(false);expect((undeclared as {error:string}).error).toContain('chưa khai báo');
  const empty=edit(['Văn bản'],0,m=>{m.vars.push({name:'a',value:''});});
  expect(empty.ok).toBe(false);
  const name=edit(['Văn bản'],0,m=>{m.vars.push({name:'1 sai',value:'1'});});
  expect(name.ok).toBe(false);
 });
 it('tên biến trùng bị chặn',()=>{
  const r=edit(['!bien a = 1'],0,m=>{m.vars.push({name:'a',value:'2'});});
  expect(r.ok).toBe(false);
 });
 it('!gan chỉ cập nhật biến đã khai báo; cập nhật biến hợp lệ',()=>{
  expect(edit(['Văn bản'],0,m=>{m.assigns.push({name:'x',value:'1'});}).ok).toBe(false);
  const r=edit(['!bien x = 0\nVăn bản'],0,m=>{m.assigns.push({name:'x',value:'$x + 1'});});
  expect(r).toEqual({ok:true,prompt:'!bien x = 0\n!gan $x = $x + 1\nVăn bản'});
 });
 it('vòng lặp ghi đúng !lap-lai và chỉ cho nút tổ tiên',()=>{
  const prompts=['!bien n = 0\n!gan n = $n + 1','Kiểm tra'];
  expect(loopTargets(wf(prompts),'S1')).toEqual([{id:'S0',name:'S0'}]);
  expect(loopTargets(wf(prompts),'S0')).toEqual([]);
  const r=edit(prompts,1,m=>{m.loop={target:'S0',cond:'$n < 3'};});
  expect(r).toEqual({ok:true,prompt:'!lap-lai "S0" neu $n < 3\nKiểm tra'});
  expect(edit(prompts,1,m=>{m.loop={target:'S1',cond:'$n < 3'};}).ok).toBe(false);
  expect(edit(prompts,1,m=>{m.loop={target:'S0',cond:'$n'};}).ok).toBe(true); // kiểu bool được kiểm khi chạy
 });
 it('giới hạn số vòng tự sinh biến đếm, ẩn khỏi biểu mẫu và dừng đúng sau N vòng',async()=>{
  const prompts=['Làm việc','Kiểm tra'];
  const r=edit(prompts,1,m=>{m.loop={target:'S0',cond:'true',max:3};});
  expect(r).toEqual({ok:true,prompt:'!bien $vong_S1 = 0\n!gan $vong_S1 = $vong_S1 + 1\n!lap-lai "S0" neu (true) && $vong_S1 < 3\nKiểm tra'});
  if(!r.ok)return;
  const model=readDirectives(r.prompt);
  expect(model.vars).toEqual([]);expect(model.assigns).toEqual([]);expect(model.loop).toEqual({target:'S0',cond:'true',max:3});
  expect(assignableVars(wf([prompts[0]!,r.prompt]),'S1')).toEqual([]);
  expect(writeDirectives(r.prompt,model,'S1')).toBe(r.prompt); // round-trip, không nhân đôi dòng
  const machine=new WorkflowMachine(compileWorkflow(wf([prompts[0]!,r.prompt])));
  let passes=0,control:{stop?:boolean;target?:string}|undefined;
  do{passes++;control=(await machine.execute('S1',null,async()=>null)).control;}while(control?.target&&passes<20);
  expect(passes).toBe(3);
 });
 it('đổi hoặc bỏ số vòng sửa tại chỗ, giữ biến của người dùng; giá trị ngoài 1–50 bị chặn',()=>{
  const base=['!bien $n = 0\nA','Kiểm tra'];
  const r1=edit(base,1,m=>{m.loop={target:'S0',cond:'$n < 9',max:5};});
  expect(r1.ok).toBe(true);if(!r1.ok)return;
  const w=(p:string)=>[base[0]!,p];
  const r2=applyDirectiveEdit(wf(w(r1.prompt)),'S1',m=>{m.loop!.max=7;});
  expect(r2).toEqual({ok:true,prompt:r1.prompt.replace('< 5','< 7')});
  const r3=applyDirectiveEdit(wf(w(r1.prompt)),'S1',m=>{delete m.loop!.max;});
  expect(r3).toEqual({ok:true,prompt:'!lap-lai "S0" neu $n < 9\nKiểm tra'});
  const r4=applyDirectiveEdit(wf(w(r1.prompt)),'S1',m=>{delete m.loop;});
  expect(r4).toEqual({ok:true,prompt:'Kiểm tra'});
  for(const bad of [0,51,2.5,NaN])expect(edit(base,1,m=>{m.loop={target:'S0',cond:'true',max:bad};}).ok).toBe(false);
  expect(edit(base,1,m=>{m.loop={target:'S0',cond:'true',max:50};}).ok).toBe(true);
 });
 it('!dung neu ghi đúng',()=>{
  const r=edit(['!bien n = 0\nx'],0,m=>{m.stop='$n >= 3';});
  expect(r).toEqual({ok:true,prompt:'!bien n = 0\n!dung neu $n >= 3\nx'});
 });
 it('biến thấy được cho ô cập nhật',()=>{
  expect(assignableVars(wf(['!bien a = 1','!bien $b = 2','Chữ']),'S2')).toEqual(['a','b']);
 });
});

describe('tương thích cú pháp cũ',()=>{
 it('biên dịch cả kiểu có $ và không có $ ở vế trái',()=>{
  const flows=[wf(['!bien so-lan = 0\n!gan so-lan = $so-lan + 1']),wf(['!bien $so-lan = 0\n!gan $so-lan = $so-lan + 1']),wf(['!bien $a = 0\n!gan a = $a + 1'])];
  for(const f of flows){
   const program=compileWorkflow(f);
   const cmds=program.parsed.get('S0')!.commands;
   expect(cmds.map(c=>[c.kind,c.name])).toEqual([['bien',cmds[0]!.name],['gan',cmds[0]!.name]]);
   expect(cmds[0]!.name).not.toMatch(/\$/);
  }
 });
 it('!dau-vao $ten = @truoc biên dịch',()=>{
  const f={mode:'sequential' as const,steps:[step('S0','Một'),step('S1','!dau-vao $kq = @truoc\n!dau-ra = $kq')]};
  expect(()=>compileWorkflow(f)).not.toThrow();
 });
});
