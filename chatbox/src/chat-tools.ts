import {BUILTIN_PROMPTS,foldVi,type LibraryPrompt} from '@pvta/shared';
import type {ViewState} from './ipc';
import {effectiveRules,type RuleScopeKind} from './profile';

type Data=ViewState['data'];
type Chat=Data['chats'][number];
type Attachment=Data['attachments'][number];
type Rule=NonNullable<Data['ruleBook']>[number];
type Skill=ViewState['skills'][number];

/** Số mục tối đa ở nhóm "thường dùng" của mỗi loại. */
export const COMMON_LIMIT=8;

export interface ToolRule extends Rule {scope:RuleScopeKind;uses:number;reason:'chat'|'always'|'mentioned'|'common'}
export interface ToolSkill {name:string;description:string;uses:number;reason:'mentioned'|'common'}
export interface ToolPrompt {id:string;title:string;text:string;desc?:string;favorite:boolean;own:boolean;uses:number;reason:'used'|'favorite'|'common'}
export interface ToolFile {key:string;name:string;path:string;image:boolean;origin:'user'|'ai';at:number;attachment?:Attachment}
export interface Section<T>{inChat:T[];common:T[]}
export interface ChatTools {rules:Section<ToolRule>;skills:Section<ToolSkill>;prompts:Section<ToolPrompt>;files:ToolFile[]}

const IMAGE=/\.(png|jpe?g|gif|webp|bmp|svg|heic|tiff?)$/i;
const userTexts=(c:Chat)=>c.messages.filter(m=>m.role==='user').map(m=>m.text);

/** Đếm các token `#khóa` hoặc `/tên` đứng đầu hoặc sau khoảng trắng. Khóa so không phân biệt hoa thường và dấu. */
export function countTokens(texts:string[],char:'#'|'/'):Map<string,number>{
 const out=new Map<string,number>();const re=char==='#'?/(?:^|\s)#([^\s#]+)/gu:/(?:^|\s)\/([a-z0-9][a-z0-9-]*)/giu;
 for(const t of texts)for(const m of t.matchAll(re)){const k=foldVi(m[1]!.replace(/[.,;:!?)]+$/,'')).toLowerCase();if(k)out.set(k,(out.get(k)??0)+1);}
 return out;
}

const norm=(s:string)=>foldVi(s.replace(/\s+/g,' ')).toLowerCase();
/** Các phần cố định của lời nhắc (bỏ ô trống [..]) theo thứ tự; rỗng khi phần cố định quá ngắn để nhận diện chắc chắn. */
export function promptSignature(text:string):string[]{
 const pieces=text.split(/\[[^\]]*\]/).map(s=>norm(s).trim()).filter(Boolean);
 return pieces.join('').length>=12?pieces:[];
}
/** Tin nhắn chứa đủ các phần cố định theo đúng thứ tự (ô trống đã được thầy cô điền). */
export function matchesPrompt(sig:string[],message:string,normalized=false):boolean{
 if(!sig.length)return false;
 const m=normalized?message:norm(message);let from=0;
 for(const piece of sig){const i=m.indexOf(piece,from);if(i<0)return false;from=i+piece.length;}
 return true;
}
/** texts đã qua norm(). */
function promptUses(sig:string[],texts:string[]):number{
 return sig.length?texts.reduce((n,t)=>n+(matchesPrompt(sig,t,true)?1:0),0):0;
}

const key=(s:string)=>foldVi(s).toLowerCase();
const byUses=<T extends {uses:number}>(a:T,b:T)=>b.uses-a.uses;

/** Dữ liệu cho cửa sổ tiện ích của một hội thoại: mục đang dùng trong chat lên trước, sau đó mục thường dùng ở mọi chat. */
export function chatTools(state:Pick<ViewState,'skills'|'prompts'>&{data:Pick<Data,'chats'|'projects'|'attachments'|'ruleBook'>},chatId:string):ChatTools{
 const chat=state.data.chats.find(c=>c.id===chatId);
 const empty={inChat:[],common:[]};
 if(!chat)return {rules:empty,skills:empty,prompts:empty,files:[]};
 const project=chat.projectId?state.data.projects.find(p=>p.id===chat.projectId):undefined;
 const here=userTexts(chat);const everywhere=state.data.chats.flatMap(userTexts);

 // Quy tắc
 const hereRules=countTokens(here,'#');const allRules=countTokens(everywhere,'#');
 const rules=effectiveRules({profile:state.data.ruleBook,project:project?.ruleBook,chat:chat.ruleBook}).map<ToolRule>(r=>{
  const k=key(r.key);const mentioned=hereRules.get(k)??0;
  const reason=r.scope==='chat'?'chat':r.always?'always':mentioned?'mentioned':'common';
  return {...r,uses:reason==='common'?allRules.get(k)??0:mentioned,reason};
 });
 const rulesIn=rules.filter(r=>r.reason!=='common').sort((a,b)=>Number(b.reason==='mentioned')-Number(a.reason==='mentioned')||byUses(a,b));
 const rulesCommon=rules.filter(r=>r.reason==='common').sort(byUses).slice(0,COMMON_LIMIT);

 // Kỹ năng (chỉ kỹ năng đang bật)
 const hereSkills=countTokens(here,'/');const allSkills=countTokens(everywhere,'/');
 const enabled=state.skills.filter((s:Skill)=>s.load!=='off');
 const skillsIn=enabled.filter(s=>hereSkills.has(key(s.name))).map<ToolSkill>(s=>({name:s.name,description:s.description,uses:hereSkills.get(key(s.name))!,reason:'mentioned'})).sort(byUses);
 const skillsCommon=enabled.filter(s=>!hereSkills.has(key(s.name))).map<ToolSkill>(s=>({name:s.name,description:s.description,uses:allSkills.get(key(s.name))??0,reason:'common'}))
  .sort((a,b)=>byUses(a,b)||Number(isOwnSkill(b.name))-Number(isOwnSkill(a.name))).slice(0,COMMON_LIMIT);

 // Lời nhắc mẫu
 const fav=new Set(state.prompts.favorites);
 const hereNorm=here.map(norm);let all:string[]|undefined;const everywhereNorm=()=>all??=everywhere.map(norm);
 const prompts=[...state.prompts.own,...BUILTIN_PROMPTS].map<ToolPrompt>(p=>{
  const sig=promptSignature(p.text);const used=promptUses(sig,hereNorm);
  return {id:p.id,title:p.title,text:p.text,desc:p.desc,favorite:fav.has(p.id),own:!!p.own,uses:used||promptUses(sig,everywhereNorm()),reason:used?'used':fav.has(p.id)?'favorite':'common'};
 });
 const promptsIn=prompts.filter(p=>p.reason==='used').sort(byUses);
 const promptsCommon=prompts.filter(p=>p.reason!=='used'&&(p.favorite||p.uses>0||p.own))
  .sort((a,b)=>Number(b.favorite)-Number(a.favorite)||byUses(a,b)||Number(b.own)-Number(a.own)).slice(0,COMMON_LIMIT);

 return {rules:{inChat:rulesIn,common:rulesCommon},skills:{inChat:skillsIn,common:skillsCommon},prompts:{inChat:promptsIn,common:promptsCommon},files:chatFiles(chat,state.data.attachments)};
}

const isOwnSkill=(name:string)=>!/^(office-|pvta-|learned-|cd-)/.test(name);

/** Tệp của phiên: tệp thầy cô đưa vào (đính kèm của chat) và tệp AI đã tạo/sửa thành công. Mới nhất lên trước, mỗi đường dẫn một dòng. */
export function chatFiles(chat:Chat,attachments:Attachment[]):ToolFile[]{
 const out:ToolFile[]=[];const seen=new Set<string>();
 for(const a of attachments)if(a.scope==='chat'&&a.scopeId===chat.id&&!seen.has(a.path)){seen.add(a.path);out.push({key:`a:${a.id}`,name:a.name,path:a.path,image:!!a.image||IMAGE.test(a.path),origin:'user',at:a.at??0,attachment:a});}
 for(const m of chat.messages)for(const act of m.actions??[]){
  if(act.state!=='done'||act.kind==='open_file'||act.kind==='office_live')continue;
  const paths=act.savedPaths?.length?act.savedPaths:[act.savedPath??act.path].filter(Boolean) as string[];
  for(const p of paths){
   if(seen.has(p)){const prev=out.find(f=>f.path===p);if(prev&&prev.origin==='user')prev.origin='ai';continue;}
   seen.add(p);out.push({key:`o:${act.id}:${p}`,name:p.split(/[\\/]/).pop()??p,path:p,image:IMAGE.test(p),origin:'ai',at:m.at});
  }
 }
 return out.sort((a,b)=>b.at-a.at);
}
