import {expect,it} from 'vitest';
import {normalizeWorkflow,WorkflowRunner} from '../src/desktop/workflows.js';
import {cleanWorkflowResources,scopedWorkflowResources} from '../src/desktop/workflow-scoped-resources.js';
import {resourceDigest} from '../src/desktop/workflow-fingerprint.js';
import {normalizeTemplate,expandTemplate} from '../src/desktop/workflow-templates.js';
import {editPlanSteps,linkPlan,planVersion} from '../src/desktop/plans.js';
import type {WorkflowResource,Plan} from '../src/desktop/types.js';

const resource=(scope:'step'|'workflow',kind:WorkflowResource['kind']='rule'):WorkflowResource=>({id:scope+kind,kind,name:kind,body:`BODY_${scope}_${kind}`,scope});
const workflow=()=>normalizeWorkflow({name:'T',steps:[{id:'a',name:'a',prompt:'Làm a',resources:[resource('step'),resource('workflow','skill'),resource('workflow','prompt')]},{id:'b',name:'b',prompt:'Làm b'}]});
it('lưu, làm sạch và từ chối cấu hình sai thay vì âm thầm mất nội dung',()=>{
 const w=workflow();expect(w.steps[0]!.resources).toHaveLength(3);
 expect(()=>cleanWorkflowResources([{...resource('step'),scope:'library'}])).toThrow();
 expect(()=>cleanWorkflowResources([resource('step'),resource('step')])).toThrow();
 expect(()=>cleanWorkflowResources([{...resource('step'),body:' '}])).toThrow();
});
it('bộ chạy gửi đúng nội dung cho nút, toàn quy trình và nút thêm sau',async()=>{
 const w=workflow();w.steps.push({id:'c',name:'c',prompt:'Làm c',choice:'auto',access:'read'});
 const calls:string[]=[];
 const runner=new WorkflowRunner({list:()=>[w],changed:()=>{},model:async text=>{calls.push(text);return 'Đã xong';}});
 expect((await runner.run(w.id)).status).toBe('success');
 expect(calls).toHaveLength(3);
 expect(calls[0]).toContain('BODY_step_rule');
 for(const text of calls){expect(text).toContain('BODY_workflow_skill');expect(text).toContain('BODY_workflow_prompt');}
 expect(calls[1]).not.toContain('BODY_step_rule');expect(calls[2]).not.toContain('BODY_step_rule');
});
it('đổi cấu hình toàn quy trình làm đổi dấu vân tay của nút khác',()=>{
 const w=workflow(),s=w.steps[1]!;const before=resourceDigest(s,w);
 w.steps[0]!.resources![1]!.body='Đã sửa';expect(resourceDigest(s,w)).not.toBe(before);
 const b=resourceDigest(s,w);w.steps[0]!.resources![0]!.body='Chỉ sửa nút a';expect(resourceDigest(s,w)).toBe(b);
});
it('mẫu giữ cấu hình qua lưu và đưa nội dung đúng phạm vi vào bước cụ thể',()=>{
 const w=workflow();const t=normalizeTemplate({name:'Mẫu',params:[],steps:w.steps,output:{mode:'ask',text:''}});
 const result=expandTemplate(t,{params:{},output:'Văn bản'},{rule:()=>undefined,skill:()=>undefined,prompt:()=>undefined},{maxPrompt:20000});
 expect(scopedWorkflowResources(result[0]!,result).map(r=>r.body)).toContain('BODY_step_rule');
 expect(scopedWorkflowResources(result[1]!,result).map(r=>r.body)).not.toContain('BODY_step_rule');
 expect(scopedWorkflowResources(result[1]!,result).map(r=>r.body)).toContain('BODY_workflow_prompt');
});
it('Plan giữ cấu hình và bản đã duyệt không bị thay đổi khi sửa nội dung mới',()=>{
 const plan:Plan={id:'p',chatId:'c',title:'P',approved:false,steps:[]};
 editPlanSteps(plan,[{id:'a',goal:'A',task:'A',resources:[resource('workflow')]},{id:'b',goal:'B',task:'B'}]);
 const w=linkPlan(plan,[]),snapshot=planVersion(plan);
 expect(w.steps[0]!.resources).toEqual([resource('workflow')]);
 plan.steps[0]!.resources![0]!.body='Mới';
 expect(scopedWorkflowResources(snapshot.steps[1]!,snapshot.steps)[0]!.body).toBe('BODY_workflow_rule');
});
