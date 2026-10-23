import {afterEach,describe,expect,it,vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DraftError,buildDraft,parseDraftAnswer,renderDraftYaml,verifyDraftYaml,MAX_DRAFT_YAML} from '../src/desktop/prompt-draft';
import {WorkflowPrompts,rewriteSteps,REWRITE_SYSTEM} from '../src/desktop/workflow-prompts';
import {normalizeWorkflow} from '../src/desktop/workflows';
import {DesktopRuntime} from '../src/desktop/runtime';
import type {WorkflowStep} from '../src/desktop/types';

const good=(over:Record<string,string>={})=>JSON.stringify({muc_tieu:'Soạn theo yêu cầu gốc',dau_ra:'Kết quả đáp ứng yêu cầu',rang_buoc:'Không bịa dữ liệu',tieu_chi_hoan_thanh:'Đáp ứng yêu cầu gốc',...over});
const workflow=(steps:Partial<WorkflowStep>[]=[{id:'a',name:'Soạn',prompt:'Dùng {{input}} /soan-bai #ngan'},{id:'b',name:'Rà',prompt:'Rà {{prev}}'}])=>
 normalizeWorkflow({name:'Bài học',steps:steps.map((s,i)=>({id:`s${i}`,name:`Nút ${i}`,prompt:'p',...s}))});
const roots:string[]=[],runtimes:DesktopRuntime[]=[];
afterEach(()=>{runtimes.splice(0).forEach(r=>r.dispose());roots.splice(0).forEach(p=>fs.rmSync(p,{recursive:true,force:true}));vi.restoreAllMocks();});
const temp=()=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'pvta-draft-'));roots.push(d);return d;};

describe('parseDraftAnswer',()=>{
 it('accepts fenced JSON and trims surrounding whitespace',()=>{
  expect(parseDraftAnswer(`  \`\`\`json\n${good()}\n\`\`\`  `,'Soạn').muc_tieu).toBe('Soạn theo yêu cầu gốc');
 });
 it('names the node and asks for retry when the answer is not JSON',()=>{
  expect(()=>parseDraftAnswer('Xin lỗi, tôi không làm được','Soạn')).toThrow(DraftError);
  expect(()=>parseDraftAnswer('Xin lỗi','Soạn')).toThrow('Nút “Soạn”: bản viết lại không phải JSON hợp lệ. Chưa chạy; bấm Chạy để thử lại.');
 });
 it.each([
  ['null','null'],['mảng','[]'],['thiếu trường',JSON.stringify({muc_tieu:'x'})],
  ['chuỗi rỗng',good({dau_ra:'   '})],['trường không phải chuỗi',good({rang_buoc:'1'}).replace('"1"','2')],
 ])('rejects %s with the node name',(_label,answer)=>{
  expect(()=>parseDraftAnswer(answer,'Soạn')).toThrow(/Nút “Soạn”/);
 });
 it('rejects a field longer than 4000 characters',()=>{
  expect(()=>parseDraftAnswer(good({rang_buoc:'x'.repeat(4001)}),'Soạn')).toThrow('rang_buoc vượt 4000 ký tự');
 });
});

describe('renderDraftYaml and verifyDraftYaml',()=>{
 const draft=parseDraftAnswer(good(),'Soạn');
 it('fills blank declarations with defaults: flow input for the first node, previous result otherwise',()=>{
  const w=workflow();const first=renderDraftYaml(w,w.steps[0]!,draft),second=renderDraftYaml(w,w.steps[1]!,draft);
  expect(first).toContain('nguon: "Đầu vào quy trình, nếu có"');expect(first).toContain('khai_bao: []');
  expect(first).toContain('dau_ra: "Kết quả đáp ứng yêu cầu"');
  expect(second).toContain('nguon: "Kết quả các bước cần chờ"');expect(second).toContain('buoc_truoc: ["a"]');
 });
 it('uses declared outputs and completion over the draft when the author provided them',()=>{
  const w=workflow([{id:'a',name:'Soạn',prompt:'x',outputs:['Bảng A','Bảng B'],completion:'Đủ hai bảng'}]);
  const yaml=renderDraftYaml(w,w.steps[0]!,draft);
  expect(yaml).toContain('dau_ra: "Bảng A; Bảng B"');expect(yaml).toContain('tieu_chi_hoan_thanh: "Đủ hai bảng"');
 });
 it('keeps the original prompt byte-for-byte, including placeholders, skills, hashtags and blank lines',()=>{
  const original='Dùng {{input}} và {{prev}} /soan-bai #ngan\n\n| A | B |\n|---|---|\n\tcó tab đầu dòng';
  const w=workflow([{id:'a',name:'Soạn',prompt:original,files:[]}]);
  const yaml=buildDraft(w,w.steps[0]!,good());
  expect(yaml.split('\n').slice(yaml.split('\n').indexOf('yeu_cau_goc: |-')+1)).toEqual(original.split('\n').map(l=>'  '+l));
  for(const token of ['{{input}}','{{prev}}','/soan-bai','#ngan']) expect(yaml).toContain(token);
 });
 it('keeps attached file references in the draft and rejects a draft that drops them',()=>{
  const w=workflow([{id:'a',name:'Soạn',prompt:'x',files:['/a b/nguon.md']}]);const s=w.steps[0]!;
  const yaml=renderDraftYaml(w,s,draft);expect(verifyDraftYaml(yaml,s)).toBe(yaml);
  expect(()=>verifyDraftYaml(yaml.replace('tep: ["/a b/nguon.md"]','tep: []'),s)).toThrow('mất tham chiếu tệp /a b/nguon.md');
 });
 it('rejects a draft whose original instructions were edited outside the four descriptive fields',()=>{
  const w=workflow([{id:'a',name:'Soạn',prompt:'Giữ bảng 3 cột'}]);const s=w.steps[0]!;
  const yaml=renderDraftYaml(w,s,draft);
  expect(()=>verifyDraftYaml(yaml.replace('  Giữ bảng 3 cột','  Giữ bảng 2 cột'),s)).toThrow('làm thay đổi yêu cầu gốc');
 });
 it('rejects a draft missing a required key or containing it twice',()=>{
  const w=workflow();const s=w.steps[0]!,yaml=renderDraftYaml(w,s,draft);
  expect(()=>verifyDraftYaml(yaml.replace('dau_ra: "Kết quả đáp ứng yêu cầu"\n',''),s)).toThrow('thiếu mục dau_ra');
  expect(()=>verifyDraftYaml(yaml.replace('rang_buoc:',`rang_buoc: "x"\nrang_buoc:`),s)).toThrow('lặp mục rang_buoc');
 });
 it('rejects an oversized draft and asks the author to shorten the prompt',()=>{
  const w=workflow([{id:'a',name:'Soạn',prompt:'x'.repeat(MAX_DRAFT_YAML)}]);
  expect(()=>buildDraft(w,w.steps[0]!,good())).toThrow('vượt 20000 ký tự');
 });
});

describe('WorkflowPrompts.prepare',()=>{
 it('eligible node: only nodes that need rewriting reach the model, and nothing is executed',async()=>{
  const w=workflow([{id:'a',prompt:'Soạn'},{id:'b',prompt:'Rà'}]);w.steps[1]!.promptFormat='yaml-v1';
  const model=vi.fn(async()=>good());const s=new WorkflowPrompts();
  const review=await s.prepare(w,{},'run',model);
  expect(model).toHaveBeenCalledTimes(1);expect(review!.steps.map(x=>x.id)).toEqual(['a','b']);
  expect(review!.steps[0]!.original).toBe('Soạn');expect(review!.steps[0]!.prompt).toContain('muc_tieu:');
  expect(w.steps[0]!.prompt).toBe('Soạn');expect(w.runs).toHaveLength(0);
 });
 it('language workflows are not eligible: no draft and no model call',async()=>{
  const w=workflow([{id:'a',prompt:'!bien so-lan = 0\n!in $so-lan'}]);const model=vi.fn(async()=>good());
  expect(rewriteSteps(w)).toEqual([]);await expect(new WorkflowPrompts().prepare(w,{},'run',model)).resolves.toBeUndefined();expect(model).not.toHaveBeenCalled();
 });
 it('model error on a later node: rejects with that node name, stores no draft, and retry succeeds',async()=>{
  const w=workflow([{id:'a',prompt:'Soạn'},{id:'b',prompt:'Rà'}]),s=new WorkflowPrompts();
  let fail=true;const model=vi.fn(async(text:string)=>{if(text.includes('"nut":{"id":"b"')&&fail)throw Error('quá tải');return good();});
  await expect(s.prepare(w,{},'run',model)).rejects.toThrow('Nút “Nút 1”: mô hình không trả được bản viết lại (quá tải)');
  fail=false;const review=await s.prepare(w,{},'run',model);
  expect(review!.steps.map(x=>x.id)).toEqual(['a','b']);
 });
 it('invalid JSON from the model stops preparation with a retryable error and no run',async()=>{
  const w=workflow([{id:'a',prompt:'Soạn'}]),s=new WorkflowPrompts();
  let answer='không phải JSON';const model=vi.fn(async()=>answer);
  await expect(s.prepare(w,{},'run',model)).rejects.toThrow('không phải JSON hợp lệ');
  answer=good();await expect(s.prepare(w,{},'run',model)).resolves.toMatchObject({steps:[{id:'a'}]});
  expect(model).toHaveBeenCalledTimes(2);
 });
 it('a missing attachment is reported before any model call and names the node',async()=>{
  const w=workflow([{id:'a',prompt:'Soạn',files:[path.join(temp(),'mat.md')]}]),model=vi.fn(async()=>good());
  await expect(new WorkflowPrompts().prepare(w,{},'run',model)).rejects.toThrow('Nút “Nút 0”: tệp hoặc thư mục đính kèm không còn truy cập được');
  expect(model).not.toHaveBeenCalled();
 });
 it('cancellation during a model call rethrows the cancel reason, not a draft error, and keeps no draft',async()=>{
  const w=workflow([{id:'a',prompt:'Soạn'}]),s=new WorkflowPrompts();
  const model=(_t:string,signal:AbortSignal)=>new Promise<string>((_,rej)=>signal.addEventListener('abort',()=>rej(signal.reason)));
  const p=s.prepare(w,{},'run',model);s.cancel(w.id);
  const err=await p.catch(e=>e);expect(err).not.toBeInstanceOf(DraftError);expect(err.message).toBe('Đã dừng viết lại prompt.');
  // No draft survived the cancel, and a fresh preparation runs the model again.
  const model2=vi.fn(async()=>good());await s.prepare(w,{},'run',model2);expect(model2).toHaveBeenCalledTimes(1);
 });
});

describe('runtime gate for drafts',()=>{
 it('model failure through workflowRun names the node, starts no run, and only the rewrite prompt reached the engine',async()=>{
  const dir=temp(),r=new DesktopRuntime(()=>{},dir);runtimes.push(r);
  r.store.data.preferences.choice={backend:'api',model:'mock/model'};
  const spy=vi.spyOn(r.engine,'run').mockImplementation(async o=>{if(o.system===REWRITE_SYSTEM)throw Error('mất kết nối');return {text:'',attempts:1,fullPrompt:true,timings:{totalMs:0}} as never;});
  const w=workflow([{id:'a',prompt:'Soạn'}]);r.store.data.workflows=[w];
  await expect(r.dispatch({id:crypto.randomUUID(),method:'workflowRun',params:{id:w.id}})).rejects.toThrow('Nút “Nút 0”');
  expect(w.runs).toHaveLength(0);expect(spy.mock.calls.every(([o])=>o.system===REWRITE_SYSTEM)).toBe(true);
 });
});
