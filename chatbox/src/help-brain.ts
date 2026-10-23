import {HELP_SECTIONS,type Block,type HelpSection} from './helpData';

/** Brain riêng cho sách hướng dẫn. Không duyệt dự án, không đọc dữ liệu người dùng. */
export const fold=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase();
export const titleOf=(id:string)=>HELP_SECTIONS.find(s=>s.id===id)?.title??id;
export const plain=(s:string)=>s.replace(/\*\*([^*]+)\*\*/g,'$1').replace(/`([^`]+)`/g,'$1').replace(/\[\[([a-z0-9-]+)\]\]/g,(_,id:string)=>titleOf(id));
export const blockText=(b:Block):string=>b[0]==='ul'||b[0]==='ol'?b[1].map(plain).join('\n'):b[0]==='keys'?b[1].map(([k,d])=>`${k}: ${plain(d)}`).join('\n'):plain(b[1]);
export interface Entry{s:HelpSection;text:string;ft:string;ftitle:string;fkeys:string}
export interface HelpHit{e:Entry;score:number;pos:number}
const words=(s:string)=>fold(s).match(/[a-z0-9]+|[@/#$]+/g)??[];
const stop=new Set(words('tôi mình thầy cô bạn pvta là gì như thế nào làm sao để có thể muốn hỏi về này đó đây ở đâu cách cần cái nút dùng sử dụng cho với của một các và được không hướng dẫn giúp biết hãy'));

export function createHelpBrain(sections:HelpSection[]=HELP_SECTIONS){
 const entries:Entry[]=sections.map(s=>{const text=s.body.map(blockText).join('\n\n');return {s,text,ft:fold(text),ftitle:fold(s.title),fkeys:fold(s.keys)};});
 const postings=new Map<string,Set<number>>();
 entries.forEach((e,i)=>{for(const word of new Set(words(`${e.s.title} ${e.s.keys} ${e.text}`))){if(!postings.has(word))postings.set(word,new Set());postings.get(word)!.add(i);}});
 function search(query:string,limit=8):HelpHit[]{
  const tokens=[...new Set(words(query))];if(!tokens.length)return [];
  const candidates=new Set<number>();
  for(const token of tokens)for(const [word,ids] of postings)if(word.startsWith(token))for(const id of ids)candidates.add(id);
  return [...candidates].map(i=>{
   const e=entries[i]!;let score=0,pos=-1,matched=0;
   for(const token of tokens){const title=e.ftitle.includes(token),keys=e.fkeys.includes(token),at=e.ft.indexOf(token);if(!title&&!keys&&at<0)continue;matched++;
    score+=(title?6:0)+(keys?3:0)+(at>=0?1:0);if(at>=0&&(pos<0||at<pos))pos=at;
   }
   return {e,score:score*matched/tokens.length,pos,matched};
  }).filter(hit=>hit.matched===tokens.length).sort((a,b)=>b.score-a.score).slice(0,limit);
 }
 function ask(question:string,context:{label:string;topic?:string}){
  const tokens=words(question).filter(word=>!stop.has(word));
  const deictic=/\b(nay|day|do)\b/.test(fold(question));
  const contextual=!tokens.length||deictic;
  const query=tokens.join(' ');
  let hits=search(query,3);
  if(contextual&&context.topic){const entry=entries.find(e=>e.s.id===context.topic);if(entry)hits=[{e:entry,score:100,pos:0},...hits.filter(h=>h.e!==entry)].slice(0,3);}
  if(!hits.length&&contextual)hits=search(context.label,3);
  return hits;
 }
 return {index:()=>({sections:entries.length,terms:postings.size}),search,read:(id:string)=>entries.find(e=>e.s.id===id),ask};
}
let cached:ReturnType<typeof createHelpBrain>|undefined;
/** Dựng một lần; hai giao diện dùng chung chỉ mục, không lập lại mỗi câu hỏi. */
export const helpBrain=()=>cached??(cached=createHelpBrain());
