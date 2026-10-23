import {EXAM_PLAN_MARKER} from '../../../shared/src/assessment-workflow.js';
import type {Plan} from './types.js';
export function validateExamPlan(plan:Pick<Plan,'steps'>){
 const ids=['exam-source','exam-allocation','exam-draft','exam-solve','exam-audit','exam-export'];
 if(plan.steps.length!==ids.length||ids.some((id,i)=>!plan.steps.some(s=>s.id===id&&(i===0||s.dependsOn?.includes(ids[i-1]!)))))throw Error('Plan đề thi cần đủ 6 bước đọc nguồn, phân bổ, soạn, giải kiểm, đối chiếu, xuất; mỗi bước chờ bước trước.');
}
export function isExamPlan(plan:Plan){return plan.assessment===true||plan.context?.startsWith(EXAM_PLAN_MARKER)===true;}
