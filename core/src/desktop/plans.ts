import type {Plan,PlanStep,Workflow,WorkflowRun,PlanVersion} from './types.js';
import {uid} from './storage.js';

export const PLAN_PROMPT=`CHẾ ĐỘ PLAN: chỉ đọc, tìm hiểu và lập kế hoạch; không ghi tệp, không tạo pvta-action.
Trước khi lập plan: nhận diện mục tiêu, chủ đề, loại tài liệu, môn/lớp, đầu ra (định dạng, độ dài, tiêu chí hoàn thành), tài liệu liên quan trong hội thoại/dự án và lịch sử. Đọc dữ kiện đã có trước, không hỏi lại. Dùng office_rag_search/office_file_read để đọc nguồn liên quan, ghi tên tệp và vị trí đoạn/trang; không coi tên tệp là nội dung đã đọc. Có thể dùng office_history_search {query} để tìm công việc cũ cùng dự án; tóm tắt cũ chưa phải bằng chứng đã kiểm chứng.
Dùng office_web_search {query} và office_web_read {url} qua pvta-read để tìm và đọc nguồn mạng. Chỉ gửi từ khóa chủ đề công khai, không gửi thông tin cá nhân hay nguyên văn tài liệu riêng. Ưu tiên nguồn cơ quan ban hành. Không coi đoạn tìm kiếm là toàn văn đã kiểm chứng; ghi URL và phần chưa đọc được. Nếu mất mạng, nêu giới hạn, không bịa căn cứ.
Với giáo án: xác định môn, lớp, bài, thời lượng, yêu cầu cần đạt, đối tượng học sinh (cần hỗ trợ, phổ thông, khá giỏi), điều kiện lớp. Tìm văn bản hướng dẫn phù hợp cấp học, ví dụ Công văn 5512 và phụ lục kế hoạch bài dạy khi phù hợp; kiểm tra nguồn và phạm vi áp dụng, không mặc định mọi lớp đều dùng 5512. Đề xuất phương pháp và kỹ thuật dạy học với lý do phù hợp nội dung và học sinh; phương án phân hóa, đánh giá, thiết bị và tài liệu tham khảo. Thiếu dữ kiện thiết yếu thì hỏi ngắn gọn trước khi lập plan; giả định phải ghi rõ để người dùng sửa.
Khảo sát văn bản theo cấp học, địa phương và thời điểm; không suy diễn hiệu lực từ số hiệu 5512. Tìm thêm tài liệu chuyên môn gốc. Giải thích vì sao phương pháp/kĩ thuật phù hợp mục tiêu, thời lượng, trình độ và điều kiện lớp; không mặc định học sinh khá giỏi. Nếu thiếu bài học, thời lượng, trình độ học sinh, điều kiện lớp hoặc yêu cầu đầu ra ảnh hưởng đáng kể: gộp tối đa 3 câu hỏi ngắn, cho lựa chọn khi phù hợp, chờ trả lời trước khi lập Plan. Không lấp thông tin thiết yếu bằng giả định. Chi tiết ít ảnh hưởng có thể ghi giả định để người dùng sửa.
Khi đủ thông tin, trả khối pvta-plan JSON {"title":"tên","brief":{"objective":"mục tiêu","topic":"chủ đề/bài","documentType":"loại tài liệu","subject":"môn hoặc Không áp dụng","grade":"lớp hoặc Không áp dụng","output":"đầu ra và tiêu chí","facts":["dữ kiện kèm xuất xứ"],"proposals":["đề xuất và lý do"],"assumptions":[],"questions":[],"sources":[{"title":"tên nguồn","locator":"URL hoặc tên tệp và vị trí","accessedOn":"YYYY-MM-DD","scope":"phạm vi áp dụng và phần được sử dụng","status":"read"}],"limitations":["điều chưa xác minh hoặc lý do không cần nguồn ngoài"]},"steps":[{"id":"buoc-1","goal":"mục tiêu","task":"việc làm cụ thể","files":[],"risk":"rủi ro hoặc không","inputs":["dữ liệu đã khảo sát"],"outputs":["sản phẩm cần bàn giao"],"dependsOn":[],"completion":"tiêu chí có thể kiểm tra","onError":"dừng và báo lỗi, đề xuất khắc phục"}]}.
brief là bắt buộc. Tách riêng facts (dữ kiện), proposals (đề xuất), assumptions (giả định). questions là câu hỏi quan trọng còn thiếu; chưa rỗng thì chỉ hỏi, chưa tạo Plan. Mảng không có nội dung dùng []; không bịa nguồn để điền đủ. Mỗi nguồn phải ghi xuất xứ, ngày truy cập thực tế từ công cụ, phạm vi áp dụng, status read/partial/unverified. Chỉ tìm thấy đoạn trích hoặc đọc thất bại không được ghi read; chưa truy cập dùng accessedOn rỗng và unverified. Bối cảnh sẽ hiển thị để người dùng sửa trực tiếp. Mỗi bước dùng id ổn định, inputs (danh sách dữ liệu đầu vào), outputs (danh sách sản phẩm), dependsOn (ID bước cần chờ, [] nếu độc lập), completion (tiêu chí hoàn thành), onError (cách khắc phục; chỉ người dùng được chấp nhận bỏ qua). Không đặt hai bước độc lập cùng ghi một đầu ra. Tối đa 20 bước; bước cuối kiểm tra đầu ra. Việc lớn (nhiều tệp, nhiều phần, nguồn dài, dễ vượt giới hạn token của một phiên) thì chia thành từ 8 bước trở lên, mỗi bước đủ nhỏ để làm trọn trong một phiên; từ 8 bước, mỗi bước chạy phiên riêng, ghi “phiếu bàn giao” và bước sau chỉ nhận phiếu đó, nên mỗi bước phải ghi rõ đường dẫn tệp đầu ra. Plan tự liên kết Quy trình; chưa duyệt thì không thực hiện.`;

/** Require a survey before exposing a new plan for approval; existing plans remain editable. */
export function planSurveyContext(value:unknown):{context:string;questions:string[]} {
 const b=value as Record<string,unknown>|null;
 if(!b||typeof b!=='object')throw Error('Thiếu khảo sát bối cảnh. Hãy yêu cầu PVTA khảo sát trước khi lập Plan.');
 const field=(key:string)=>{const v=b[key];if(typeof v!=='string'||!v.trim()||v.length>2000)throw Error('Khảo sát chưa đủ mục tiêu, chủ đề, loại tài liệu, môn, lớp và đầu ra.');return v.trim();};
 const list=(key:string)=>{const v=b[key];if(!Array.isArray(v)||v.length>20||v.some(x=>typeof x!=='string'||!x.trim()||x.length>2000))throw Error('Khảo sát chưa tách đủ dữ kiện, đề xuất, giả định, câu hỏi và giới hạn.');return v as string[];};
 const questions=list('questions');if(questions.length)return {context:'',questions:questions.slice(0,3)};
 const sections=[['Mục tiêu',field('objective')],['Chủ đề',field('topic')],['Loại tài liệu',field('documentType')],['Môn',field('subject')],['Lớp',field('grade')],['Đầu ra và tiêu chí',field('output')]];
 for(const [key,label] of [['facts','Dữ kiện'],['proposals','Đề xuất và lý do'],['assumptions','Giả định có thể sửa'],['limitations','Giới hạn xác minh']] as const)sections.push([label,list(key).map(x=>'- '+x).join('\n')||'Không có.']);
 if(!Array.isArray(b.sources)||b.sources.length>20)throw Error('Thiếu danh sách nguồn khảo sát.');
 const sources=b.sources.map((source:unknown)=>{
  const s=source as Record<string,unknown>|null;
  if(!s||['title','locator','scope'].some(k=>typeof s[k]!=='string'||!(s[k] as string).trim()||(s[k] as string).length>2000)||!['read','partial','unverified'].includes(String(s.status)))throw Error('Nguồn cần xuất xứ, phạm vi áp dụng và trạng thái xác minh.');
  const date=typeof s.accessedOn==='string'?s.accessedOn:'';
  if((s.status!=='unverified'||date)&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date))throw Error('Nguồn đã đọc cần ngày truy cập hợp lệ.');
  return `- ${s.title} — ${s.locator}\n  - Ngày truy cập: ${date||'Chưa truy cập'}; phạm vi: ${s.scope}; trạng thái: ${s.status==='read'?'Đã đọc':s.status==='partial'?'Đọc một phần':'Chưa xác minh'}.`;
 });
 sections.push(['Tài liệu và nguồn liên quan',sources.join('\n')||'Chưa sử dụng nguồn ngoài; xem giới hạn xác minh.']);
 const context=sections.map(([label,text])=>`### ${label}\n${text}`).join('\n\n');
 if(context.length>12000)throw Error('Khảo sát quá dài; hãy rút gọn dưới 12.000 ký tự.');
 return {context,questions:[]};
}

/** Old plans acquire explicit, editable contracts without inventing domain facts. */
export function planContract(s:PlanStep,index:number,steps:PlanStep[]){
 const list=(value:string[]|undefined,fallback:string[])=>s.templateCopy&&!value?.some(x=>x.trim())?fallback:value??fallback;
 return {
  inputs:list(s.inputs,['Bối cảnh và yêu cầu đã ghi trong Plan']),
  outputs:list(s.outputs,[s.goal]),
  dependsOn:s.dependsOn??(index?[steps[index-1]!.id]:[]),
  completion:s.templateCopy&&!s.completion?.trim()?s.task:s.completion??s.task,
  onError:s.templateCopy&&!s.onError?.trim()?'Dừng, báo lỗi; chỉ bỏ qua khi người dùng chấp nhận.':s.onError??'Dừng, báo lỗi; chỉ bỏ qua khi người dùng chấp nhận.',
 };
}
export function planVersion(plan:Plan):PlanVersion{
 return structuredClone({revision:plan.revision??0,title:plan.title,context:plan.context,steps:plan.steps,savedAt:Date.now()});
}
export function archivePlan(plan:Plan){
 const versions=plan.versions??=[];
 if(!versions.some(v=>v.revision===(plan.revision??0)))versions.push(planVersion(plan));
}
/** Validate before approval, and return a stable topological execution order. */
export function validatePlan(plan:Plan):PlanStep[]{
 if(!plan.steps.length)throw Error('Kế hoạch chưa có bước.');
 const steps=plan.steps.map((s,i)=>({...s,...planContract(s,i,plan.steps)}));
 const byId=new Map(steps.map(s=>[s.id,s]));
 if(byId.size!==steps.length)throw Error('ID bước bị trùng.');
 const visiting=new Set<string>(),done=new Set<string>(),ordered:PlanStep[]=[];
 const visit=(id:string)=>{
  if(visiting.has(id))throw Error('Quan hệ phụ thuộc tạo vòng lặp.');
  if(done.has(id))return;
  const s=byId.get(id);if(!s)throw Error('Bước phụ thuộc không tồn tại.');
  if(!s.goal.trim()||!s.task.trim()||!s.inputs.length||s.inputs.some(x=>!x.trim()))throw Error(`Bước “${s.goal}” thiếu đầu vào hoặc nhiệm vụ.`);
  if(!s.outputs.length||s.outputs.some(x=>!x.trim())||!s.completion.trim()||!s.onError.trim())throw Error(`Bước “${s.goal}” thiếu đầu ra, điều kiện hoàn thành hoặc cách xử lí lỗi.`);
  visiting.add(id);s.dependsOn.forEach(visit);visiting.delete(id);done.add(id);ordered.push(plan.steps.find(p=>p.id===id)!);
 };
 steps.forEach(s=>visit(s.id));
 const ancestors=(id:string):Set<string>=>new Set((byId.get(id)!.dependsOn).flatMap(d=>[d,...ancestors(d)]));
 for(let i=0;i<steps.length;i++)for(let j=i+1;j<steps.length;j++){
  const a=steps[i]!,b=steps[j]!;
  if(a.outputs.some(o=>b.outputs.some(other=>other.trim()===o.trim()))&&!ancestors(a.id).has(b.id)&&!ancestors(b.id).has(a.id))throw Error(`Xung đột đầu ra giữa “${a.goal}” và “${b.goal}”: thêm phụ thuộc hoặc đổi đầu ra.`);
 }
 return ordered;
}
export function editPlanSteps(plan:Plan,input:unknown){
 if(!Array.isArray(input)||!input.length||input.length>20)throw Error('Kế hoạch cần từ 1 đến 20 bước.');
 const ids=new Set<string>();
 const steps:PlanStep[]=input.map(s=>{
  if(!s||typeof s.task!=='string'||!s.task.trim()||s.task.length>4000||typeof s.goal!=='string'||!s.goal.trim())throw Error('Mỗi bước cần mục tiêu và việc làm (tối đa 4.000 ký tự).');
  const id=typeof s.id==='string'&&s.id.trim()&&s.id.length<=80?s.id:uid();if(ids.has(id))throw Error('ID bước bị trùng.');ids.add(id);
  const list=(key:string)=>{if(s[key]===undefined)return undefined;if(!Array.isArray(s[key])||s[key].length>20||s[key].some((x:unknown)=>typeof x!=='string'||x.length>2000))throw Error('Đầu vào, đầu ra hoặc phụ thuộc không hợp lệ.');return [...s[key]] as string[];};
  const field=(key:string)=>{if(s[key]===undefined)return undefined;if(typeof s[key]!=='string'||s[key].length>4000)throw Error('Điều kiện hoặc xử lí lỗi không hợp lệ.');return s[key] as string;};
  return {id,goal:s.goal.slice(0,1000),task:s.task,files:Array.isArray(s.files)?s.files.filter((f:unknown)=>typeof f==='string').slice(0,20):[],risk:typeof s.risk==='string'?s.risk.slice(0,1000):'',status:'waiting',inputs:list('inputs'),outputs:list('outputs'),dependsOn:list('dependsOn'),completion:field('completion'),onError:field('onError')};
 });
 steps.forEach((s,i)=>{if(input[i]?.templateCopy===true)s.templateCopy=true;const old=plan.steps.find(p=>p.id===s.id);if(old?.promptFormat==='yaml-v1'&&old.task===s.task)s.promptFormat='yaml-v1';
  // Nguồn gốc do máy chủ quyết định: chỉ giữ theo mã bước đã có, không nhận từ dữ liệu gửi lên. Bước mới chỉ nhận qua insertTemplate.
  if(s.templateCopy&&old?.origin)s.origin={...old.origin};});
 archivePlan(plan);
 // Any changed contract can invalidate consumers, including dependencies later in the list.
 const definition=(s:PlanStep,i:number,all:PlanStep[])=>JSON.stringify({id:s.id,goal:s.goal,task:s.task,files:s.files,risk:s.risk,...planContract(s,i,all)});
 const changed=steps.length!==plan.steps.length||steps.some((s,i)=>!plan.steps[i]||definition(s,i,steps)!==definition(plan.steps[i]!,i,plan.steps));
 let prefixChanged=false;
 steps.forEach((s,i)=>{const old=plan.steps[i];if(!old||definition(s,i,steps)!==definition(old,i,plan.steps))prefixChanged=true;if(old&&!prefixChanged)Object.assign(s,old);});
 // Non-linear graphs have no safe completed prefix after a definition edit.
 if(changed&&steps.some((s,i)=>s.dependsOn?.some(id=>id!==steps[i-1]?.id)))steps.forEach(s=>{s.status='waiting';delete s.checkpoint;delete s.output;delete s.replacements;delete s.logs;delete s.error;delete s.startedAt;delete s.endedAt;});
 plan.steps=steps;plan.approved=false;plan.revision=(plan.revision??0)+1;
}
export function linkPlan(plan:Plan,list:Workflow[],createdAt?:number):Workflow{
 plan.workflowHidden=false;
 let w=list.find(w=>w.planId===plan.id||w.id===plan.workflowId);
 if(!w){w={id:uid(),name:plan.title,planId:plan.id,steps:[],runs:[],updatedAt:Date.now()};list.push(w);}
 w.createdAt??=createdAt??w.updatedAt;
 const previousDefinition=JSON.stringify([w.name,w.steps,w.mode,w.maxConcurrency]);
 plan.steps=plan.steps.map((s,i)=>({...s,...planContract(s,i,plan.steps)}));
 plan.workflowId=w.id;w.planId=plan.id;w.name=plan.title;w.mode='parallel';w.maxConcurrency=1;
 w.steps=plan.steps.map(s=>({id:s.id,name:s.goal,prompt:s.task,choice:'auto',access:'read',inputs:s.inputs,outputs:s.outputs,dependsOn:s.dependsOn,completion:s.completion,onError:s.onError,...(s.templateCopy?{templateCopy:true as const,files:s.files,...(s.origin?{origin:{...s.origin}}:{})}:{}),...(s.promptFormat?{promptFormat:s.promptFormat}:{})}));if(previousDefinition!==JSON.stringify([w.name,w.steps,w.mode,w.maxConcurrency]))w.updatedAt=Date.now();return w;
}
export function syncPlanRun(plan:Plan,run:WorkflowRun){
 run.steps=plan.steps.map(s=>({stepId:s.id,name:s.goal,status:s.status==='done'?'success':s.status==='interrupted'?'error':s.status,output:s.output,error:s.error,startedAt:s.startedAt,endedAt:s.endedAt,logs:structuredClone(s.logs),checkpoint:structuredClone(s.checkpoint)}));
 run.status=plan.steps.some(s=>s.status==='running')?'running':plan.steps.some(s=>s.status==='error'||s.status==='interrupted'||s.status==='blocked')?'error':plan.steps.every(s=>s.status==='done'||s.status==='skipped')?'success':'paused';
}

/** Dependencies are required data, not just ordering hints. Skipping never supplies data. */
export function missingPlanInputs(plan:Plan,step:PlanStep):PlanStep[]{
 return plan.steps.filter(s=>step.dependsOn?.includes(s.id)&&!(step.replacements?.[s.id]?.trim())&&!(s.status==='done'&&s.output?.trim()));
}
export function logPlanStep(step:PlanStep,text:string){
 (step.logs??=[]).push({at:Date.now(),text});step.logs=step.logs.slice(-100);
}
