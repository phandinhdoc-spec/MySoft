import type {Workflow,WorkflowFrame,WorkflowStep,WorkflowResource} from './types.js';
import {assertNoShadow,parseDeclarations,mergeDeclarations,type Declarations} from './workflow-vars.js';
import {scopedWorkflowResources} from './workflow-scoped-resources.js';

export const MAX_FRAME_DEPTH=3,MAX_FRAMES=20,MAX_SUB_DEPTH=3,MAX_FLAT_STEPS=60;
const STR=(v:unknown,max:number)=>typeof v==='string'?v.slice(0,max):'';

/** "1,3,5-9" → [1,3,5,6,7,8,9] (số thứ tự bắt đầu từ 1). Báo lỗi khi sai cú pháp hoặc vượt tổng số nút. */
export function parseSelection(text:string,total:number):number[]{
 const out=new Set<number>();
 const parts=text.split(/[,;\s]+/).filter(Boolean);
 if(!parts.length)throw Error('Chưa nhập số thứ tự nút.');
 for(const part of parts){
  const m=/^(\d+)(?:-(\d+))?$/.exec(part);
  if(!m)throw Error(`“${part}” không đúng cú pháp. Ví dụ: 1,3,5-9.`);
  const a=Number(m[1]),b=m[2]===undefined?a:Number(m[2]);
  if(a<1||b<a||b>total)throw Error(`“${part}” nằm ngoài khoảng 1–${total}.`);
  for(let i=a;i<=b;i++)out.add(i);
 }
 return [...out].sort((x,y)=>x-y);
}

/** Đổi số thứ tự (theo thứ tự hiện của danh sách nút) sang mã nút. Khung chỉ lưu mã, nên đánh số lại không làm hỏng khung. */
export function stepIdsFromNumbers(steps:{id:string}[],text:string):string[]{
 return parseSelection(text,steps.length).map(n=>steps[n-1]!.id);
}

/** Làm sạch khung từ giao diện: bỏ nút không còn tồn tại, bỏ khung rỗng. Chưa kiểm tra lồng/chồng (xem validateFrames). */
export function cleanFrames(input:unknown,steps:{id:string}[]):WorkflowFrame[]{
 if(input===undefined||input===null)return [];
 if(!Array.isArray(input))throw Error('Danh sách khung không hợp lệ.');
 if(input.length>MAX_FRAMES)throw Error(`Tối đa ${MAX_FRAMES} khung.`);
 const ids=new Set(steps.map(s=>s.id)),used=new Set<string>();
 const out:WorkflowFrame[]=[];
 for(const f of input as any[]){
  const id=STR(f?.id,80)||globalThis.crypto.randomUUID();
  if(used.has(id))throw Error('ID khung bị trùng.');used.add(id);
  const stepIds=[...new Set((Array.isArray(f?.stepIds)?f.stepIds:[]).filter((x:unknown):x is string=>typeof x==='string'&&ids.has(x)))] as string[];
  if(!stepIds.length)continue;
  out.push({id,name:STR(f?.name,100).trim()||'Khung',stepIds,decl:STR(f?.decl,4000)});
 }
 return out;
}

const subset=(a:string[],b:Set<string>)=>a.every(x=>b.has(x));
/**
 * Quy tắc: hai khung hoặc rời nhau, hoặc khung này nằm trọn trong khung kia (không bằng nhau).
 * Chồng một phần bị từ chối; lồng tối đa MAX_FRAME_DEPTH tầng; tên biến/hàm không che khuất khung ngoài.
 * Trả về cha của từng khung (id → id khung ngoài trực tiếp).
 */
export function validateFrames(frames:WorkflowFrame[]):Map<string,string|undefined>{
 const sets=frames.map(f=>new Set(f.stepIds));
 for(let i=0;i<frames.length;i++)for(let j=i+1;j<frames.length;j++){
  const a=frames[i]!,b=frames[j]!,common=a.stepIds.filter(x=>sets[j]!.has(x)).length;
  if(!common)continue;
  const aInB=subset(a.stepIds,sets[j]!),bInA=subset(b.stepIds,sets[i]!);
  if(aInB&&bInA)throw Error(`Khung “${a.name}” và “${b.name}” bọc đúng cùng các nút.`);
  if(!aInB&&!bInA)throw Error(`Khung “${a.name}” và “${b.name}” chồng lên nhau một phần. Hãy tách riêng hoặc để khung này nằm trọn trong khung kia.`);
 }
 const parent=new Map<string,string|undefined>();
 frames.forEach((f,i)=>{
  let best:number|undefined;
  frames.forEach((g,j)=>{if(i!==j&&g.stepIds.length>f.stepIds.length&&subset(f.stepIds,sets[j]!)&&(best===undefined||g.stepIds.length<frames[best]!.stepIds.length))best=j;});
  parent.set(f.id,best===undefined?undefined:frames[best]!.id);
 });
 const byId=new Map(frames.map(f=>[f.id,f]));
 for(const f of frames){
  const chain:WorkflowFrame[]=[];
  for(let c:WorkflowFrame|undefined=f;c;c=parent.get(c.id)?byId.get(parent.get(c.id)!):undefined)chain.unshift(c);
  if(chain.length>MAX_FRAME_DEPTH)throw Error(`Khung “${f.name}” lồng quá ${MAX_FRAME_DEPTH} tầng.`);
  assertNoShadow(chain.map(c=>({name:c.name,decl:parseDeclarations(c.decl)})));
 }
 return parent;
}

/** Khung chứa nút, từ ngoài vào trong. */
export function frameChain(frames:WorkflowFrame[],stepId:string):WorkflowFrame[]{
 return frames.filter(f=>f.stepIds.includes(stepId)).sort((a,b)=>b.stepIds.length-a.stepIds.length);
}
/** Khai báo hiệu lực của một nút: gộp mọi khung bọc nó. Rỗng nếu nút nằm ngoài mọi khung. */
export function declarationsFor(frames:WorkflowFrame[],stepId:string):Declarations{
 return mergeDeclarations(frameChain(frames,stepId).map(f=>parseDeclarations(f.decl)));
}
/** Khung ngoài cùng bọc nút: dùng làm "phạm vi ngôn ngữ" chung (một ngôn ngữ cho cả khung). */
export function outerFrame(frames:WorkflowFrame[],stepId:string):WorkflowFrame|undefined{return frameChain(frames,stepId)[0];}

const explicitDeps=(wf:Pick<Workflow,'mode'|'steps'>)=>wf.steps.map((s,i)=>wf.mode==='parallel'?(s.dependsOn??[]):(i?[wf.steps[i-1]!.id]:[]));

/** Nút tham chiếu quy trình khác không được tạo vòng; độ sâu tối đa MAX_SUB_DEPTH. */
export function assertNoCycle(wf:Workflow,all:Workflow[]):void{
 const byId=new Map(all.map(w=>[w.id,w]));byId.set(wf.id,wf);
 const visit=(w:Workflow,path:string[])=>{
  if(path.length>MAX_SUB_DEPTH)throw Error(`Quy trình lồng nhau quá ${MAX_SUB_DEPTH} tầng.`);
  for(const s of w.steps){
   if(!s.subWorkflowId)continue;
   if(path.includes(s.subWorkflowId))throw Error('Quy trình chứa chính nó (vòng tham chiếu).');
   const child=byId.get(s.subWorkflowId);
   if(!child)throw Error(`Nút “${s.name}” trỏ tới quy trình không còn tồn tại.`);
   visit(child,[...path,s.subWorkflowId]);
  }
 };
 visit(wf,[wf.id]);
}

/**
 * Trải phẳng: nút tham chiếu quy trình con được thay bằng các nút của quy trình con (mã có tiền tố `<mã nút>.`).
 * Gốc của con chờ những gì nút cha chờ; những nút chờ nút cha sẽ chờ các nút cuối của con.
 * Khung của quy trình con được mang theo (đổi tiền tố); khung bọc nút cha sẽ bọc cả các nút của con.
 */
export function flattenWorkflow(wf:Workflow,all:Workflow[]):{steps:WorkflowStep[];frames:WorkflowFrame[]}{
 assertNoCycle(wf,all);
 const byId=new Map(all.map(w=>[w.id,w]));
 const build=(w:Workflow,prefix:string,inherited:WorkflowResource[]=[]):{steps:WorkflowStep[];frames:WorkflowFrame[]}=>{
  const deps=explicitDeps(w);
  const stepsOut:WorkflowStep[]=[],framesOut:WorkflowFrame[]=[];
  const expandedIds=new Map<string,string[]>(); // mã nút cha → các mã nút thay thế
  const terminalsOf=new Map<string,string[]>();
  w.steps.forEach((s,i)=>{
   const myDeps=deps[i]!.flatMap(d=>terminalsOf.get(d)??[prefix+d]);
   if(!s.subWorkflowId){
    stepsOut.push({...s,resources:[...inherited,...scopedWorkflowResources(s,w.steps)].map((r,i)=>({...r,id:`scoped-${i}`,scope:'step'})),...(w.planId&&!s.templateCopy?{planPrompt:true as const}:{}),id:prefix+s.id,dependsOn:myDeps,subWorkflowId:undefined});
    expandedIds.set(s.id,[prefix+s.id]);terminalsOf.set(s.id,[prefix+s.id]);return;
   }
   const child=byId.get(s.subWorkflowId)!;
   const inner=build(child,`${prefix}${s.id}.`,[...inherited,...scopedWorkflowResources(s,w.steps)]);
   const childIds=new Set(inner.steps.map(x=>x.id));
   const innerDependedOn=new Set(inner.steps.flatMap(x=>x.dependsOn??[]));
   inner.steps.forEach(x=>{const roots=!(x.dependsOn??[]).some(d=>childIds.has(d));stepsOut.push(roots?{...x,dependsOn:[...(x.dependsOn??[]),...myDeps]}:x);});
   framesOut.push(...inner.frames);
   expandedIds.set(s.id,inner.steps.map(x=>x.id));
   terminalsOf.set(s.id,inner.steps.filter(x=>!innerDependedOn.has(x.id)).map(x=>x.id));
  });
  for(const f of w.frames??[])framesOut.push({...f,id:prefix+f.id,stepIds:f.stepIds.flatMap(id=>expandedIds.get(id)??[])});
  return {steps:stepsOut,frames:framesOut};
 };
 const out=build(wf,'');
 if(out.steps.length>MAX_FLAT_STEPS)throw Error(`Sau khi trải phẳng quy trình lồng nhau có ${out.steps.length} nút, vượt giới hạn ${MAX_FLAT_STEPS}.`);
 // Khung ngoài bọc nút cha → đã gồm mọi nút con; khung con nằm bên trong nên lồng đúng.
 return out;
}
