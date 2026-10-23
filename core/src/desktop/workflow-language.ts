import type {Workflow,WorkflowStep,WorkflowFrame} from './types.js';
import {frameChain,validateFrames} from './workflow-frames.js';
import {parseDeclarations} from './workflow-vars.js';
import {parseExpression,references,evaluate,validName,displayValue,type Value} from './workflow-expression.js';
export {displayValue,type Value} from './workflow-expression.js';
export const DIRECTIVES=['bien','dau-vao','ham','goi','gan','dau-ra','in','lap-lai','dung'] as const;
export const DIRECTIVE_HELP:Record<typeof DIRECTIVES[number],string>={
 bien:'!bien $tên = giá-trị — khai báo hằng ban đầu, ví dụ !bien $so-lan = 0 (kiểu cũ không có $ vẫn được nhận).',
 'dau-vao':'!dau-vao $tên = "đường-dẫn-tuyệt-đối" hoặc @truoc để nhận kết quả trước.',
 ham:'!ham tên(tham-số) [mô tả] {đầu-ra: mô tả}; khai báo không tự gọi hàm.',
 goi:'!goi lần-gọi = tên-hàm(giá-trị); hàm không có đầu ra thì bỏ phần gán (nếu vẫn gán, biến nhận null).',
 gan:'!gan $tên = biểu-thức — chỉ cập nhật biến đã khai báo bằng !bien.',
 'dau-ra':'!dau-ra = biểu-thức — mỗi nút tối đa một đầu ra; dùng mảng hoặc đối tượng nếu cần nhiều giá trị.',
 in:'!in biểu-thức — ghi nhật kí, không truyền làm đầu ra.',
 'lap-lai':'!lap-lai "mã-nút" neu điều-kiện — nút đích phải là tổ tiên đã nối tới nút kiểm tra.',
 dung:'!dung neu điều-kiện — điều kiện phải cho giá trị true hoặc false.',
};
export const WORKFLOW_AUTHORING_KNOWLEDGE=Object.values(DIRECTIVE_HELP).join('\n')+'\nTham chiếu bằng $tên; # dành cho quy tắc, @ cho prompt mẫu, / cho skill. Giữ {{input}} và {{prev}}. Tên trong khung chỉ thấy từ khung đó và khung con; không trùng tên hoặc che khuất tên cha. Nút dùng kết quả phải chờ nút tạo kết quả; không tự sửa liên kết. Kiểm tra tĩnh không bảo đảm tệp tồn tại hoặc model chạy thành công. Chỉ đề xuất bản nháp, người dùng xem và áp dụng trước khi chạy.';
export function languageRepairHint(error:string){
 if(/cần tên và giá trị/.test(error))return 'Điền tên và giá trị sau dấu =; ví dụ !bien so-lan = 0. Chọn giá trị đúng với yêu cầu của bạn.';
 if(/nháy|đường dẫn/i.test(error))return 'Chọn tệp đầu vào và đặt đường dẫn tuyệt đối trong dấu nháy kép; dùng @truoc nếu nhận kết quả nút trước.';
 if(/chưa khai báo|ngoài phạm vi/.test(error))return 'Kiểm tra chính tả $tên và khai báo tên trong cùng phạm vi hoặc khung cha trước khi dùng.';
 if(/trùng|che khuất/.test(error))return 'Đổi tên khai báo bị trùng và cập nhật các tham chiếu tương ứng trong phạm vi đó.';
 if(/chờ|phụ thuộc|tổ tiên|thoát vòng/.test(error))return 'Kiểm tra đường nối và thứ tự các nút trên sơ đồ; nối nút tạo dữ liệu trước nút sử dụng, tránh vòng phụ thuộc.';
 if(/trả sai các trường đầu ra/.test(error))return 'Hàm có khai báo {tên: mô tả} nên phải trả đúng các khóa đó. Sửa mô tả hàm hoặc danh sách khóa trong {...} cho khớp, rồi duyệt lại phần triển khai.';
 if(/một !dau-ra/.test(error))return 'Gộp các giá trị vào một mảng hoặc đối tượng trong một dòng !dau-ra.';
 return 'Sửa dòng được báo theo mẫu chỉ thị bên dưới, hoặc nhờ AI đề xuất bản sửa để xem trước.';
}
export type Command={kind:string;line:number;name?:string;value:string;params?:string[];description?:string;outputs?:string[];target?:string;callee?:string};
export class WorkflowLanguageError extends Error{
 constructor(public stepId:string,public line:number,message:string){super(`Nút “${stepId}”, dòng ${line}: ${message}`);}
}
export interface ParsedPrompt {commands:Command[];text:string}
/** Fenced examples are inert. Only complete reserved tokens at the start of a line are directives. */
export function parsePrompt(prompt:string,stepId:string):ParsedPrompt{
 const lines=prompt.split('\n'),commands:Command[]=[],text:string[]=[];let fence='';
 for(let i=0;i<lines.length;i++){
  const raw=lines[i]!,line=i+1,trim=raw.trim();
  const mark=/^(`{3,}|~{3,})/.exec(trim);
  if(mark){if(!fence)fence=mark[1]![0]!;else if(mark[1]![0]===fence)fence='';text.push(raw);continue;}
  if(fence){text.push(raw);continue;}
  let match:RegExpExecArray|string[]|null=/^!([a-z-]+)(?=\s|$|=)(.*)$/.exec(trim);
  // Safe legacy variable declarations; descriptions are never promoted to executable commands.
  if(/^!\{\{/.test(trim))throw new WorkflowLanguageError(stepId,line,'Hàm cũ cần chuyển sang !ham với tham số và duyệt phần triển khai; dữ liệu vẫn được giữ.');
  const legacy=/^\{\{\s*([A-Za-z_][\w-]*)\s*=\s*(.*?)\s*\}\}$/.exec(trim);
  if(legacy)match=['', 'bien',`${legacy[1]} = ${legacy[2]}`];
  if(!match||!DIRECTIVES.includes(match[1] as typeof DIRECTIVES[number])){text.push(raw);continue;}
  const kind=match[1]!,body=match[2]!.trim();
  try{
   if(['bien','dau-vao','gan'].includes(kind)){
    const m=/^\$?([\w-]+)\s*=\s*(.+)$/.exec(body);if(!m)throw Error(`!${kind} cần tên và giá trị. Mở Gợi ý khai báo để bổ sung.`);
    validName(m[1]!);commands.push({kind,line,name:m[1],value:m[2]!});
   }else if(kind==='ham'){
    let block=body;
    while(i+1<lines.length&&!/^\s*!(?:bien|dau-vao|ham|goi|gan|dau-ra|in|lap-lai|dung)(?=\s|=|$)/.test(lines[i+1]!)){
     const end=block.indexOf(']');
     if(end>=0){const tail=block.slice(end+1).trim();if(tail.endsWith('}'))break;const next=lines.slice(i+1).find(l=>l.trim());if(!tail&&!/^\s*\{/.test(next??''))break;}
     block+='\n'+lines[++i];
    }
    const m=/^([\w-]+)\(([^)]*)\)\s*\[([\s\S]+?)\]\s*(?:\{([\s\S]*?)\})?\s*$/.exec(block);
    if(!m)throw Error('!ham cần tên(tham số) [mô tả] {tên đầu ra: mô tả}.');
    validName(m[1]!);const params=m[2]!.split(',').map(x=>x.trim()).filter(Boolean);params.forEach(validName);
    const outputs=(m[4]??'').trim()?m[4]!.split(/[,\n]/).map(x=>x.trim()).filter(Boolean).map(x=>{const p=/^([\w-]+)\s*:\s*.+$/.exec(x);if(!p)throw Error('Đầu ra hàm cần tên: mô tả.');validName(p[1]!);return p[1]!;}):[];
    if(new Set(params).size!==params.length||new Set(outputs).size!==outputs.length)throw Error('Tham số hoặc đầu ra bị trùng.');
    commands.push({kind,line,name:m[1],params,outputs,description:m[3]!.trim(),value:block});
   }else if(kind==='goi'){
    const m=/^(?:\$?([\w-]+)\s*=\s*)?([\w-]+)\(([\s\S]*)\)$/.exec(body);if(!m)throw Error('!goi [lần-gọi =] tên-hàm(tham số).');
    if(m[1])validName(m[1]);validName(m[2]!);parseExpression(`[${m[3]}]`);
    commands.push({kind,line,name:m[1],callee:m[2],value:`[${m[3]}]`});
   }else if(kind==='lap-lai'){
    const m=/^"([^"\n]+)"\s+neu\s+(.+)$/.exec(body);if(!m)throw Error('!lap-lai "mã-nút" neu điều-kiện.');commands.push({kind,line,target:m[1],value:m[2]!});
   }else if(kind==='dung'){
    const m=/^neu\s+(.+)$/.exec(body);if(!m)throw Error('!dung neu điều-kiện.');commands.push({kind,line,value:m[1]!});
   }else{
    const value=kind==='dau-ra'?/^=\s*(.+)$/.exec(body)?.[1]:body;if(!value)throw Error(`!${kind} thiếu giá trị.`);
    commands.push({kind,line,value});
   }
  }catch(e){throw new WorkflowLanguageError(stepId,line,e instanceof Error?e.message:String(e));}
 }
 if(commands.filter(c=>c.kind==='dau-ra').length>1)throw new WorkflowLanguageError(stepId,1,'Mỗi nút chỉ có một !dau-ra; dùng mảng hoặc đối tượng.');
 if(commands.filter(c=>c.kind==='lap-lai').length>1)throw new WorkflowLanguageError(stepId,1,'Mỗi nút kiểm tra chỉ có một !lap-lai.');
 return {commands,text:text.join('\n').trim()};
}
export function inputPath(value:string):string{
 if(value==='@truoc')return value;
 let p=value.trim();
 if(p.startsWith('“')&&p.endsWith('”'))p=p.slice(1,-1);
 else if(p.startsWith('"')){try{p=JSON.parse(p);}catch{throw Error('Đường dẫn có dấu nháy chưa hợp lệ.');}}
 else throw Error('Đường dẫn tệp/ảnh hoặc liên kết Markdown phải nằm trong dấu nháy kép.');
 if(typeof p!=='string')throw Error('Đường dẫn phải là chuỗi trong dấu nháy kép.');
 const md=/^!?\[(?:\\.|[^\]\\])*\]\(([\s\S]+)\)$/.exec(p);
 if(md){
  p=md[1]!;
  if(p.startsWith('<')&&p.endsWith('>'))p=p.slice(1,-1);
  try{p=decodeURIComponent(p);}catch{throw Error('Mã hóa đường dẫn trong liên kết không hợp lệ.');}
 }
 if(typeof p!=='string'||!(p.startsWith('/')||/^[A-Za-z]:[\\/]/.test(p)))throw Error('!dau-vao cần đường dẫn tuyệt đối đến tệp/ảnh hoặc @truoc.');
 return p;
}
type SymbolDef={name:string;scope:string;stepId:string;command:Command};
export interface LanguageWorkflow {steps:Pick<WorkflowStep,'id'|'name'|'prompt'|'dependsOn'|'files'>[];frames?:WorkflowFrame[];mode?:Workflow['mode']}
export function hasWorkflowLanguage(wf:LanguageWorkflow){return wf.steps.some(s=>/^\s*!(?:bien|dau-vao|ham|goi|gan|dau-ra|in|lap-lai|dung)(?=\s|=|$)|^\s*!?\{\{[^}\n]*[=:]/m.test(s.prompt));}
export function compileWorkflow(wf:LanguageWorkflow){
 const frames=wf.frames??[];validateFrames(frames);
 const parsed=new Map(wf.steps.map(s=>[s.id,parsePrompt(s.prompt,s.id)]));
 const scopes=(id:string)=>['',...frameChain(frames,id).map(f=>f.id)];
 const symbols:SymbolDef[]=[];
 const add=(stepId:string,command:Command,scope=scopes(stepId).at(-1)!)=>{
  const name=command.name!;validName(name);
  if(symbols.some(s=>s.name===name&&s.scope===scope))throw new WorkflowLanguageError(stepId,command.line,`Tên “${name}” khai báo trùng.`);
  symbols.push({name,scope,stepId,command});
 };
 for(const step of wf.steps)for(const cmd of parsed.get(step.id)!.commands)if(['bien','dau-vao','ham'].includes(cmd.kind)||cmd.kind==='goi'&&cmd.name)add(step.id,cmd);
 for(const f of frames){
  if(!f.decl.trim())continue;
  const legacy=parseDeclarations(f.decl);if(legacy.funcs.length)throw new WorkflowLanguageError(f.stepIds[0]!,1,`Khung “${f.name}” còn hàm cũ. Giữ nguyên dữ liệu; chuyển thủ công sang !ham trước khi dùng chỉ thị mới.`);
  for(const v of legacy.vars)add(f.stepIds[0]!,{kind:'bien',line:1,name:v.name,value:v.value},f.id);
 }
 for(const s of symbols){const visible=scopes(s.stepId);if(symbols.some(x=>x!==s&&x.name===s.name&&visible.includes(x.scope)&&visible.indexOf(x.scope)<visible.indexOf(s.scope)))throw new WorkflowLanguageError(s.stepId,s.command.line,`Tên “${s.name}” che khuất phạm vi cha.`);}
 const resolve=(stepId:string,name:string)=>{const chain=scopes(stepId);const s=symbols.find(s=>s.name===name&&chain.includes(s.scope));if(!s)throw Error(`Tên “${name}” chưa khai báo hoặc ngoài phạm vi.`);return s;};
 const deps=new Map(wf.steps.map((s,i)=>[s.id,wf.mode==='parallel'?s.dependsOn??[]:i?[wf.steps[i-1]!.id]:[]]));
 function ancestors(id:string,seen=new Set<string>()):Set<string>{for(const d of deps.get(id)??[]){if(d===id||!deps.has(d))throw Error('Phụ thuộc không hợp lệ.');if(!seen.has(d)){seen.add(d);ancestors(d,seen);}}return seen;}
 const loops=new Map<string,string[]>();
 for(const step of wf.steps){
  const before=ancestors(step.id);if(before.has(step.id))throw new WorkflowLanguageError(step.id,1,'Quan hệ phụ thuộc có vòng.');
  for(const c of parsed.get(step.id)!.commands)try{
   if(c.kind==='ham')continue;
   if(c.kind==='dau-vao'){inputPath(c.value);continue;}
   const expr=parseExpression(c.value);
   for(const name of references(expr)){
    const s=resolve(step.id,name);if(s.command.kind==='ham')throw Error(`Dùng !goi để gọi hàm “${name}”.`);
    if(['goi','dau-vao'].includes(s.command.kind)&&(s.stepId!==step.id&&!before.has(s.stepId)||s.stepId===step.id&&s.command.line>=c.line))throw Error(`Phải chờ nút khai báo “${name}” và dùng sau dòng khai báo.`);
    if(c.kind==='bien')throw Error('Giá trị ban đầu !bien phải là hằng; dùng !gan để lấy giá trị biến khác.');
   }
   if(c.kind==='gan'&&resolve(step.id,c.name!).command.kind!=='bien')throw Error('!gan chỉ cập nhật biến !bien.');
   if(c.kind==='goi'){
    const f=resolve(step.id,c.callee!);if(f.command.kind!=='ham')throw Error('Tên được gọi không phải hàm.');
    if(expr.kind!=='array'||expr.items.length!==f.command.params!.length)throw Error(`Hàm “${c.callee}” cần ${f.command.params!.length} tham số.`);
   }
   if(c.kind==='lap-lai'||c.kind==='dung')for(const name of references(expr)){
    const variable=resolve(step.id,name);
    for(const other of wf.steps)if(other.id!==step.id&&parsed.get(other.id)!.commands.some(x=>x.kind==='gan'&&x.name===name&&resolve(other.id,name)===variable)&&!before.has(other.id))throw Error(`Nút kiểm tra phải chờ nút “${other.name}” cập nhật “${name}”.`);
   }
   if(c.kind==='lap-lai'){
    if(!c.target||!before.has(c.target))throw Error('Nút đầu vòng phải là tổ tiên đã nối tới nút kiểm tra.');
    const region=wf.steps.filter(s=>s.id===c.target||before.has(s.id)&&ancestors(s.id).has(c.target!)).map(s=>s.id);region.push(step.id);
    for(const s of wf.steps)if(!region.includes(s.id)&&(deps.get(s.id)??[]).some(d=>region.includes(d)&&d!==step.id)&&!ancestors(s.id).has(step.id))throw Error(`Nút “${s.name}” thoát vòng trước nút kiểm tra. Cần nối phụ thuộc; không tự đổi liên kết.`);
    loops.set(step.id,region);
   }
  }catch(e){throw new WorkflowLanguageError(step.id,c.line,e instanceof Error?e.message:String(e));}
 }
 return {parsed,symbols,resolve,scopes,loops};
}
export type Program=ReturnType<typeof compileWorkflow>;
export interface FunctionImplementation {signature:string;expression:string;approvedAt:number}
export const functionSignature=(c:Command)=>JSON.stringify([c.name,c.params,c.description,c.outputs,c.value]);
export function validateImplementation(c:Command,expression:string){
 const e=parseExpression(expression);for(const ref of references(e))if(!c.params?.includes(ref))throw Error(`Hàm chỉ được đọc tham số; không được đọc “${ref}”.`);return e;
}
export class WorkflowMachine {
 private values=new Map<SymbolDef,Value>();
 constructor(readonly program:Program){for(const s of program.symbols)if(s.command.kind==='bien')try{this.values.set(s,evaluate(parseExpression(s.command.value),()=>{throw Error('Giá trị khởi tạo phải là hằng.');}));}catch(e){throw new WorkflowLanguageError(s.stepId,s.command.line,e instanceof Error?e.message:String(e));}}
 read(stepId:string,name:string):Value{const s=this.program.resolve(stepId,name);if(!this.values.has(s))throw Error(`“${name}” chưa có giá trị; cần chờ nút tạo dữ liệu.`);return this.values.get(s)!;}
 async execute(stepId:string,previous:Value,call:(c:Command,args:Value[])=>Promise<Value>){
  const printed:string[]=[];let output:Value|undefined,control:{stop?:boolean;target?:string}|undefined;
  for(const c of this.program.parsed.get(stepId)!.commands)try{
   const evalValue=()=>evaluate(parseExpression(c.value),n=>this.read(stepId,n));
   if(c.kind==='dau-vao')this.values.set(this.program.resolve(stepId,c.name!),c.value==='@truoc'?previous:inputPath(c.value));
   if(c.kind==='gan')this.values.set(this.program.resolve(stepId,c.name!),evalValue());
   if(c.kind==='goi'){
    const f=this.program.resolve(stepId,c.callee!).command,args=evalValue() as Value[];
    if(args.length!==f.params!.length)throw Error(`Hàm “${f.name}” cần ${f.params!.length} tham số.`);
    const result=await call(f,args);if(c.name)this.values.set(this.program.resolve(stepId,c.name),result);
   }
   if(c.kind==='in')printed.push(displayValue(evalValue()));
   if(c.kind==='dau-ra')output=evalValue();
   if(c.kind==='lap-lai'||c.kind==='dung'){const yes=evalValue();if(typeof yes!=='boolean')throw Error('Điều kiện phải là true/false.');if(yes){control=c.kind==='dung'?{stop:true}:{target:c.target};break;}}
  }catch(e){throw new WorkflowLanguageError(stepId,c.line,e instanceof Error?e.message:String(e));}
  return {output,printed,control};
 }
 context(stepId:string){return this.program.symbols.filter(s=>s.command.kind!=='ham'&&this.program.scopes(stepId).includes(s.scope)&&this.values.has(s)).map(s=>`$${s.name} = ${displayValue(this.values.get(s)!)}`).join('\n');}
}

/** Editor and runner share diagnostics. This function accepts ONLY the current draft. */
export function languageSuggestions(wf:LanguageWorkflow,stepId:string){
 let error='';let diagnostic: {stepId?:string;line?:number;message:string;repair:string}|undefined;
 let program:Program|undefined;try{program=compileWorkflow(wf);}catch(e){error=e instanceof Error?e.message:String(e);diagnostic={message:error,repair:languageRepairHint(error),...(e instanceof WorkflowLanguageError?{stepId:e.stepId,line:e.line}:{})};}
 const visible=['',...frameChain(wf.frames??[],stepId).map(f=>f.id)];
 const fallback:SymbolDef[]=wf.steps.flatMap(s=>{try{return parsePrompt(s.prompt,s.id).commands.filter(c=>c.name&&['bien','dau-vao','ham','goi'].includes(c.kind)).map(c=>({name:c.name!,scope:frameChain(wf.frames??[],s.id).at(-1)?.id??'',stepId:s.id,command:c}));}catch{return [];}});
 const symbols=(program?.symbols??fallback).filter(s=>visible.includes(s.scope));
 const names=symbols.flatMap(s=>{
  const detail=`${s.command.kind} · ${wf.steps.find(x=>x.id===s.stepId)?.name??s.scope} · dòng ${s.command.line}`;
  if(s.command.kind==='ham')return [{label:`${s.name}(${s.command.params!.map(p=>'$'+p).join(', ')})`,detail}];
  const f=s.command.kind==='goi'?symbols.find(x=>x.name===s.command.callee&&x.command.kind==='ham'):undefined;
  return [{label:`$${s.name}`,detail},...(f?.command.outputs??[]).map(key=>({label:`$${s.name}.${key}`,detail}))];
 });
 return {error,diagnostic,items:[...DIRECTIVES.map(x=>({label:'!'+x,detail:DIRECTIVE_HELP[x]})),...names,...wf.steps.map(s=>({label:JSON.stringify(s.id),detail:'Nút: '+s.name}))]};
}
