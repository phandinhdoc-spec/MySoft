import {describe,it,expect,vi} from 'vitest';
import {applyMatrixAllocation,examPlanPrompt,EXAM_PLAN_MARKER} from '../../shared/src/assessment-workflow.js';
import {SAMPLE_SPEC_KHTN7} from '../../shared/src/teacherSuite.js';
import {reconcileAssessmentMatrix} from '../src/desktop/assessment-matrix.js';
import {validateExamPlan} from '../src/desktop/assessment-plan.js';

const item={...SAMPLE_SPEC_KHTN7.items[0]!,part1Count:0,part2Count:0,part3Points:0,selected:false};
const source='Ô 1: 2 câu TN, 0 câu Đ/S, 1 điểm TL';
const draft=()=>({cells:[{id:'c',topic:item.topic,level:item.level,source,part1Count:2,part2Count:0,part3Points:1}],allocations:[{id:item.id,cellId:'c',part1Count:2,part2Count:0,part3Points:1}]});
describe('matrix reconciliation',()=>{
 it('applies exact source allocation without changing YCCĐ or mutating input',()=>{
  const result=applyMatrixAllocation([item],draft(),source);
  expect(result[0]).toMatchObject({content:item.content,selected:true,part1Count:2,part3Points:1});expect(item.part1Count).toBe(0);
 });
 it.each(['part1Count','part2Count','part3Points'] as const)('rejects wrong cell total %s',key=>{
  const d=draft();d.allocations[0]![key]+=1;expect(()=>applyMatrixAllocation([item],d,source)).toThrow('chưa khớp');
 });
 it('rejects a wrong level even with matching totals',()=>{const d=draft();d.cells[0]!.level=item.level==='NB'?'TH':'NB';expect(()=>applyMatrixAllocation([item],d,source)).toThrow('chủ đề/mức độ');});
 it('rejects duplicate allocation and invented source',()=>{
  const d=draft();d.allocations.push(d.allocations[0]!);expect(()=>applyMatrixAllocation([item],d,source)).toThrow();
  expect(()=>applyMatrixAllocation([item],draft(),'other')).toThrow('căn cứ');
 });
 it('rejects fractional counts and negative points',()=>{const d=draft();d.cells[0]!.part1Count=0.5;expect(()=>applyMatrixAllocation([item],d,source)).toThrow();d.cells[0]!.part1Count=2;d.allocations[0]!.part3Points=-1;expect(()=>applyMatrixAllocation([item],d,source)).toThrow();});
 it('requires independent review before returning updates',async()=>{
  const model=vi.fn().mockResolvedValueOnce(JSON.stringify(draft())).mockResolvedValueOnce('{"passed":false,"issues":["Thiếu một ô"]}');
  await expect(reconcileAssessmentMatrix(source,[item],false,model)).rejects.toThrow('Thiếu một ô');expect(model).toHaveBeenCalledTimes(2);
 });
 it('does not overwrite a manual selection which differs from source',async()=>{
  await expect(reconcileAssessmentMatrix(source,[item],true,vi.fn().mockResolvedValue(JSON.stringify(draft())))).rejects.toThrow('Phân bổ đã chọn');
 });
 it('returns verified AI allocation',async()=>{
  const model=vi.fn().mockResolvedValueOnce(JSON.stringify(draft())).mockResolvedValueOnce('{"passed":true,"issues":[]}');
  expect((await reconcileAssessmentMatrix(source,[item],false,model)).items[0]!.part1Count).toBe(2);
 });
 it('blocks missing source and unreadable matrices',async()=>{
  const model=vi.fn().mockResolvedValue('{"issues":["Không đọc được bảng"]}');
  await expect(reconcileAssessmentMatrix('',[item],false,model)).rejects.toThrow('Thiếu nguồn');
  await expect(reconcileAssessmentMatrix(source,[item],false,model)).rejects.toThrow('Không đọc được');
 });
});
it('exam requests explicitly require the staged Plan Pro contract',()=>{
 const prompt=examPlanPrompt('Xuất đề',{source});expect(prompt.startsWith(EXAM_PLAN_MARKER)).toBe(true);expect(prompt).toContain('exam-export');
 const ids=['exam-source','exam-allocation','exam-draft','exam-solve','exam-audit','exam-export'];
 const plan={steps:ids.map((id,i)=>({id,dependsOn:i?[ids[i-1]!]:[]}))} as Parameters<typeof validateExamPlan>[0];
 expect(()=>validateExamPlan(plan)).not.toThrow();plan.steps[5]!.dependsOn=[];expect(()=>validateExamPlan(plan)).toThrow();
});
