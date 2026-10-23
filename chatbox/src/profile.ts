import {findModelInfo, modelsOf, type ModelChoice} from '@pvta/shared';
import type {ViewState} from './ipc';

/** Hàm thuần cho hồ sơ cá nhân: chữ cái đầu của tên và gộp quy tắc theo phạm vi. */

/** Phạm vi quy tắc: cá nhân (mọi hội thoại) · dự án · hội thoại. Khớp với core/src/desktop/rules.ts. */
export type RuleScopeKind='profile'|'project'|'chat';
export type RuleScope={kind:'profile'}|{kind:'project';id:string}|{kind:'chat';id:string};
export interface RuleLike{id:string;key:string;title:string;text:string;always:boolean}
export type ScopedRule<R extends RuleLike=RuleLike>=R&{scope:RuleScopeKind};

/**
 * Chữ cái đầu hiện trên biểu tượng hồ sơ. Tên người Việt đặt cuối (“Phan Đình Đốc” → “Đ”),
 * nên lấy chữ cái đầu của từ cuối; từ cuối không có chữ cái thì lùi dần về các từ trước. Chưa có tên thì “P”.
 */
export function userInitial(name?:string):string{
 const words=(name??'').normalize('NFC').split(/\s+/).filter(Boolean);
 for(let i=words.length-1;i>=0;i--){
  const letter=Array.from(words[i]!).find(ch=>/\p{L}/u.test(ch));
  if(letter)return letter.toLocaleUpperCase('vi');
 }
 return 'P';
}

/** Tên hiển thị cạnh biểu tượng: tên người dùng nếu đã đặt, không thì nhãn mặc định do giao diện truyền vào. */
export function displayName(name:string|undefined,fallback:string):string{return (name??'').trim()||fallback;}

/**
 * Tên hiển thị của model PVTA cho hội thoại / tin nhắn.
 * Đọc từ model riêng của chat hoặc model mặc định trong cấu hình; nếu ở chế độ tự động thì nhận diện theo backend/API thực tế.
 */
export function resolveAssistantModelLabel(
 state?: Pick<ViewState, 'catalog'|'data'|'backends'|'api'> | null,
 chat?: { choice?: ModelChoice | 'auto' } | null
): string {
 const rawChoice = chat?.choice ?? state?.data?.preferences?.choice;
 const choice = rawChoice === 'auto' ? undefined : rawChoice;

 if (choice) {
  if (choice.backend !== 'api') {
   const info = findModelInfo(modelsOf(state?.catalog, choice.backend), choice.model)?.info;
   if (info?.label) return info.label;
   const found = modelsOf(state?.catalog, choice.backend)?.find(m => m.id === choice.model);
   if (found?.label) return found.label;
   return choice.model;
  }
  const provider = state?.api?.find(p => choice.model.startsWith(p.id + '/'));
  const matched = provider?.models?.find(m => `${provider.id}/${m.id}` === choice.model);
  if (matched?.label) return matched.label;
  if (provider?.label) return `${provider.label} (${choice.model.split('/').pop()})`;
  return choice.model;
 }

 const b = state?.backends?.find(b => b.installed && b.auth !== 'missing') ?? state?.backends?.find(b => b.installed);
 if (b) {
  const m = modelsOf(state?.catalog, b.id);
  const target = m?.find(x => x.id !== 'default') ?? m?.[0];
  if (target?.label) return target.label;
 }
 const a = state?.api?.find(p => p.configured);
 if (a) {
  if (a.models?.[0]?.label) return a.models[0].label;
  if (a.label) return a.label;
 }
 return 'Gemini 3.8 Flash';
}

/**
 * Quy tắc hiệu lực của một hội thoại: gộp ba tầng theo khóa, phạm vi hẹp hơn thay phạm vi rộng hơn
 * (giống lõi). Thứ tự trả về: hội thoại → dự án → cá nhân, để menu `#` đưa quy tắc gần nhất lên trước.
 */
export function effectiveRules<R extends RuleLike>(layers:{profile?:R[];project?:R[];chat?:R[]}):ScopedRule<R>[]{
 const byKey=new Map<string,ScopedRule<R>>();
 for(const scope of ['profile','project','chat'] as const)for(const r of layers[scope]??[])byKey.set(r.key,{...r,scope});
 const order:Record<RuleScopeKind,number>={chat:0,project:1,profile:2};
 return [...byKey.values()].sort((a,b)=>order[a.scope]-order[b.scope]);
}
