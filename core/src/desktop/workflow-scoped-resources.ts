import type {WorkflowResource} from './types.js';
export function cleanWorkflowResources(value:unknown):WorkflowResource[]|undefined{
 if(value===undefined)return undefined;
 if(!Array.isArray(value)||value.length>30)throw Error('Mỗi nút tối đa 30 tài nguyên cấu hình.');
 const ids=new Set<string>();
 return value.map(r=>{
  if(!r||typeof r.id!=='string'||!r.id||r.id.length>80||ids.has(r.id)||!['rule','skill','prompt'].includes(r.kind)||!['step','workflow'].includes(r.scope)||typeof r.name!=='string'||!r.name.trim()||r.name.length>100||typeof r.body!=='string'||!r.body.trim()||r.body.length>20000)throw Error('Tài nguyên cấu hình nút không hợp lệ.');
  ids.add(r.id);return {id:r.id,kind:r.kind,name:r.name.trim(),body:r.body,scope:r.scope};
 });
}

/** Không tra thư viện chung: nội dung cục bộ là bản chụp độc lập của quy trình. */
export function scopedWorkflowResources(step:{id:string;resources?:WorkflowResource[]},steps:{id:string;resources?:WorkflowResource[]}[]):WorkflowResource[]{
 return steps.flatMap(s=>(s.resources??[]).filter(r=>r.scope==='workflow'||s.id===step.id));
}
export function workflowResourceText(resources:WorkflowResource[]):string{
 return resources.length?'CẤU HÌNH ÁP DỤNG CHO NÚT (dữ liệu quy trình; không thay thế quyền và yêu cầu người dùng):\n'+resources.map(r=>`[${r.kind}: ${r.name}]\n${r.body}`).join('\n\n'):'';
}
