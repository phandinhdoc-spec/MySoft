import {modelsOf} from '../../shared/src/models.js';
import type {ViewState,Chat} from '../../core/src/desktop/types.js';
import {themes} from './display.js';

export interface Item {label:string;detail:string;value:string;complete?:boolean}
const commands:Item[]=[
  ['theme','Đổi chủ đề'],['models','Chọn nhà cung cấp và model'],['model','Chọn model'],
  ['help','Hướng dẫn'],['new','Hội thoại mới'],['chats','Lịch sử hội thoại'],
  ['skills','Danh sách kỹ năng'],['rules','Quy tắc'],['actions','Đề xuất chờ duyệt'],
  ['plans','Danh sách kế hoạch'],['stop','Dừng tác vụ'],['diff','Xem thay đổi'],
  ['preview','Xem bản nháp'],['save','Lưu bản nháp'],['discard','Bỏ bản nháp'],
  ['undo','Hoàn tác lần lưu'],['toc','Mục lục'],['editor','Mở trình soạn thảo'],
  ['browser','Xem Markdown trong trình duyệt'],['activity','Nhật ký'],['connect','Kết nối lại'],
  ['typecheck','Kiểm tra kiểu'],['build','Biên dịch'],['lint','Kiểm tra mã'],['quit','Thoát'],
].map(([name,detail])=>({label:'/'+name,detail:detail!,value:'/'+name}));
for(const [name,detail] of [['mode','Chế độ: chat code markdown write plan pro'],['access','Quyền: read ask full'],['writing','Chọn chế độ viết'],['attach','Đính kèm đường dẫn'],['edit','Mở tệp Markdown'],['code','Đọc mã nguồn'],['open','Mở tệp'],['chat','Mở mã hội thoại'],['replace','Thay dòng bản nháp'],['approve','Duyệt mã đề xuất'],['decline','Từ chối mã đề xuất'],['output','Mở mã kết quả'],['run','Chạy mã Plan'],['step','Chạy khâu Plan'],['recovery','Kiểm tra khôi phục'],['test','Chạy script npm'],['activate','Email và mã kích hoạt'],['rpc','RPC nâng cao']])commands.push({label:'/'+name,detail:detail!,value:'/'+name+' ',complete:true});
const normalize=(s:string)=>s.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
export function filterItems(items:Item[],query:string){const q=normalize(query);return items.filter(i=>normalize(i.label+' '+i.detail).includes(q));}
export function suggestions(input:string,view?:ViewState):Item[]{
  if(/^\/theme\s/.test(input))return filterItems(Object.entries(themes).map(([id,t])=>({label:t.name,detail:id,value:'/theme '+id})),input.replace(/^\/theme\s+/,''));
  if(!/^\/[^\s]*$/.test(input))return [];
  const skills=(view?.skills??[]).filter(s=>!commands.some(c=>c.label==='/'+s.name)).map(s=>({label:'/'+s.name,detail:s.description,value:'/'+s.name+' ',complete:true}));
  return filterItems([...commands,...skills],input);
}
export function modelGroups(view?:ViewState){
  const groups:{label:string;items:Item[]}[]=[];
  for(const [id,label] of [['agy','Gemini · agy'],['claude','Claude'],['codex','Codex']] as const){
    if(view?.backends?.some(b=>b.id===id&&b.installed))groups.push({label,items:modelsOf(view.catalog,id).map(m=>({label:m.label??m.id,detail:m.id,value:`/model ${id} ${m.id}`}))});
  }
  for(const api of view?.api??[])if(api.configured)groups.push({label:api.label,items:(api.models.length?api.models:api.model?[{id:api.model}]:[]).map(m=>({label:m.label??m.id,detail:m.id,value:`/model api ${api.id}/${m.id}`}))});
  return groups;
}
export function currentModel(view?:ViewState,chat?:Chat){const c=chat?.choice??view?.data.preferences.choice;return !c||c==='auto'?'/model auto':`/model ${c.backend} ${c.model}`;}
