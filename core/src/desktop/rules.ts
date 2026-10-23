import {ruleTextForSave} from '../standardize/rule.js';
import type {Rule} from './types.js';

export const MAX_RULES=100;
export const MAX_RULE_TEXT=20000;
const TOKEN=/(^|[\s(])#([a-z0-9][a-z0-9-]{0,39})(?=$|[\s.,;:!?)])/gu;

/** Khóa gọi quy tắc (#khóa): chữ thường không dấu, nối bằng gạch ngang. */
export function ruleKey(title:string):string{
 const slug=title.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,36).replace(/-+$/,'');
 return slug||'quy-tac';
}
function uniqueKey(base:string,taken:Set<string>):string{
 if(!taken.has(base))return base;
 for(let n=2;n<1000;n++){const key=`${base.slice(0,36)}-${n}`;if(!taken.has(key))return key;}
 return `${base.slice(0,30)}-${Date.now().toString(36)}`;
}
export type RuleResult={ok:true;rule:Rule;list:Rule[]}|{ok:false;error:string};

/** Tạo hoặc sửa một quy tắc. Khóa được giữ nguyên khi sửa để các tin nhắn cũ vẫn đúng. */
export function saveRule(list:Rule[],input:unknown,newId:()=>string,now=Date.now()):RuleResult{
 if(!input||typeof input!=='object')return {ok:false,error:'Quy tắc không hợp lệ.'};
 const p=input as Record<string,unknown>;
 const title=typeof p.title==='string'?p.title.slice(0,80):'';
 let text=typeof p.text==='string'?p.text:'';
 if(!title.trim())return {ok:false,error:'Hãy đặt tên cho quy tắc.'};
 if(!text.trim())return {ok:false,error:'Nội dung quy tắc đang trống.'};
 if(text.length>MAX_RULE_TEXT)return {ok:false,error:`Quy tắc quá dài (tối đa ${MAX_RULE_TEXT} ký tự).`};
 try{text=ruleTextForSave(text,MAX_RULE_TEXT);}catch(e){return {ok:false,error:(e as Error).message};}
 const always=p.always===true;
 const old=typeof p.id==='string'?list.find(r=>r.id===p.id):undefined;
 if(old){const rule:Rule={...old,title,text,always,at:now};return {ok:true,rule,list:list.map(r=>r.id===old.id?rule:r)};}
 if(list.length>=MAX_RULES)return {ok:false,error:`Đã đủ ${MAX_RULES} quy tắc; hãy xóa bớt.`};
 const key=uniqueKey(ruleKey(title),new Set(list.map(r=>r.key)));
 const rule:Rule={id:newId(),key,title,text,always,at:now};
 return {ok:true,rule,list:[...list,rule]};
}

/** Các quy tắc được gọi bằng #khóa trong tin nhắn. */
export function invokedRules(list:Rule[],text:string):Rule[]{
 const found=new Set<string>();for(const m of text.matchAll(TOKEN))found.add(m[2]!);
 return list.filter(r=>found.has(r.key));
}
/** Văn bản đưa vào lời nhắc: quy tắc luôn áp dụng và quy tắc được gọi. */
export function rulesPrompt(list:Rule[],text:string):string{
 const invoked=invokedRules(list,text).filter(r=>!r.always);
 const lines=(rs:Rule[])=>rs.map(r=>`- [#${r.key}] ${r.title}: ${r.text}`).join('\n');
 const parts:string[]=[];
 const always=list.filter(r=>r.always);
 if(always.length)parts.push(`QUY TẮC LUÔN ÁP DỤNG:\n${lines(always)}`);
 if(invoked.length)parts.push(`QUY TẮC THẦY CÔ GỌI TRONG YÊU CẦU:\n${lines(invoked)}`);
 return parts.join('\n');
}

/** Phạm vi của một quy tắc đặt tên: cá nhân (mọi hội thoại) · dự án (chỉ dự án đó) · hội thoại (chỉ hội thoại đó). */
export type RuleScope={kind:'profile'}|{kind:'project';id:string}|{kind:'chat';id:string};
export type RuleScopeKind=RuleScope['kind'];
export interface RuleLayers{profile:Rule[];project:Rule[];chat:Rule[]}
export type ScopedRule=Rule&{scope:RuleScopeKind};
const SCOPE_LABEL:Record<RuleScopeKind,string>={profile:'cá nhân',project:'dự án',chat:'hội thoại này'};
const ID_RE=/^[\w-]{1,80}$/;

/** Đọc phạm vi do giao diện gửi lên; thiếu thì coi là hồ sơ cá nhân (tương thích bản cũ). */
export function parseRuleScope(input:unknown):RuleScope{
 if(input===undefined||input===null)return {kind:'profile'};
 if(typeof input!=='object')throw Error('Phạm vi quy tắc không hợp lệ.');
 const p=input as Record<string,unknown>;
 if(p.kind==='profile')return {kind:'profile'};
 if((p.kind==='project'||p.kind==='chat')&&typeof p.id==='string'&&ID_RE.test(p.id))return {kind:p.kind,id:p.id};
 throw Error('Phạm vi quy tắc không hợp lệ.');
}

/** Gộp ba tầng theo khóa: cùng khóa thì phạm vi hẹp hơn (hội thoại > dự án > cá nhân) thay thế phạm vi rộng hơn. */
export function effectiveRules(layers:RuleLayers):ScopedRule[]{
 const byKey=new Map<string,ScopedRule>();
 for(const scope of ['profile','project','chat'] as const)for(const r of layers[scope])byKey.set(r.key,{...r,scope});
 return [...byKey.values()];
}

/** Lời nhắc quy tắc cho một lượt: luôn áp dụng + được gọi bằng #khóa, mỗi dòng ghi rõ phạm vi. */
export function scopedRulesPrompt(layers:RuleLayers,text:string):string{
 const all=effectiveRules(layers);
 const found=new Set<string>();for(const m of text.matchAll(TOKEN))found.add(m[2]!);
 const lines=(rs:ScopedRule[])=>rs.map(r=>`- [#${r.key}] (${SCOPE_LABEL[r.scope]}) ${r.title}: ${r.text}`).join('\n');
 const always=all.filter(r=>r.always);
 const invoked=all.filter(r=>!r.always&&found.has(r.key));
 const parts:string[]=[];
 if(always.length)parts.push(`QUY TẮC LUÔN ÁP DỤNG:\n${lines(always)}`);
 if(invoked.length)parts.push(`QUY TẮC THẦY CÔ GỌI TRONG YÊU CẦU:\n${lines(invoked)}`);
 return parts.join('\n');
}
