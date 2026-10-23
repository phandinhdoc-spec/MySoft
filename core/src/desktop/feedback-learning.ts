import type {ModelChoice} from '@pvta/shared';
export type LearningKind='feedback'|'praise'|'habit';
export interface LearningItem {chatId:string;text:string;about:string;retries:number;kind?:LearningKind}
/** Keep observations within a chat; a single request or compliment is not a habit. */
export function learningBatch(queue:LearningItem[]):LearningItem[]{
 const feedback=queue.find(x=>x.retries<3&&(!x.kind||x.kind==='feedback'));
 if(feedback)return [feedback];
 for(const item of queue){
  if(item.retries>=3)continue;
  const batch=queue.filter(x=>x.chatId===item.chatId&&x.kind===item.kind&&x.retries<3);
  const minimum=item.kind==='praise'?2:3;
  if(batch.length>=minimum)return batch.slice(0,minimum);
 }
 return [];
}
export function isCorrection(text:string):boolean{
 return /không (?:đúng|ổn|đạt|thích|đồng ý|hài lòng|ưng)|chưa (?:đúng|đạt|ổn|ưng)|sai(?:\s|[,.!?:]|$)|làm lại|sửa lại|lần sau|hãy nhớ|tôi thích|giữ nguyên|đừng|xấu quá|rối quá|khó đọc/i.test(text);
}
/** Choose only a lightweight model already listed by a configured backend. */
export function lightFeedbackModel(choices:ModelChoice[]):ModelChoice|undefined{
 const score=(m:ModelChoice)=>{
  const id=m.model.toLowerCase();
  if(/opus|sonnet|(?:^|[-/])pro(?:[-/]|$)|reasoner|thinking|large|(?:^|[-/])max(?:[-/]|$)/.test(id))return Infinity;
  if(/flash[-_. ]?lite/.test(id))return 0;
  if(/haiku|nano/.test(id))return 1;
  if(/mini|small|lite/.test(id))return 2;
  if(/flash|instant|fast/.test(id))return 3;
  return Infinity;
 };
 return choices.filter(c=>Number.isFinite(score(c))).sort((a,b)=>score(a)-score(b))[0];
}
export const feedbackRuleKey=(s:string)=>s.normalize('NFC').toLocaleLowerCase('vi').replace(/\s+/g,' ').replace(/[.!。]+$/,'').trim();
