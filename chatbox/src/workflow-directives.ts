import {compileWorkflow,parsePrompt,WorkflowLanguageError,type LanguageWorkflow} from '../../core/src/desktop/workflow-language';
import {frameChain} from '../../core/src/desktop/workflow-frames';
import {parseExpression,references,validName} from '../../core/src/desktop/workflow-expression';

/**
 * Biểu mẫu chỉ thị của nút. Prompt là nguồn sự thật duy nhất: hàm ở đây ĐỌC các dòng chỉ thị
 * (!bien, !dau-vao … @truoc, !gan, !dau-ra, !lap-lai, !dung) và GHI lại đúng các dòng đó.
 * Văn bản tự do, !ham, !goi, !in, !dau-vao có đường dẫn và mọi dòng trong khối mã được giữ nguyên.
 */
export interface NamedValue {name:string;value:string}
export interface DirectiveModel {
 vars:NamedValue[];        // !bien $ten = giá-trị
 receive?:string;          // !dau-vao $ten = @truoc
 assigns:NamedValue[];     // !gan $ten = biểu-thức
 output?:string;           // !dau-ra = biểu-thức
 loop?:{target:string;cond:string;max?:number}; // !lap-lai "mã-nút" neu điều-kiện; max → biến đếm tự sinh, tối đa MAX_LOOPS
 stop?:string;             // !dung neu điều-kiện
}
/** Số vòng tối đa người dùng được chọn (hệ thống còn giới hạn cứng 100 vòng). */
export const MAX_LOOPS=50;
export const emptyModel=():DirectiveModel=>({vars:[],assigns:[]});

type Kind='bien'|'gan'|'receive'|'output'|'loop'|'stop';
interface Entry {kind:Kind;index:number;data:NamedValue|string|{target:string;cond:string}}
const NAME='\\$?([\\w-]+)';
const PATTERNS:[Kind,RegExp][]=[
 ['bien',new RegExp(`^!bien\\s+${NAME}\\s*=\\s*(.+)$`)],
 ['gan',new RegExp(`^!gan\\s+${NAME}\\s*=\\s*(.+)$`)],
 ['receive',new RegExp(`^!dau-vao\\s+${NAME}\\s*=\\s*@truoc$`)],
 ['output',/^!dau-ra\s*=\s*(.+)$/],
 ['loop',/^!lap-lai\s+"([^"\n]+)"\s+neu\s+(.+)$/],
 ['stop',/^!dung\s+neu\s+(.+)$/],
];
const SINGLE:Kind[]=['receive','output','loop','stop'];

/** Quét prompt; bỏ qua khối mã giống parsePrompt. Dòng sai cú pháp được coi là văn bản và giữ nguyên. */
function scan(prompt:string){
 const lines=prompt.split('\n'),entries:Entry[]=[];let fence='',lastRef=-1;
 for(let i=0;i<lines.length;i++){
  const trim=lines[i]!.trim();
  const mark=/^(`{3,}|~{3,})/.exec(trim);
  if(mark){if(!fence)fence=mark[1]![0]!;else if(mark[1]![0]===fence)fence='';continue;}
  if(fence||!trim.startsWith('!'))continue;
  let found=false;
  for(const [kind,re] of PATTERNS){
   const m=re.exec(trim);if(!m)continue;found=true;
   const data=kind==='bien'||kind==='gan'?{name:m[1]!,value:m[2]!.trim()}:kind==='receive'?m[1]!:kind==='loop'?{target:m[1]!,cond:m[2]!.trim()}:m[1]!.trim();
   entries.push({kind,index:i,data});break;
  }
  if(!found&&/^!(?:goi|dau-vao)(?=\s|=|$)/.test(trim))lastRef=i;
 }
 return {lines,entries,lastRef};
}
/** Với kiểu đơn, chỉ dòng đầu tiên thuộc biểu mẫu; dòng trùng còn lại giữ nguyên để lỗi vẫn hiện. */
function managed(entries:Entry[]){
 const seen=new Set<Kind>();
 return entries.filter(e=>{if(!SINGLE.includes(e.kind))return true;if(seen.has(e.kind))return false;seen.add(e.kind);return true;});
}
function toRaw(entries:Entry[]):DirectiveModel{
 const model=emptyModel();
 for(const e of managed(entries)){
  if(e.kind==='bien')model.vars.push(e.data as NamedValue);
  else if(e.kind==='gan')model.assigns.push(e.data as NamedValue);
  else if(e.kind==='receive')model.receive=e.data as string;
  else if(e.kind==='output')model.output=e.data as string;
  else if(e.kind==='loop')model.loop=e.data as {target:string;cond:string};
  else model.stop=e.data as string;
 }
 return model;
}
/**
 * Giới hạn số vòng được ghi thành ba dòng cộng tác: `!bien $vong_X = 0`, `!gan $vong_X = $vong_X + 1`
 * và điều kiện `(điều-kiện) && $vong_X < N`. Chỉ nhận ra khi cả ba dòng cùng có; khi đó biểu mẫu ẩn biến đếm.
 */
const COUNTED=/^\((.*)\)\s*&&\s*\$(vong_[A-Za-z0-9_]+)\s*<\s*(\d+)$/;
function view(raw:DirectiveModel):{model:DirectiveModel;counter?:string}{
 const m=raw.loop?COUNTED.exec(raw.loop.cond):null;
 if(!m||!raw.vars.some(v=>v.name===m[2])||!raw.assigns.some(a=>a.name===m[2]))return {model:raw};
 const counter=m[2]!;
 return {counter,model:{...raw,vars:raw.vars.filter(v=>v.name!==counter),assigns:raw.assigns.filter(a=>a.name!==counter),loop:{target:raw.loop!.target,cond:m[1]!,max:Number(m[3])}}};
}
export function readDirectives(prompt:string):DirectiveModel{return view(toRaw(scan(prompt).entries)).model;}
/** Tên biến đếm tự sinh của prompt (nếu có), để ẩn khỏi danh sách biến. */
export const counterOf=(prompt:string)=>view(toRaw(scan(prompt).entries)).counter;
export function directiveCount(m:DirectiveModel){return m.vars.length+m.assigns.length+(m.receive?1:0)+(m.output?1:0)+(m.loop?1:0)+(m.stop?1:0);}

const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const norm=(m:DirectiveModel):DirectiveModel=>({vars:m.vars.map(v=>({name:v.name.replace(/^\$/,'').trim(),value:v.value.trim()})),assigns:m.assigns.map(v=>({name:v.name.replace(/^\$/,'').trim(),value:v.value.trim()})),...(m.receive?{receive:m.receive.replace(/^\$/,'').trim()}:{}),...(m.output?{output:m.output.trim()}:{}),...(m.loop?{loop:{target:m.loop.target.trim(),cond:m.loop.cond.trim(),...(m.loop.max!==undefined?{max:m.loop.max}:{})}}:{}),...(m.stop?{stop:m.stop.trim()}:{})});
const text=(kind:Kind,d:any):string=>kind==='bien'?`!bien $${d.name} = ${d.value}`:kind==='gan'?`!gan $${d.name} = ${d.value}`:kind==='receive'?`!dau-vao $${d} = @truoc`:kind==='output'?`!dau-ra = ${d}`:kind==='loop'?`!lap-lai "${d.target}" neu ${d.cond}`:`!dung neu ${d}`;

/** Thêm biến đếm, dòng cập nhật đếm và điều kiện gộp khi có giới hạn số vòng; giữ vị trí cũ của biến đếm để không đảo dòng. */
function expand(m:DirectiveModel,raw:DirectiveModel,counter:string):DirectiveModel{
 if(!m.loop||m.loop.max===undefined)return m;
 const put=(items:NamedValue[],old:NamedValue[],item:NamedValue)=>{const at=old.findIndex(x=>x.name===counter),out=[...items];out.splice(at<0?out.length:Math.min(at,out.length),0,item);return out;};
 return {...m,vars:put(m.vars,raw.vars,{name:counter,value:'0'}),assigns:put(m.assigns,raw.assigns,{name:counter,value:`$${counter} + 1`}),loop:{target:m.loop.target,cond:`(${m.loop.cond}) && $${counter} < ${m.loop.max}`}};
}

/**
 * Ghi mô hình vào prompt. Không đổi gì nếu mô hình trùng nội dung đang có (đọc rồi ghi giữ nguyên chuỗi).
 * Dòng đã có được sửa/xóa tại chỗ; dòng mới đặt ở đầu prompt (sau các !goi/!dau-vao có đường dẫn nếu có,
 * vì biểu thức phải dùng sau dòng khai báo chúng).
 */
export function writeDirectives(prompt:string,edits:DirectiveModel,stepId=''):string{
 const {lines,entries,lastRef}=scan(prompt),mine=managed(entries);
 const raw=toRaw(entries),existing=view(raw).counter;
 const wanted=expand(norm(edits),raw,existing??`vong_${(stepId||'nut').replace(/[^A-Za-z0-9_]/g,'_')}`);
 if(same(raw,wanted))return prompt;
 const drop=new Set<number>(),replace=new Map<number,string>(),fresh=new Map<number,string[]>();
 const ORDER:Kind[]=['bien','receive','gan','output','loop','stop'];
 const sync=(kind:Kind,items:unknown[])=>{
  const have=mine.filter(e=>e.kind===kind);
  // Dòng mới đứng sau mọi dòng đã có của loại đứng trước (bien < dau-vao < gan < dau-ra < lap-lai < dung) để thứ tự thực thi đúng.
  const earlier=mine.filter(e=>ORDER.indexOf(e.kind)<ORDER.indexOf(kind)&&!drop.has(e.index)).map(e=>e.index);
  const at=Math.max(lastRef,...earlier)+1;
  items.forEach((item,i)=>{const e=have[i];if(!e)fresh.set(at,[...(fresh.get(at)??[]),text(kind,item)]);else if(!same(e.data,item))replace.set(e.index,text(kind,item));});
  have.slice(items.length).forEach(e=>drop.add(e.index));
 };
 sync('bien',wanted.vars);
 sync('receive',wanted.receive?[wanted.receive]:[]);
 sync('gan',wanted.assigns);
 sync('output',wanted.output?[wanted.output]:[]);
 sync('loop',wanted.loop?[wanted.loop]:[]);
 sync('stop',wanted.stop?[wanted.stop]:[]);
 const out:string[]=[];
 for(let i=0;i<=lines.length;i++){
  out.push(...(fresh.get(i)??[]));
  if(i===lines.length)break;
  if(drop.has(i))continue;
  out.push(replace.get(i)??lines[i]!);
 }
 return out.join('\n').replace(/^(?:[ \t]*\n)+/,'');
}

const stripPrefix=(message:string)=>message.replace(/^Nút “[^”]*”, dòng \d+: /,'');
const sameError=(a:string,b:string)=>a.replace(/dòng \d+/g,'dòng #')===b.replace(/dòng \d+/g,'dòng #');
/** Danh sách nút tổ tiên hợp lệ làm đầu vòng lặp (cùng quy tắc với compileWorkflow). */
export function loopTargets(wf:Pick<LanguageWorkflow,'steps'|'mode'>,stepId:string):{id:string;name:string}[]{
 const deps=new Map(wf.steps.map((s,i)=>[s.id,wf.mode==='parallel'?s.dependsOn??[]:i?[wf.steps[i-1]!.id]:[]]));
 const seen=new Set<string>(),walk=(id:string)=>{for(const d of deps.get(id)??[])if(!seen.has(d)&&d!==stepId&&deps.has(d)){seen.add(d);walk(d);}};
 walk(stepId);
 return wf.steps.filter(s=>seen.has(s.id)).map(s=>({id:s.id,name:s.name}));
}
function checkSyntax(m:DirectiveModel){
 const expr=(source:string,label:string)=>{
  if(!source)throw Error(`${label}: chưa nhập.`);
  try{return parseExpression(source);}catch(e){throw Error(`${label}: ${e instanceof Error?e.message:String(e)}`);}
 };
 for(const v of m.vars){
  validName(v.name);const e=expr(v.value,`Giá trị đầu của $${v.name}`);
  if(references(e).length)throw Error(`Giá trị đầu của $${v.name} phải là hằng (số, chuỗi trong dấu nháy kép, true/false/null, mảng, đối tượng); dùng “Cập nhật biến” để lấy giá trị biến khác.`);
 }
 if(m.receive)validName(m.receive);
 for(const a of m.assigns){validName(a.name);expr(a.value,`Biểu thức gán cho $${a.name}`);}
 if(m.output)expr(m.output,'Giá trị đầu ra');
 if(m.loop){
  if(!m.loop.target)throw Error('Chọn nút đầu vòng lặp.');expr(m.loop.cond,'Điều kiện lặp lại');
  const max=m.loop.max;if(max!==undefined&&(!Number.isInteger(max)||max<1||max>MAX_LOOPS))throw Error(`Số vòng tối đa phải là số nguyên từ 1 đến ${MAX_LOOPS}.`);
 }
 if(m.stop)expr(m.stop,'Điều kiện dừng');
}
const dupNames=(m:DirectiveModel)=>{const names=m.vars.map(v=>v.name.replace(/^\$/,''));return names.find((n,i)=>names.indexOf(n)!==i);};

export type EditResult={ok:true;prompt:string}|{ok:false;error:string};
/**
 * Áp dụng một thay đổi của biểu mẫu. Kiểm tra cú pháp từng ô rồi biên dịch cả quy trình với prompt mới;
 * nếu phát sinh lỗi mới (khác lỗi đã có sẵn) thì trả lỗi tiếng Việt và KHÔNG trả prompt mới.
 */
export function applyDirectiveEdit(wf:LanguageWorkflow,stepId:string,mutate:(m:DirectiveModel)=>void):EditResult{
 const step=wf.steps.find(s=>s.id===stepId);if(!step)return {ok:false,error:'Không tìm thấy nút.'};
 const model=norm(readDirectives(step.prompt));
 try{
  mutate(model);const next=norm(model);checkSyntax(next);
  const dup=dupNames(next);if(dup)throw Error(`Tên $${dup} khai báo trùng trong nút này.`);
  const prompt=writeDirectives(step.prompt,next,stepId);
  const baseline=compileError(wf);
  const after=compileError({...wf,steps:wf.steps.map(s=>s.id===stepId?{...s,prompt}:s)});
  if(after&&!(baseline&&sameError(baseline,after)))throw Error(stripPrefix(after));
  return {ok:true,prompt};
 }catch(e){return {ok:false,error:stripPrefix(e instanceof Error?e.message:String(e))};}
}
function compileError(wf:LanguageWorkflow){try{compileWorkflow(wf);return '';}catch(e){return e instanceof WorkflowLanguageError||e instanceof Error?e.message:String(e);}}

/** Tên biến !bien nhìn thấy được từ một nút (cùng khung hoặc khung cha), dùng cho ô “Cập nhật biến”. */
export function assignableVars(wf:LanguageWorkflow,stepId:string):string[]{
 const visible=['',...frameChain(wf.frames??[],stepId).map(f=>f.id)];
 const names:string[]=[];
 for(const s of wf.steps){
  let commands;try{commands=parsePrompt(s.prompt,s.id).commands;}catch{continue;}
  const scope=frameChain(wf.frames??[],s.id).at(-1)?.id??'';
  if(!visible.includes(scope))continue;
  for(const c of commands)if(c.kind==='bien'&&c.name&&!names.includes(c.name))names.push(c.name);
 }
 const hidden=new Set(wf.steps.map(s=>counterOf(s.prompt)).filter(Boolean));
 return names.filter(n=>!hidden.has(n));
}
