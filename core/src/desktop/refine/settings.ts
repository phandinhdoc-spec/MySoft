import type {RefineSettings} from '../types.js';

/** Mặc định: bật, 22:30 hằng ngày, tự chọn model. Mọi giá trị đều có thể đổi ở Cài đặt → Biên tập nền. */
export const defaultRefineSettings=():RefineSettings=>({enabled:true,time:'22:30',everyDays:1,model:'auto',autoCatchUp:false});
export const REFINE_EVERY:readonly RefineSettings['everyDays'][]=[1,3,7,30];
const BACKENDS=['agy','claude','codex','opencode','api'] as const;

/** Kiểm tra và chuẩn hóa cài đặt từ giao diện; sai thì báo lỗi, không lưu một phần. */
export function normalizeRefine(input:unknown,current:RefineSettings=defaultRefineSettings()):RefineSettings{
 if(!input||typeof input!=='object')throw Error('Thiếu cài đặt biên tập nền.');
 const v=input as Record<string,unknown>;const next:RefineSettings={...current};
 if('enabled' in v){if(typeof v.enabled!=='boolean')throw Error('Trạng thái bật/tắt không hợp lệ.');next.enabled=v.enabled;}
 if('autoCatchUp' in v){if(typeof v.autoCatchUp!=='boolean')throw Error('Lựa chọn chạy bù không hợp lệ.');next.autoCatchUp=v.autoCatchUp;}
 if('time' in v){if(typeof v.time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(v.time))throw Error('Giờ chạy phải có dạng HH:MM, ví dụ 22:30.');next.time=v.time;}
 if('everyDays' in v){const n=Number(v.everyDays);if(!REFINE_EVERY.includes(n as never))throw Error('Tần suất không hợp lệ.');next.everyDays=n as RefineSettings['everyDays'];}
 if('model' in v){
  if(v.model==='auto')next.model='auto';
  else{
   const m=v.model as {backend?:unknown;model?:unknown}|null;
   if(!m||typeof m!=='object'||!BACKENDS.includes(m.backend as never)||typeof m.model!=='string'||!m.model.trim()||m.model.length>200)throw Error('Model không hợp lệ.');
   next.model={backend:m.backend as never,model:m.model.trim()};
  }
 }
 return next;
}
