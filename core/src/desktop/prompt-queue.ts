import type {Chat} from './types.js';

export interface PendingPrompt {
 id:string; text:string; mode:'queue'|'steer'; at:number;
 options:{plan?:boolean;planningMode?:'chat'|'plan'|'pro';planningTimeoutMs?:number;beautify?:boolean;images?:string[]};
}

/** All mutations use IDs, so stale windows cannot reorder or remove another prompt. */
export function changeQueuedPrompt(chat:Chat,id:string,action:'up'|'down'|'remove'){
 const queue=chat.pendingPrompts??[];const index=queue.findIndex(item=>item.id===id);
 if(index<0)throw Error('Prompt đã được gửi hoặc không còn trong hàng đợi.');
 if(action==='remove'){queue.splice(index,1);return;}
 const target=index+(action==='up'?-1:1);
 if(target>=0&&target<queue.length)[queue[index],queue[target]]=[queue[target]!,queue[index]!];
}

/** Steering is consumed only at an AI boundary, never by aborting a write/tool. */
export function takeSteering(chat:Chat):PendingPrompt[]{
 const items=(chat.pendingPrompts??[]).filter(item=>item.mode==='steer');
 chat.pendingPrompts=(chat.pendingPrompts??[]).filter(item=>item.mode!=='steer');
 return items;
}

export function supplement(text:string){
 return '\n\nTHÔNG TIN BỔ SUNG CỦA GIÁO VIÊN CHO CÔNG VIỆC ĐANG LÀM:\n'+text+'\nTiếp tục mục tiêu đang làm, kết hợp bổ sung này. Đối chiếu kết quả đã thực hiện; không lặp thao tác đã xong.';
}
